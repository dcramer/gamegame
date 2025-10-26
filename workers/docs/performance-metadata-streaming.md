# Performance Metadata Streaming with AI SDK

This document explores how to stream performance metrics alongside chat responses using AI SDK 5.0's data streaming capabilities.

## Overview

The AI SDK provides several mechanisms to send custom metadata during streaming:

1. **`onStepFinish` callback** - Access token usage and timing for each LLM step
2. **Custom data parts** - Send arbitrary metadata via the UI message stream
3. **`messageMetadata` option** - Attach metadata to the final message

## Implementation Approaches

### Approach 1: Use `onStepFinish` with Custom Data Parts

The AI SDK allows us to merge custom data into the stream using the `fullStream` API and transform it before sending to the client.

```typescript
export async function streamChatResponse(
  env: Env,
  game: GameSummary,
  body: ChatRequest,
  baseUrl: string,
  metadata: Record<string, unknown> = {}
) {
  const startTime = Date.now();
  const tools = getTools(/* ... */);
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

  // Track performance metrics for each step
  const performanceMetrics: Array<{
    stepNumber: number;
    toolCalls: Array<{
      name: string;
      durationMs: number;
      args?: any;
    }>;
    tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    durationMs: number;
    finishReason: string;
  }> = [];

  let currentStep = 0;

  const result = streamText({
    model: openai(chatModel),
    system: buildPrompt(game),
    messages: coreMessages,
    tools,
    experimental_telemetry: { /* ... */ },

    // Capture performance data for each step
    onStepFinish: async (stepResult) => {
      currentStep++;
      const stepDuration = Date.now() - startTime;

      // Extract tool call information
      const toolCallsInfo = stepResult.toolCalls.map(tc => ({
        name: tc.toolName,
        args: tc.args,
        // Note: individual tool timing would need to be tracked in tool execute()
        durationMs: 0, // See Approach 2 for per-tool timing
      }));

      // Capture token usage
      const usage = {
        promptTokens: stepResult.usage.promptTokens ?? 0,
        completionTokens: stepResult.usage.completionTokens ?? 0,
        totalTokens: stepResult.usage.totalTokens ?? 0,
      };

      performanceMetrics.push({
        stepNumber: currentStep,
        toolCalls: toolCallsInfo,
        tokenUsage: usage,
        durationMs: stepDuration,
        finishReason: stepResult.finishReason,
      });
    },

    onFinish: async ({ usage, finishReason, response }) => {
      console.log('Final performance metrics:', performanceMetrics);
    },
  });

  // Convert to UI message stream with custom metadata
  return result.toUIMessageStreamResponse({
    messageMetadata: async () => ({
      performance: {
        totalDurationMs: Date.now() - startTime,
        steps: performanceMetrics,
        totalTokens: performanceMetrics.reduce(
          (sum, step) => sum + step.tokenUsage.totalTokens,
          0
        ),
      },
    }),
  });
}
```

**Pros:**
- Simple to implement
- Metadata attached to final message
- Available in `useChat` hook via `message.metadata`

**Cons:**
- Metadata only available at the end, not during streaming
- No real-time progress updates

### Approach 2: Per-Tool Performance Tracking

To track individual tool execution time, we need to instrument each tool:

