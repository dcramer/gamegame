import { getApiUrl } from '../utils';

export async function askCommand() {
  const args = process.argv.slice(3);

  // Parse flags
  const showTiming = args.includes('--timing');
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
    console.error('  --timing     Show performance metrics (duration, tokens, tool calls)');
    console.error('  --verbose    Show detailed execution trace (use with --timing)');
    console.error('');
    console.error('Examples:');
    console.error('  pnpm cli ask arcs "How do I setup the game?"');
    console.error('  pnpm cli ask arcs "How many players?"');
    console.error('  pnpm cli ask arcs "How many players?" --timing');
    console.error('  pnpm cli ask arcs "How many players?" --timing --verbose');
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

  try {
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

    if (!response.ok) {
      const error = await response.text();
      console.error(`\nError ${response.status}:`, error);
      process.exit(1);
    }

    // Log rate limit headers
    const rateLimit = response.headers.get('X-RateLimit-Limit');
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');

    if (rateLimit) {
      console.log(
        `[Rate Limit: ${remaining}/${rateLimit}, resets at ${new Date(parseInt(reset!) * 1000).toLocaleTimeString()}]\n`
      );
    }

    // Get response text (SSE stream)
    const fullResponse = await response.text();

    // Parse SSE stream
    let messageMetadata: any = null;
    let answerText = '';

    const lines = fullResponse.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6); // Remove 'data: ' prefix

        if (data === '[DONE]') {
          break;
        }

        try {
          const event = JSON.parse(data);

          // Collect text deltas to build the answer
          if (event.type === 'text-delta' && event.textDelta) {
            answerText += event.textDelta;
          }

          // Capture metadata from finish event
          if (event.type === 'finish' && event.messageMetadata) {
            messageMetadata = event.messageMetadata;
          }

          // For backward compatibility, also check message-metadata events
          if (event.type === 'message-metadata' && event.messageMetadata) {
            messageMetadata = event.messageMetadata;
          }
        } catch (err) {
          // Ignore parse errors for individual events
        }
      }
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

      // Display answer from JSON
      console.log(structuredOutput.answer || answerText.trim());
      console.log('');

      // Display confidence if low or medium
      if (structuredOutput.confidence && structuredOutput.confidence !== 'high') {
        console.log(`⚠️  Confidence: ${structuredOutput.confidence}`);
        console.log('');
      }

      // Display ambiguities
      if (structuredOutput.ambiguities && structuredOutput.ambiguities.length > 0) {
        console.log('⚠️  Ambiguities:');
        structuredOutput.ambiguities.forEach((amb: string) => {
          console.log(`  - ${amb}`);
        });
        console.log('');
      }

      // Display citations
      if (structuredOutput.citations && structuredOutput.citations.length > 0) {
        console.log('Sources:');
        structuredOutput.citations.forEach((citation: any) => {
          const pageInfo = citation.pageNumber
            ? ` (page ${citation.pageNumber})`
            : citation.pageRange
              ? ` (pages ${citation.pageRange[0]}-${citation.pageRange[1]})`
              : '';
          const section = citation.section ? ` - ${citation.section}` : '';
          console.log(`  • ${citation.resourceName}${pageInfo}${section}`);

          if (citation.quote) {
            console.log(`    "${citation.quote}"`);
          }
        });
        console.log('');
      }

      // Display follow-ups
      if (structuredOutput.followUps && structuredOutput.followUps.length > 0) {
        console.log('Follow-up questions:');
        structuredOutput.followUps.forEach((followUp: any) => {
          // Handle both simple strings and structured objects
          const question = typeof followUp === 'string' ? followUp : followUp.question;
          const category = typeof followUp === 'object' && followUp.category ? `[${followUp.category}]` : '';
          console.log(`  ${category}${category ? ' ' : ''}${question}`);
        });
        console.log('');
      }

      // Display performance metrics if --timing flag is set
      if (showTiming && messageMetadata?.performance) {
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

        if (showVerbose) {
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
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
      }
    } catch (error) {
      console.error('⚠️  Failed to parse response');
      console.error(error instanceof Error ? error.message : String(error));
      if (showVerbose) {
        console.error('\nRaw response:');
        console.error(fullResponse || '(empty response)');
      }
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('Request failed:', error);
    process.exit(1);
  }
}
