/**
 * Example implementation of performance metadata streaming
 *
 * This file shows concrete code changes needed to add performance
 * tracking to the chat handler.
 */

import { streamText, convertToCoreMessages } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Env } from '@/types';
import { buildPrompt, getToolsWithTracking } from '@/lib/ai/prompt';
import type { ChatRequest } from './schemas';

// ============================================================================
// Types
// ============================================================================

interface ToolMetrics {
  name: string;
  durationMs: number;
  timestamp: number;
  args?: any;
  error?: string;
}

interface StepMetrics {
  stepNumber: number;
  durationMs: number; // Duration from start to step completion
  stepDurationMs: number; // Duration of just this step
  finishReason: string;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    reasoningTokens?: number;
  };
  toolCalls: ToolMetrics[];
}

interface PerformanceMetadata {
  totalDurationMs: number;
  steps: StepMetrics[];
  totalTokens: {
    prompt: number;
    completion: number;
    total: number;
    reasoning?: number;
  };
  toolCallCount: number;
  avgToolDurationMs: number;
}

// ============================================================================
// Modified Chat Handler
// ============================================================================

export async function streamChatResponse(
  env: Env,
  game: { id: string; slug?: string | null; name: string; bggUrl?: string | null },
  body: ChatRequest,
  baseUrl: string,
  metadata: Record<string, unknown> = {}
) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY secret');
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

  // Get tools with performance tracking injected
  const tools = getToolsWithTracking(
    game.id,
    env.DB,
    env.VECTORIZE,
    env.OPENAI_API_KEY,
    baseUrl,
    env.ENVIRONMENT,
    onToolComplete
  );

  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const coreMessages = convertToCoreMessages(body.messages as any);
  const chatModel = env.CHAT_MODEL || 'gpt-5';

  const result = streamText({
    model: openai(chatModel),
    system: buildPrompt(game),
    messages: coreMessages,
    tools,

    experimental_telemetry: {
      isEnabled: true,
      functionId: 'chat',
      metadata: {
        gameId: game.id,
        ...(game.slug && { gameSlug: game.slug }),
        environment: env.ENVIRONMENT || 'development',
        model: chatModel,
        ...metadata,
      },
      recordInputs: true,
      recordOutputs: true,
    },

    // Capture metrics after each step
    onStepFinish: async (stepResult) => {
      const now = Date.now();
      currentStep++;

      const usage = {
        promptTokens: stepResult.usage.promptTokens ?? 0,
        completionTokens: stepResult.usage.completionTokens ?? 0,
        totalTokens: stepResult.usage.totalTokens ?? 0,
        reasoningTokens: (stepResult.usage as any).reasoningTokens,
      };

      // Capture step metrics
      const stepMetrics: StepMetrics = {
        stepNumber: currentStep,
        durationMs: now - startTime, // Total time from start
        stepDurationMs: now - lastStepTime, // Time for this step only
        finishReason: stepResult.finishReason,
        tokenUsage: usage,
        toolCalls: [...currentStepToolMetrics], // Copy tool metrics
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

    onFinish: async ({ usage, finishReason }) => {
      const endTime = Date.now();
      performanceMetrics.totalDurationMs = endTime - startTime;

      // Calculate average tool duration
      const allToolCalls = performanceMetrics.steps.flatMap((s) => s.toolCalls);
      if (allToolCalls.length > 0) {
        const totalToolTime = allToolCalls.reduce((sum, t) => sum + t.durationMs, 0);
        performanceMetrics.avgToolDurationMs = totalToolTime / allToolCalls.length;
      }

      // Log if debug enabled
      if (env.CHAT_DEBUG_TIMING === 'true') {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎯 PERFORMANCE SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Total Duration: ${performanceMetrics.totalDurationMs}ms`);
        console.log(`Steps: ${performanceMetrics.steps.length}`);
        console.log(`Total Tokens: ${performanceMetrics.totalTokens.total}`);
        console.log(`Tool Calls: ${performanceMetrics.toolCallCount}`);
        console.log(`Avg Tool Duration: ${performanceMetrics.avgToolDurationMs.toFixed(0)}ms`);
        console.log('');
        console.log('Per-Step Breakdown:');
        performanceMetrics.steps.forEach((step) => {
          console.log(
            `  Step ${step.stepNumber}: ${step.stepDurationMs}ms, ` +
              `${step.toolCalls.length} tools, ${step.tokenUsage.totalTokens} tokens`
          );
          step.toolCalls.forEach((tool) => {
            console.log(`    - ${tool.name}: ${tool.durationMs}ms`);
          });
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
    },
  });

  // Return stream with performance metadata attached
  return result.toUIMessageStreamResponse({
    messageMetadata: async () => ({
      performance: performanceMetrics,
      model: chatModel,
      gameId: game.id,
      timestamp: Date.now(),
    }),
  });
}

// ============================================================================
// Modified Tools with Performance Tracking (lib/ai/prompt.ts)
// ============================================================================

import { tool } from 'ai';
import { z } from 'zod';
import type { D1Database, VectorizeIndex } from '@cloudflare/workers-types';

/**
 * Wraps a tool's execute function with performance tracking
 */
function withPerformanceTracking<TArgs, TResult>(
  toolName: string,
  execute: (args: TArgs) => Promise<TResult>,
  onComplete: (metrics: ToolMetrics) => void
): (args: TArgs) => Promise<TResult> {
  return async (args: TArgs): Promise<TResult> => {
    const startTime = performance.now();
    const timestamp = Date.now();

    try {
      const result = await execute(args);
      const durationMs = performance.now() - startTime;

      onComplete({
        name: toolName,
        durationMs,
        timestamp,
        args, // Include args for debugging (be careful with PII)
      });

      return result;
    } catch (error) {
      const durationMs = performance.now() - startTime;

      onComplete({
        name: toolName,
        durationMs,
        timestamp,
        args,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  };
}

export function getToolsWithTracking(
  gameId: string,
  db: D1Database,
  vectorIndex: VectorizeIndex,
  openaiApiKey: string,
  baseUrl: string,
  environment?: string,
  onToolComplete?: (metrics: ToolMetrics) => void
) {
  const noop = () => {};
  const trackingCallback = onToolComplete ?? noop;

  return {
    finish: tool({
      description:
        'Call this tool when you have gathered all necessary information and are ready to provide your final JSON response.',
      inputSchema: z.object({}),
      execute: withPerformanceTracking(
        'finish',
        async () => 'done',
        trackingCallback
      ),
    }),

    search_resources: tool({
      description:
        'Search rulebook text for rules, setup instructions, gameplay mechanics, clarifications, and game information.',
      inputSchema: z.object({
        query: z.string().describe('What to search for'),
        resourceType: z
          .enum(['all', 'rulebook', 'expansion', 'faq', 'errata'])
          .default('all')
          .describe('Optional: limit to specific resource type'),
      }),
      execute: withPerformanceTracking(
        'search_resources',
        async ({ query, resourceType }) => {
          const { findRelevantContent } = await import('./search');
          return findRelevantContent(db, vectorIndex, gameId, query, openaiApiKey, {
            fragmentType: 'text',
            resourceType: resourceType === 'all' ? undefined : resourceType,
            environment,
            enableReranking: false,
          });
        },
        trackingCallback
      ),
    }),

    search_media: tool({
      description:
        'Find diagrams, setup photos, component images, and visual aids from rulebooks.',
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            'What image/diagram to find (e.g., "setup diagram", "game board", "player board")'
          ),
      }),
      execute: withPerformanceTracking(
        'search_media',
        async ({ query }) => {
          const { findRelevantContent } = await import('./search');
          return findRelevantContent(db, vectorIndex, gameId, query, openaiApiKey, {
            fragmentType: 'image',
            limit: 5,
            environment,
            enableReranking: false,
          });
        },
        trackingCallback
      ),
    }),

    // ... other tools similarly wrapped
  };
}

// ============================================================================
// Client-Side Usage Example (React)
// ============================================================================

/**
 * Example of accessing performance metadata in a React component
 */
function ChatInterface({ gameId }: { gameId: string }) {
  const { messages, append, isLoading } = useChat({
    api: `/api/games/${gameId}/chat`,
    onFinish: (message) => {
      // Access performance metadata
      const metadata = message.metadata as {
        performance?: PerformanceMetadata;
        model?: string;
        timestamp?: number;
      };

      if (metadata?.performance) {
        const perf = metadata.performance;

        console.table({
          'Total Duration': `${perf.totalDurationMs}ms`,
          'Steps': perf.steps.length,
          'Tool Calls': perf.toolCallCount,
          'Avg Tool Time': `${perf.avgToolDurationMs.toFixed(0)}ms`,
          'Total Tokens': perf.totalTokens.total,
          'Prompt Tokens': perf.totalTokens.prompt,
          'Completion Tokens': perf.totalTokens.completion,
        });

        // Send to analytics
        if (window.analytics) {
          window.analytics.track('Chat Completed', {
            gameId,
            durationMs: perf.totalDurationMs,
            stepCount: perf.steps.length,
            toolCallCount: perf.toolCallCount,
            totalTokens: perf.totalTokens.total,
            model: metadata.model,
          });
        }

        // Display in dev mode
        if (process.env.NODE_ENV === 'development') {
          console.group('📊 Chat Performance Details');
          perf.steps.forEach((step, i) => {
            console.log(
              `Step ${step.stepNumber}: ${step.stepDurationMs}ms ` +
                `(${step.toolCalls.length} tools, ${step.tokenUsage.totalTokens} tokens)`
            );
            step.toolCalls.forEach((tool) => {
              console.log(`  ├─ ${tool.name}: ${tool.durationMs.toFixed(0)}ms`);
            });
          });
          console.groupEnd();
        }
      }
    },
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <MessageContent message={message} />
          {/* Optionally show performance badge */}
          {message.role === 'assistant' && message.metadata?.performance && (
            <PerformanceBadge performance={message.metadata.performance} />
          )}
        </div>
      ))}
    </div>
  );
}

function PerformanceBadge({ performance }: { performance: PerformanceMetadata }) {
  return (
    <div className="text-xs text-gray-500 mt-1">
      ⚡ {performance.totalDurationMs}ms ·
      {performance.steps.length} steps ·
      {performance.totalTokens.total.toLocaleString()} tokens
    </div>
  );
}

// ============================================================================
// Analytics Integration Example
// ============================================================================

/**
 * Send performance metrics to analytics service
 */
function trackChatPerformance(
  gameId: string,
  performance: PerformanceMetadata,
  model: string
) {
  // Calculate percentiles for tool durations
  const toolDurations = performance.steps
    .flatMap((s) => s.toolCalls)
    .map((t) => t.durationMs)
    .sort((a, b) => a - b);

  const p50 = toolDurations[Math.floor(toolDurations.length * 0.5)] ?? 0;
  const p95 = toolDurations[Math.floor(toolDurations.length * 0.95)] ?? 0;
  const p99 = toolDurations[Math.floor(toolDurations.length * 0.99)] ?? 0;

  // Send to Sentry performance monitoring
  if (typeof Sentry !== 'undefined') {
    const transaction = Sentry.startTransaction({
      name: 'chat.completion',
      op: 'ai.chat',
      data: {
        gameId,
        model,
        stepCount: performance.steps.length,
        toolCallCount: performance.toolCallCount,
      },
    });

    // Add measurements
    transaction.setMeasurement('total_duration', performance.totalDurationMs, 'millisecond');
    transaction.setMeasurement('total_tokens', performance.totalTokens.total, 'none');
    transaction.setMeasurement('tool_p50', p50, 'millisecond');
    transaction.setMeasurement('tool_p95', p95, 'millisecond');
    transaction.setMeasurement('tool_p99', p99, 'millisecond');

    transaction.finish();
  }

  // Send to custom analytics
  fetch('/api/analytics/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      model,
      performance: {
        durationMs: performance.totalDurationMs,
        steps: performance.steps.length,
        toolCalls: performance.toolCallCount,
        avgToolDurationMs: performance.avgToolDurationMs,
        tokens: performance.totalTokens,
        toolDurationPercentiles: { p50, p95, p99 },
      },
      timestamp: Date.now(),
    }),
  }).catch(console.error);
}
