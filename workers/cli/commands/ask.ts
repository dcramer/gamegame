import { getApiUrl } from '../utils';
import { streamSSE, collectTextFromSSE } from '../utils/sse-stream';

export async function askCommand() {
  const args = process.argv.slice(3);

  // Parse flags
  const showVerbose = args.includes('--verbose');

  // Remove all flags from args
  const filteredArgs = args.filter(arg => !arg.startsWith('--'));

  const gameInput = filteredArgs[0];
  const prompt = filteredArgs.slice(1).join(' ');

  if (!gameInput || !prompt) {
    console.error('Usage: pnpm cli ask <game> <prompt> [options]');
    console.error('');
    console.error('<game> can be either a game ID or slug');
    console.error('');
    console.error('Options:');
    console.error('  --verbose    Show detailed execution trace (events, timing, tool calls, performance metrics)');
    console.error('');
    console.error('Examples:');
    console.error('  pnpm cli ask arcs "How do I setup the game?"');
    console.error('  pnpm cli ask arcs "How many players?"');
    console.error('  pnpm cli ask arcs "How many players?" --verbose');
    console.error('');
    process.exit(1);
  }

  // Use the API to resolve game ID (supports both slug and ID)
  const gameIdOrSlug = gameInput;

  // Try to fetch game to verify it exists and get its name
  const gameCheckUrl = `${getApiUrl(false)}/api/games/${gameIdOrSlug}`;
  let gameName: string | undefined;

  try {
    const gameResponse = await fetch(gameCheckUrl);
    if (gameResponse.ok) {
      const game = await gameResponse.json();
      gameName = game.name;
      console.log(`Found game: ${gameName}`);
    }
  } catch (err) {
    // Ignore errors - the chat endpoint will handle invalid games
  }

  const url = `${getApiUrl(false)}/api/games/${gameIdOrSlug}/chat`;

  console.log(`Prompt: ${prompt}`);
  console.log('---\n');

  // Track timing for HTTP operations
  const httpStartTime = Date.now();
  let fetchStartTime = 0;
  let fetchEndTime = 0;
  let firstByteTime = 0;
  let streamEndTime = 0;

  // Tool call tracking for Claude Code-style display
  const toolCallData = new Map<string, { name: string; args: any; startTime: number }>();

  // Helper: Extract primary description from tool arguments
  function getToolDescription(toolName: string, args: any): string {
    switch (toolName) {
      case 'search_resources':
      case 'search_media':
        return args?.query ? `"${args.query}"` : '';
      case 'get_attachment':
        return args?.attachmentId ? `(${args.attachmentId.slice(0, 8)})` : '';
      case 'list_resources':
        return '';
      default:
        return '';
    }
  }

  // Helper: Extract summary from tool result (not available in SSE, would need tool output)
  function getToolSummary(toolName: string, result: any): string {
    // Note: We don't have access to tool results in SSE events currently
    // This would need to be added to the chat-handler if we want result summaries
    return '';
  }

  try {
    fetchStartTime = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            parts: [
              {
                type: 'text',
                text: prompt,
              },
            ],
            id: `msg-${Date.now()}`,
          },
        ],
      }),
    });

    fetchEndTime = Date.now();
    firstByteTime = fetchEndTime;

    if (!response.ok) {
      const error = await response.text();
      console.error(`\nError ${response.status}:`, error);
      process.exit(1);
    }

    // Stream SSE events as they arrive
    let eventCount = 0;
    const sseStream = streamSSE(response);

    const { text: answerText, metadata: messageMetadata } = await collectTextFromSSE(
      sseStream,
      (event) => {
        eventCount++;

        if (showVerbose) {
          console.log(`[DEBUG] Event ${eventCount}:`, event.type, event.data.textDelta ? `(${event.data.textDelta.length} chars)` : '');
        }

        const currentTime = Date.now();

        // Show progress for tool calls - Claude Code style
        if (event.type === 'tool-call-start') {
          // Store tool call data
          toolCallData.set(event.data.toolCallId, {
            name: event.data.toolName,
            args: event.data.args,
            startTime: currentTime,
          });

          // Display tool start - Claude Code style
          const description = getToolDescription(event.data.toolName, event.data.args);
          console.log(`● ${event.data.toolName}${description ? `(${description})` : ''}`);
        }

        if (event.type === 'tool-call-end') {
          // Get stored tool data
          const toolData = toolCallData.get(event.data.toolCallId);
          const duration = event.data.durationMs || 0;
          const summary = getToolSummary(event.data.toolName, null); // No result data available

          // Display tool completion - Claude Code style
          if (summary) {
            console.log(`  ⎿  ${duration}ms - ${summary}\n`);
          } else {
            console.log(`  ⎿  ${duration}ms\n`);
          }

          // Cleanup
          toolCallData.delete(event.data.toolCallId);
        }
      }
    );

    streamEndTime = Date.now();

    if (showVerbose) {
      console.log('[DEBUG] Total events received:', eventCount);
      console.log('[DEBUG] Collected answer text length:', answerText.length);
    }

    console.log('');

    // Display the collected answer text
    try {
      if (!answerText || answerText.trim() === '') {
        throw new Error('No answer text found in response');
      }

      // Try to parse as JSON (expected format)
      let structuredOutput: any;
      try {
        structuredOutput = JSON.parse(answerText.trim());
      } catch (err) {
        // If not JSON, display as plain text
        console.log(answerText.trim());
        console.log('');
        return;
      }

      // Display answer from JSON - clean, no extras
      console.log(structuredOutput.answer || answerText.trim());
      console.log('');

      // Display timing and metrics if --verbose flag is set
      if (showVerbose) {
        const totalHttpTime = streamEndTime - httpStartTime;
        const requestTime = fetchEndTime - fetchStartTime;
        const streamTime = streamEndTime - fetchEndTime;

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🌐 HTTP TIMING');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Total HTTP Time:    ${totalHttpTime}ms`);
        console.log(`  Request/Response: ${requestTime}ms (connection + first byte)`);
        console.log(`  Stream Processing: ${streamTime}ms (receiving and parsing SSE stream)`);
        console.log('');
      }

      // Display performance metrics if available and --verbose flag is set
      if (showVerbose && messageMetadata?.performance) {
        const perf = messageMetadata.performance;
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⚡ PERFORMANCE METRICS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Total Duration: ${perf.totalDurationMs}ms`);
        console.log(`Model: ${messageMetadata.model || 'unknown'}`);
        console.log(`Steps: ${perf.steps.length}`);
        console.log(`Tool Calls: ${perf.toolCallCount}`);
        if (perf.toolCallCount > 0) {
          console.log(`Avg Tool Duration: ${perf.avgToolDurationMs.toFixed(0)}ms`);
        }
        console.log('');
        console.log('Token Usage:');
        console.log(`  Prompt:     ${perf.totalTokens.prompt.toLocaleString()}`);
        console.log(`  Completion: ${perf.totalTokens.completion.toLocaleString()}`);
        if (perf.totalTokens.reasoning) {
          console.log(`  Reasoning:  ${perf.totalTokens.reasoning.toLocaleString()}`);
        }
        console.log(`  Total:      ${perf.totalTokens.total.toLocaleString()}`);

        console.log('');
        console.log('Per-Step Breakdown:');
        perf.steps.forEach((step: any) => {
          console.log(
            `  Step ${step.stepNumber}: ${step.stepDurationMs}ms, ` +
            `${step.toolCalls.length} tools, ${step.tokenUsage.totalTokens} tokens`
          );
          step.toolCalls.forEach((tool: any) => {
            const error = tool.error ? ` ❌ ${tool.error}` : '';
            console.log(`    - ${tool.name}: ${tool.durationMs.toFixed(0)}ms${error}`);
          });
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
      }
    } catch (error) {
      console.error('⚠️  Failed to parse response');
      console.error(error instanceof Error ? error.message : String(error));
      if (showVerbose) {
        console.error('\nRaw answer text:');
        console.error(answerText || '(empty response)');
      }
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('Request failed:', error);
    process.exit(1);
  }
}