```typescript
// lib/ai/prompt.ts

/**
 * Wraps a tool execute function with performance tracking
 */
function withPerformanceTracking<T>(
  toolName: string,
  execute: (...args: any[]) => Promise<T>,
  onComplete: (metrics: { toolName: string; durationMs: number; args: any }) => void
): typeof execute {
  return async (...args: any[]) => {
    const startTime = performance.now();
    try {
      const result = await execute(...args);
      const durationMs = performance.now() - startTime;
      onComplete({ toolName, durationMs, args: args[0] });
      return result;
    } catch (error) {
      const durationMs = performance.now() - startTime;
      onComplete({ toolName, durationMs: durationMs, args: args[0] });
      throw error;
    }
  };
}

export function getTools(
  gameId: string,
  db: D1Database,
  vectorIndex: VectorizeIndex,
  openaiApiKey: string,
  baseUrl: string,
  environment?: string,
  onToolComplete?: (metrics: any) => void
) {
  return {
    search_resources: tool({
      description: "Search rulebook text...",
      inputSchema: z.object({
        query: z.string(),
        resourceType: z.enum(["all", "rulebook", "expansion", "faq", "errata"]).default("all"),
      }),
      execute: withPerformanceTracking(
        "search_resources",
        async ({ query, resourceType }) => {
          return findRelevantContent(
            db,
            vectorIndex,
            gameId,
            query,
            openaiApiKey,
            {
              fragmentType: "text",
              resourceType: resourceType === "all" ? undefined : resourceType,
              environment,
              enableReranking: false,
            }
          );
        },
        onToolComplete ?? (() => {})
      ),
    }),

    // Similar for other tools...
  };
}
```

### Approach 3: Custom Data Streaming (Most Powerful)

For real-time performance updates during streaming, we can use custom data parts:

```typescript
import { createUIMessageStream } from 'ai';

export async function streamChatResponse(/* ... */) {
  const startTime = Date.now();
  let stepNumber = 0;
  const toolMetrics: any[] = [];

  // Callback for tool completion
  const onToolComplete = (metrics: any) => {
    toolMetrics.push(metrics);
  };

  const tools = getTools(
    gameId,
    env.DB,
    env.VECTORIZE,
    env.OPENAI_API_KEY,
    baseUrl,
    env.ENVIRONMENT,
    onToolComplete
  );

  const result = streamText({
    model: openai(chatModel),
    system: buildPrompt(game),
    messages: coreMessages,
    tools,

    onStepFinish: async (stepResult) => {
      stepNumber++;

      // Note: We can't directly inject custom data into streamText
      // This is a limitation - we'd need to transform the stream
      console.log('Step finished:', {
        step: stepNumber,
        usage: stepResult.usage,
        toolCalls: stepResult.toolCalls.length,
      });
    },
  });

  // Transform stream to add custom performance data
  // This would require using fullStream and manual transformation
  // which is complex - see Alternative below

  return result.toUIMessageStreamResponse({
    messageMetadata: async () => ({
      performance: {
        totalDurationMs: Date.now() - startTime,
        toolMetrics,
      },
    }),
  });
}
```

## Recommended Approach

Based on the AI SDK 5.0 architecture, **Approach 1 + Approach 2** combined is the most practical:

1. **Use `messageMetadata`** to send final performance summary
2. **Instrument tools** with performance tracking
3. **Collect metrics** in `onStepFinish`
4. **Attach to message** via `messageMetadata`

### Complete Implementation

