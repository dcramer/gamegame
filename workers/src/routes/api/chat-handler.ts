import { Agent, run, setDefaultOpenAIKey } from '@openai/agents';
import type { Env, PerformanceMetadata, StepMetrics, ToolMetrics } from '@/types';
import { buildPrompt, AnswerSchema } from '@/lib/ai/prompt';
import { getAgentTools } from '@/lib/ai/tools';
import type { ChatRequest } from './schemas';
import { setTag } from '@/lib/sentry';

// NOTE: gpt-5 is the production model and should not be downgraded.
// This is the actual production model in use.
export const DEFAULT_CHAT_MODEL = 'gpt-5';

/**
 * Log detailed chat execution trace to stdout
 * Controlled by CHAT_DEBUG_VERBOSE env var
 */
function logChatDebug(
  env: Env,
  context: {
    gameId: string;
    gameSlug?: string | null;
    model: string;
    startTime: number;
    usage?: any;
    finishReason?: string;
    response?: any;
  }
) {
  const verbose = env.CHAT_DEBUG_VERBOSE === 'true';

  if (!verbose) {
    return;
  }

  const duration = Date.now() - context.startTime;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 CHAT DEBUG (OpenAI Agents SDK)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Game: ${context.gameSlug || context.gameId}`);
  console.log(`Model: ${context.model}`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Finish Reason: ${context.finishReason || 'unknown'}`);
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

interface GameSummary {
  id: string;
  slug?: string | null;
  name: string;
  bggUrl?: string | null;
}

