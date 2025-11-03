import { Agent, run, setDefaultOpenAIKey } from '@openai/agents';
import type { Env, PerformanceMetadata, StepMetrics, ToolMetrics } from '@/types';
import { buildPrompt, AnswerSchema } from '@/lib/ai/prompt';
import { getAgentTools } from '@/lib/ai/tools';
import type { ChatRequest } from './schemas';
import { setTag } from '@/lib/sentry';

// NOTE: gpt-5 is REAL and should NOT be changed to gpt-4o or any other model.
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
  const agent = new Agent({
    name: 'GameGame Assistant',
    instructions: buildPrompt(game),
    tools,
    outputType: AnswerSchema,
    model: chatModel,
    modelConfig: {
      reasoning_effort: 'low', // Reduce reasoning tokens for faster responses
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
          // Map OpenAI Agents SDK events to our SSE format
          if (event.type === 'run_item_stream_event') {
            // RunItemStreamEvent has a 'name' property with the actual event type
            const itemEvent = event as any;

            switch (itemEvent.name) {
              case 'tool_called':
                const toolName = itemEvent.item?.rawItem?.name || itemEvent.item?.name;
                const toolCallId = itemEvent.item?.id;
                const toolArgs = itemEvent.item?.rawItem?.arguments || itemEvent.item?.arguments;

                // Track tool call start
                toolCallMetrics.set(toolCallId, {
                  startTime: Date.now(),
                  name: toolName,
                  args: toolArgs ? JSON.parse(toolArgs) : undefined,
                });

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

                // Calculate duration
                const callData = toolCallMetrics.get(outputToolCallId);
                const durationMs = callData ? Date.now() - callData.startTime : 0;

                sendSSE({
                  type: 'tool-call-end',
                  toolName: outputToolName,
                  toolCallId: outputToolCallId,
                  durationMs,
                  args: callData?.args,
                });

                // Cleanup
                toolCallMetrics.delete(outputToolCallId);
                break;

              case 'reasoning_item_created':
                // LLM is thinking - send a thinking event
                sendSSE({
                  type: 'thinking',
                  timestamp: Date.now(),
                });
                break;
            }
          } else if (event.type === 'raw_model_stream_event') {
            // Raw streaming events from the model
            const rawEvent = event as any;

            // Capture token usage from response_done events
            if (rawEvent.data?.type === 'response_done' && rawEvent.data?.response?.usage) {
              const usage = rawEvent.data.response.usage;

              performanceMetrics.totalTokens.prompt += usage.inputTokens || 0;
              performanceMetrics.totalTokens.completion += usage.outputTokens || 0;
              performanceMetrics.totalTokens.total += usage.totalTokens || 0;

              // Capture reasoning tokens if available
              if (usage.outputTokensDetails?.reasoning_tokens) {
                performanceMetrics.totalTokens.reasoning =
                  (performanceMetrics.totalTokens.reasoning || 0) + usage.outputTokensDetails.reasoning_tokens;
              }
            }
          }

          // Track step completion for performance metrics
          if ((event as any).name === 'step_completed') {
            currentStep++;
            const stepEndTime = Date.now();
            const stepMetrics: StepMetrics = {
              stepNumber: currentStep,
              durationMs: stepEndTime - startTime,
              stepDurationMs: stepEndTime - lastStepTime,
              finishReason: 'completed',
              tokenUsage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              },
              toolCalls: [...currentStepToolMetrics],
            };
            performanceMetrics.steps.push(stepMetrics);
            currentStepToolMetrics.length = 0;
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