```typescript
// src/routes/api/chat-handler.ts

interface PerformanceMetrics {
  totalDurationMs: number;
  steps: Array<{
    stepNumber: number;
    durationMs: number;
    finishReason: string;
    tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      reasoningTokens?: number;
    };
    toolCalls: Array<{
      name: string;
      durationMs: number;
      args?: any;
    }>;
  }>;
  totalTokens: {
    prompt: number;
    completion: number;
    total: number;
    reasoning?: number;
  };
}

export async function streamChatResponse(
  env: Env,
  game: GameSummary,
  body: ChatRequest,
  baseUrl: string,
  metadata: Record<string, unknown> = {}
) {
  const startTime = Date.now();
  const performanceMetrics: PerformanceMetrics = {
    totalDurationMs: 0,
    steps: [],
    totalTokens: {
      prompt: 0,
      completion: 0,
      total: 0,
    },
  };

  let currentStep = 0;
  const toolMetricsBuffer: Array<{
    name: string;
    durationMs: number;
    args: any;
  }> = [];

  const onToolComplete = (metrics: any) => {
    toolMetricsBuffer.push(metrics);
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
  const coreMessages = convertToCoreMessages(body.messages as any);
  const chatModel = env.CHAT_MODEL || DEFAULT_CHAT_MODEL;

  const result = streamText({
    model: openai(chatModel),
    system: buildPrompt(game),
    messages: coreMessages,
    tools,
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'chat',
      metadata: { /* ... */ },
      recordInputs: true,
      recordOutputs: true,
    },

    onStepFinish: async (stepResult) => {
      currentStep++;

      const usage = {
        promptTokens: stepResult.usage.promptTokens ?? 0,
        completionTokens: stepResult.usage.completionTokens ?? 0,
        totalTokens: stepResult.usage.totalTokens ?? 0,
        reasoningTokens: (stepResult.usage as any).reasoningTokens,
      };

      // Collect tool metrics for this step
      const stepToolCalls = [...toolMetricsBuffer];
      toolMetricsBuffer.length = 0; // Clear buffer

      performanceMetrics.steps.push({
        stepNumber: currentStep,
        durationMs: Date.now() - startTime,
        finishReason: stepResult.finishReason,
        tokenUsage: usage,
        toolCalls: stepToolCalls,
      });

      // Update totals
      performanceMetrics.totalTokens.prompt += usage.promptTokens;
      performanceMetrics.totalTokens.completion += usage.completionTokens;
      performanceMetrics.totalTokens.total += usage.totalTokens;
      if (usage.reasoningTokens) {
        performanceMetrics.totalTokens.reasoning =
          (performanceMetrics.totalTokens.reasoning ?? 0) + usage.reasoningTokens;
      }
    },

    onFinish: async ({ usage, finishReason }) => {
      performanceMetrics.totalDurationMs = Date.now() - startTime;

      // Log to console if debug enabled
      logChatDebug(env, {
        gameId: game.id,
        gameSlug: game.slug,
        model: chatModel,
        startTime,
        usage,
        finishReason,
      });

      // Set Sentry context
      setContext('performance', performanceMetrics);
    },
  });

  return result.toUIMessageStreamResponse({
    // Attach performance metrics to the message
    messageMetadata: async () => ({
      performance: performanceMetrics,
      model: chatModel,
      gameId: game.id,
      timestamp: Date.now(),
    }),
  });
}
```

## Client-Side Usage

In the React client using `useChat`:

```typescript
const { messages, append } = useChat({
  api: `/api/games/${gameId}/chat`,
  onFinish: (message) => {
    // Access performance metadata
    const metadata = message.metadata as {
      performance?: PerformanceMetrics;
      model?: string;
    };

    if (metadata?.performance) {
      console.log('Chat performance:', {
        duration: metadata.performance.totalDurationMs,
        steps: metadata.performance.steps.length,
        totalTokens: metadata.performance.totalTokens.total,
        toolCalls: metadata.performance.steps.flatMap(s => s.toolCalls),
      });

      // Send to analytics
      trackChatPerformance(metadata.performance);
    }
  },
});
```

## Benefits

1. **Per-step metrics** - See exactly how long each LLM call took
2. **Per-tool metrics** - Track which tools are slow
3. **Token tracking** - Monitor costs in real-time
4. **Client access** - Performance data available in `useChat` hook
5. **Sentry integration** - Automatic error tracking with performance context
6. **Debug mode** - Still works with existing `CHAT_DEBUG_*` env vars

## Limitations

1. **End-of-stream only** - Metadata arrives when message is complete, not during streaming
2. **No transient updates** - Can't send progress updates mid-stream without custom stream transformation
3. **Client polling** - Can't push metrics in real-time

## Future Enhancements

For real-time progress updates, we'd need to:
1. Use `fullStream` from `streamText`
2. Transform the stream to inject custom `data` chunks
3. Send step completion events as they happen
4. Use `onData` callback in `useChat` to handle transient events

This would require more complex stream manipulation but would enable real-time progress bars and performance monitoring.