export async function streamChatResponse(
  env: Env,
  game: GameSummary,
  body: ChatRequest,
  baseUrl: string
) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY secret');
  }
  if (!env.VECTORIZE) {
    throw new Error('Missing VECTORIZE binding');
  }

  // Configure OpenAI API key for Agents SDK
  setDefaultOpenAIKey(env.OPENAI_API_KEY);

  const startTime = Date.now();
  let currentStep = 0;
  let lastStepTime = startTime;

  // Performance tracking state
  const performanceMetrics: PerformanceMetadata = {
    totalDurationMs: 0,
    steps: [],
    totalTokens: {
      prompt: 0,
      completion: 0,
      total: 0,
    },
    toolCallCount: 0,
    avgToolDurationMs: 0,
  };

  // Buffer for tool metrics within current step
  const currentStepToolMetrics: ToolMetrics[] = [];

  // Map to track tool call start times and metrics
  const toolCallMetrics = new Map<string, { startTime: number; name: string; args?: any }>();

  // Track token usage for current step
  const currentStepTokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
  };

  // Callback passed to tools for performance tracking
  const onToolComplete = (toolMetrics: ToolMetrics) => {
    currentStepToolMetrics.push(toolMetrics);
    performanceMetrics.toolCallCount++;
  };

  const tools = getAgentTools(
    game.id,
    env.DB,
    env.VECTORIZE,
    env.OPENAI_API_KEY,
    baseUrl,
    env.ENVIRONMENT,
    onToolComplete
  );

  // Use configured chat model or default to gpt-5
  const chatModel = env.CHAT_MODEL || DEFAULT_CHAT_MODEL;

  // Set Sentry tags for filtering
  setTag('game_id', game.id);
  setTag('model', chatModel);
  setTag('environment', env.ENVIRONMENT || 'development');
  if (game.slug) {
    setTag('game_slug', game.slug);
  }

  // Create agent with instructions and tools
  // Enable reasoning summaries to expose model's thought process
  const agent = new Agent({
    name: 'GameGame Assistant',
    instructions: buildPrompt(game),
    tools,
    outputType: AnswerSchema,
    model: chatModel,
    modelSettings: {
      providerData: {
        reasoning: {
          effort: 'minimal', // Minimal reasoning effort for faster responses
          summary: 'auto',   // Enable reasoning summaries
        },
      },
    },
    // Note: maxTurns is set via run() options, not Agent config
  });

  // Extract last user message text
  // For now, we'll use simple single-turn (just the last message)
  // Multi-turn history management can be added later
  const lastMessage = body.messages[body.messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user' || !lastMessage.parts) {
    throw new Error('Last message must be from user');
  }

  const textParts = lastMessage.parts.filter((p: any) => p.type === 'text');
  const userText = textParts.map((p: any) => p.text).join('\n');

  if (!userText || userText.trim() === '') {
    throw new Error('User message cannot be empty');
  }

  // Add 60 second timeout for agent responses
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error('Agent timeout: 60 seconds exceeded');
    abortController.abort();
  }, 60000);

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendSSE = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Enable streaming for real-time progress
        // Note: maxTurns limit increased from SDK default (10) to handle complex multi-tool queries
        const result = await run(agent, userText, {
          stream: true,
          maxTurns: 50,
        });

        clearTimeout(timeoutId);

        // Iterate over stream events
        for await (const event of result) {
          // Debug: log all event types to understand SDK event structure
          if (env.CHAT_DEBUG_VERBOSE === 'true') {
            console.log(`[Event Debug] type: ${event.type}, name: ${(event as any).name || 'N/A'}`);
          }

          // Map OpenAI Agents SDK events to our SSE format
          if (event.type === 'run_item_stream_event') {
            // RunItemStreamEvent has a 'name' property with the actual event type
            const itemEvent = event as any;

            switch (itemEvent.name) {
              case 'tool_called':
                const toolName = itemEvent.item?.rawItem?.name || itemEvent.item?.name;
                const toolCallId = itemEvent.item?.id;
                const toolArgs = itemEvent.item?.rawItem?.arguments || itemEvent.item?.arguments;

                // Track tool call start time
                const startTime = Date.now();
                toolCallMetrics.set(toolCallId, {
                  startTime,
                  name: toolName,
                  args: toolArgs ? JSON.parse(toolArgs) : undefined,
                });

                console.log(`[DURATION DEBUG] tool_called: ${toolName} (${toolCallId}) at ${startTime}`);

                sendSSE({
                  type: 'tool-call-start',
                  toolName,
                  toolCallId,
                  args: toolArgs ? JSON.parse(toolArgs) : undefined,
                });
                break;

              case 'tool_output':
                const outputToolName = itemEvent.item?.rawItem?.name || itemEvent.item?.name;
                const outputToolCallId = itemEvent.item?.id;

                // Calculate duration from SSE event timing (wall-clock time from start to end)
                const callData = toolCallMetrics.get(outputToolCallId);

                if (!callData) {
                  console.warn(`[Agent] tool_output received for ${outputToolName} (${outputToolCallId}) without matching tool_called event`);
                } else if (callData.name !== outputToolName) {
                  console.warn(`[Agent] tool_output name mismatch: expected ${callData.name}, got ${outputToolName} for ID ${outputToolCallId}`);
                }

                const endTime = Date.now();
                const durationMs = callData ? endTime - callData.startTime : undefined;

                console.log(`[DURATION DEBUG] tool_output: ${outputToolName} (${outputToolCallId}) at ${endTime}, startTime: ${callData?.startTime}, duration: ${durationMs ?? 'unknown'}ms`);

                sendSSE({
                  type: 'tool-call-end',
                  toolName: outputToolName,
                  toolCallId: outputToolCallId,
                  ...(durationMs !== undefined && { durationMs }), // Only include if we have timing data
                  args: callData?.args,
                });

                // Cleanup
                toolCallMetrics.delete(outputToolCallId);
                break;

              case 'reasoning_item_created':
                // LLM is thinking - extract reasoning summary if available
                const reasoningItem = itemEvent.item;

                // Debug: log the full event structure to see what's available
                if (env.CHAT_DEBUG_VERBOSE === 'true') {
                  console.log('[Reasoning Event]', JSON.stringify(reasoningItem, null, 2));
                }

                // Extract reasoning summary text from the item
                // Structure: reasoningItem.summary[0].text
                let reasoningSummary = null;
                if (reasoningItem?.summary && Array.isArray(reasoningItem.summary) && reasoningItem.summary.length > 0) {
                  reasoningSummary = reasoningItem.summary[0].text;
                } else if (reasoningItem?.content) {
                  // Fallback to content field
                  reasoningSummary = reasoningItem.content;
                } else if (reasoningItem?.text) {
                  // Fallback to text field
                  reasoningSummary = reasoningItem.text;
                }

                // Send thinking event with reasoning summary
                sendSSE({
                  type: 'thinking',
                  timestamp: Date.now(),
                  ...(reasoningSummary && { content: reasoningSummary }),
                });
                break;
            }
          } else if (event.type === 'raw_model_stream_event') {
            // Raw streaming events from the model
            const rawEvent = event as any;

            // Capture token usage from response_done events
            if (rawEvent.data?.type === 'response_done' && rawEvent.data?.response?.usage) {
              const usage = rawEvent.data.response.usage;

              // Add to total metrics
              performanceMetrics.totalTokens.prompt += usage.inputTokens || 0;
              performanceMetrics.totalTokens.completion += usage.outputTokens || 0;
              performanceMetrics.totalTokens.total += usage.totalTokens || 0;

              // Add to current step metrics
              currentStepTokenUsage.promptTokens += usage.inputTokens || 0;
              currentStepTokenUsage.completionTokens += usage.outputTokens || 0;
              currentStepTokenUsage.totalTokens += usage.totalTokens || 0;

              // Capture reasoning tokens if available
              if (usage.outputTokensDetails?.reasoning_tokens) {
                const reasoningTokens = usage.outputTokensDetails.reasoning_tokens;
                performanceMetrics.totalTokens.reasoning =
                  (performanceMetrics.totalTokens.reasoning || 0) + reasoningTokens;
                currentStepTokenUsage.reasoningTokens += reasoningTokens;
              }
            }
          }

          // Track step completion for performance metrics
          // Add defensive type checking for SDK event structure
          if (event && typeof event === 'object' && 'name' in event && (event as any).name === 'step_completed') {
            currentStep++;
            const stepEndTime = Date.now();
            const stepMetrics: StepMetrics = {
              stepNumber: currentStep,
              durationMs: stepEndTime - startTime,
              stepDurationMs: stepEndTime - lastStepTime,
              finishReason: 'completed',
              tokenUsage: {
                promptTokens: currentStepTokenUsage.promptTokens,
                completionTokens: currentStepTokenUsage.completionTokens,
                totalTokens: currentStepTokenUsage.totalTokens,
                ...(currentStepTokenUsage.reasoningTokens > 0 && { reasoningTokens: currentStepTokenUsage.reasoningTokens }),
              },
              toolCalls: [...currentStepToolMetrics],
            };
            performanceMetrics.steps.push(stepMetrics);

            // Reset current step tracking
            currentStepToolMetrics.length = 0;
            currentStepTokenUsage.promptTokens = 0;
            currentStepTokenUsage.completionTokens = 0;
            currentStepTokenUsage.totalTokens = 0;
            currentStepTokenUsage.reasoningTokens = 0;
            lastStepTime = stepEndTime;
          }
        }

        // Get the final output after stream completes
        const finalOutput = result.finalOutput;

        if (!finalOutput) {
          throw new Error('No output from agent');
        }

        // Calculate performance metrics
        const endTime = Date.now();
        performanceMetrics.totalDurationMs = endTime - startTime;

        // Send the complete result as JSON
        const jsonText = JSON.stringify(finalOutput);
        sendSSE({ type: 'text-delta', textDelta: jsonText });

        // Send finish event with metadata
        sendSSE({
          type: 'finish',
          messageMetadata: {
            performance: performanceMetrics,
            model: chatModel,
            gameId: game.id,
            timestamp: Date.now(),
          },
        });

        // Send done signal
        sendSSE('[DONE]');

        // Clean up tool call tracking map
        toolCallMetrics.clear();

        controller.close();

        // Log debug information
        logChatDebug(env, {
          gameId: game.id,
          gameSlug: game.slug,
          model: chatModel,
          startTime,
          finishReason: 'stop',
        });
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('[Agent] Stream error:', error);
        sendSSE({
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
        // Clean up tool call tracking map on error
        toolCallMetrics.clear();
        controller.close();
      }
    },
  });

  // Return SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
