import { streamText, convertToCoreMessages, stepCountIs, Output, type CoreMessage, createUIMessageStreamResponse } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Env, PerformanceMetadata, StepMetrics, ToolMetrics } from '@/types';
import { buildPrompt, getTools, AnswerSchema } from '@/lib/ai/prompt';
import type { ChatRequest } from './schemas';
import { setTag, setContext } from '@/lib/sentry';

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
  console.log('🔍 CHAT DEBUG');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Game: ${context.gameSlug || context.gameId}`);
  console.log(`Model: ${context.model}`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Finish Reason: ${context.finishReason || 'unknown'}`);
  console.log('');

  // Verbose tool call logging
  if (context.response?.messages) {
    console.log('📋 EXECUTION TRACE');
    console.log('');

    let stepNumber = 0;
    for (const message of context.response.messages) {
      stepNumber++;

      if (message.role === 'assistant' && 'toolCalls' in message && message.toolCalls) {
        const toolCalls = message.toolCalls as any[];

        console.log(`Step ${stepNumber}: ${toolCalls.length} tool call(s)`);

        for (let i = 0; i < toolCalls.length; i++) {
          const toolCall = toolCalls[i];
          console.log(`  ${i + 1}. ${toolCall.toolName}`);

          if (toolCall.args) {
            const argsStr = JSON.stringify(toolCall.args, null, 2);
            const lines = argsStr.split('\n');
            // Truncate long args
            const preview = lines.length > 5
              ? lines.slice(0, 5).join('\n') + '\n     ...'
              : argsStr;

            console.log('     Args:');
            preview.split('\n').forEach((line: string) => {
              console.log(`     ${line}`);
            });
          }
        }
        console.log('');
      } else if (message.role === 'assistant') {
        // Assistant text response
        const content = (message as any).content;
        if (content && typeof content === 'string') {
          console.log(`Step ${stepNumber}: TEXT RESPONSE`);
          console.log(`     Length: ${content.length} characters`);
          const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
          console.log(`     Preview: ${preview}`);
          console.log('');
        }
      } else if (message.role === 'tool') {
        // Tool results
        const result = (message as any).content;
        if (result) {
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          const lines = resultStr.split('\n');
          const preview = lines.length > 5
            ? lines.slice(0, 5).join('\n') + '\n     ...'
            : resultStr;

          console.log(`     Result:`);
          preview.split('\n').forEach((line: string) => {
            console.log(`     ${line}`);
          });
          console.log('');
        }
      }
    }
  }

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
  baseUrl: string,
  metadata: Record<string, unknown> = {}
) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY secret');
  }
  if (!env.VECTORIZE) {
    throw new Error('Missing VECTORIZE binding');
  }

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

  // Callback passed to tools for performance tracking
  const onToolComplete = (toolMetrics: ToolMetrics) => {
    currentStepToolMetrics.push(toolMetrics);
    performanceMetrics.toolCallCount++;
  };

  const tools = getTools(
    game.id,
    env.DB,
    env.VECTORIZE,
    env.OPENAI_API_KEY,
    baseUrl,
    env.ENVIRONMENT,
    onToolComplete
  );
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

  // Convert validated messages to CoreMessage format
  // Note: body.messages has been validated by Zod to have role, content, and id fields
  // We use 'as any' here because Zod's passthrough() adds an index signature that conflicts
  // with the AI SDK's UIMessage type, but the runtime structure is compatible
  let coreMessages: CoreMessage[];
  try {
    coreMessages = convertToCoreMessages(body.messages as any);
  } catch (err) {
    console.error('Error converting messages:', err);
    throw new Error(`Failed to convert messages: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Use configured chat model or default to gpt-5
  const chatModel = env.CHAT_MODEL || DEFAULT_CHAT_MODEL;

  const telemetryMetadata = {
    gameId: game.id,
    ...(game.slug && { gameSlug: game.slug }),
    environment: env.ENVIRONMENT || 'development',
    model: chatModel,
    ...metadata,
  };

  // Set Sentry tags for filtering
  setTag('game_id', game.id);
  setTag('model', chatModel);
  setTag('environment', env.ENVIRONMENT || 'development');
  if (game.slug) {
    setTag('game_slug', game.slug);
  }

  const result = streamText({
    model: openai(chatModel),
    system: buildPrompt(game),
    messages: coreMessages,
    tools,
    stopWhen: stepCountIs(50), // Allow up to 50 steps for multi-tool interactions
    experimental_output: Output.object({
      schema: AnswerSchema,
    }),
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'chat',
      metadata: telemetryMetadata,
      recordInputs: true,   // Record prompts and tool inputs
      recordOutputs: true,  // Record completions and tool outputs
    },

    // Capture metrics after each step
    onStepFinish: async (stepResult) => {
      const now = Date.now();
      currentStep++;

      // Cast usage to any to access properties (type definition is incomplete)
      const stepUsage = stepResult.usage as any;
      const usage = {
        promptTokens: stepUsage.promptTokens ?? 0,
        completionTokens: stepUsage.completionTokens ?? 0,
        totalTokens: stepUsage.totalTokens ?? 0,
        reasoningTokens: stepUsage.reasoningTokens,
      };

      // Capture step metrics
      const stepMetrics: StepMetrics = {
        stepNumber: currentStep,
        durationMs: now - startTime,
        stepDurationMs: now - lastStepTime,
        finishReason: stepResult.finishReason,
        tokenUsage: usage,
        toolCalls: [...currentStepToolMetrics],
      };

      performanceMetrics.steps.push(stepMetrics);

      // Update totals
      performanceMetrics.totalTokens.prompt += usage.promptTokens;
      performanceMetrics.totalTokens.completion += usage.completionTokens;
      performanceMetrics.totalTokens.total += usage.totalTokens;
      if (usage.reasoningTokens) {
        performanceMetrics.totalTokens.reasoning =
          (performanceMetrics.totalTokens.reasoning ?? 0) + usage.reasoningTokens;
      }

      // Clear tool metrics buffer for next step
      currentStepToolMetrics.length = 0;
      lastStepTime = now;
    },

    onFinish: async ({ usage, finishReason, response }: any) => {
      const endTime = Date.now();
      performanceMetrics.totalDurationMs = endTime - startTime;

      // Calculate average tool duration
      const allToolCalls = performanceMetrics.steps.flatMap((s) => s.toolCalls);
      if (allToolCalls.length > 0) {
        const totalToolTime = allToolCalls.reduce((sum, t) => sum + t.durationMs, 0);
        performanceMetrics.avgToolDurationMs = totalToolTime / allToolCalls.length;
      }

      // Set usage context for the entire transaction
      if (usage) {
        setContext('token_usage', {
          input_tokens: usage.promptTokens,
          output_tokens: usage.completionTokens,
          total_tokens: usage.totalTokens,
        });
      }

      const steps = response?.messages?.length || 0;
      setContext('generation_info', {
        step_count: steps,
        finish_reason: finishReason,
      });

      // Set performance context for Sentry
      setContext('performance', performanceMetrics);

      console.log('Stream finished:', {
        finishReason,
        usage,
        steps,
      });

      // Log debug information if enabled via env vars
      logChatDebug(env, {
        gameId: game.id,
        gameSlug: game.slug,
        model: chatModel,
        startTime,
        usage,
        finishReason,
        response,
      });
    },
  });

  // Return streaming UI message response with performance metadata
  // NOTE: experimental_output streams JSON as text in message.content
  // Frontend should use parsePartialJson from @ai-sdk/ui-utils to parse it
  return result.toUIMessageStreamResponse({
    messageMetadata: async () => ({
      performance: performanceMetrics,
      model: chatModel,
      gameId: game.id,
      timestamp: Date.now(),
    }),
  });
}
