# Performance Metadata Data Format

This document shows what the performance metadata looks like when received by the client.

## Example Message with Performance Metadata

Here's what a complete message object looks like in the `useChat` hook after a chat completion:

```typescript
{
  id: "msg_abc123",
  role: "assistant",
  content: "To set up for 3 players:\n\n1. Place the game board...",
  metadata: {
    performance: {
      totalDurationMs: 4523,
      steps: [
        {
          stepNumber: 1,
          durationMs: 2103,
          stepDurationMs: 2103,
          finishReason: "tool-calls",
          tokenUsage: {
            promptTokens: 2145,
            completionTokens: 87,
            totalTokens: 2232
          },
          toolCalls: [
            {
              name: "search_resources",
              durationMs: 1834,
              timestamp: 1730000000123,
              args: {
                query: "setup 3 players",
                resourceType: "all"
              }
            }
          ]
        },
        {
          stepNumber: 2,
          durationMs: 4523,
          stepDurationMs: 2420,
          finishReason: "stop",
          tokenUsage: {
            promptTokens: 3890,
            completionTokens: 412,
            totalTokens: 4302,
            reasoningTokens: 234
          },
          toolCalls: []
        }
      ],
      totalTokens: {
        prompt: 6035,
        completion: 499,
        total: 6534,
        reasoning: 234
      },
      toolCallCount: 1,
      avgToolDurationMs: 1834
    },
    model: "gpt-5",
    gameId: "abc123",
    timestamp: 1730000004523
  }
}
```

## Performance Metadata Schema

```typescript
interface PerformanceMetadata {
  /** Total time from request start to completion (ms) */
  totalDurationMs: number;

  /** Per-step breakdown of execution */
  steps: StepMetrics[];

  /** Aggregated token usage across all steps */
  totalTokens: {
    prompt: number;      // Total input tokens
    completion: number;  // Total output tokens
    total: number;       // Sum of prompt + completion
    reasoning?: number;  // GPT-5 reasoning tokens (if any)
  };

  /** Total number of tool calls across all steps */
  toolCallCount: number;

  /** Average duration of tool calls (ms) */
  avgToolDurationMs: number;
}

interface StepMetrics {
  /** Step number (1-indexed) */
  stepNumber: number;

  /** Time from request start to this step's completion (ms) */
  durationMs: number;

  /** Time spent on just this step (ms) */
  stepDurationMs: number;

  /** Why the step finished */
  finishReason: 'stop' | 'tool-calls' | 'length' | 'content-filter' | 'error';

  /** Token usage for this step only */
  tokenUsage: {
    promptTokens: number;      // Includes history + system prompt
    completionTokens: number;  // Generated tokens
    totalTokens: number;       // Sum
    reasoningTokens?: number;  // GPT-5 reasoning (if applicable)
  };

  /** Tools executed in this step */
  toolCalls: ToolMetrics[];
}

interface ToolMetrics {
  /** Tool name (e.g., "search_resources", "getAttachment") */
  name: string;

  /** How long the tool took to execute (ms) */
  durationMs: number;

  /** When the tool was called (Unix timestamp ms) */
  timestamp: number;

  /** Arguments passed to the tool */
  args?: any;

  /** Error message if tool failed */
  error?: string;
}
```

## Example Scenarios

### Simple Question (Single Tool Call)

**Question:** "How many players?"

```json
{
  "totalDurationMs": 2341,
  "steps": [
    {
      "stepNumber": 1,
      "durationMs": 1523,
      "stepDurationMs": 1523,
      "finishReason": "tool-calls",
      "tokenUsage": {
        "promptTokens": 1890,
        "completionTokens": 45,
        "totalTokens": 1935
      },
      "toolCalls": [
        {
          "name": "search_resources",
          "durationMs": 1234,
          "timestamp": 1730000000000,
          "args": {
            "query": "number of players",
            "resourceType": "all"
          }
        }
      ]
    },
    {
      "stepNumber": 2,
      "durationMs": 2341,
      "stepDurationMs": 818,
      "finishReason": "stop",
      "tokenUsage": {
        "promptTokens": 2456,
        "completionTokens": 23,
        "totalTokens": 2479
      },
      "toolCalls": []
    }
  ],
  "totalTokens": {
    "prompt": 4346,
    "completion": 68,
    "total": 4414
  },
  "toolCallCount": 1,
  "avgToolDurationMs": 1234
}
```

**Analysis:**
- Fast response (2.3s total)
- 2 steps (search, then respond)
- Single tool call
- Low token count

### Complex Multi-Tool Question

**Question:** "Show me how to set up for 4 players"

```json
{
  "totalDurationMs": 5892,
  "steps": [
    {
      "stepNumber": 1,
      "durationMs": 2456,
      "stepDurationMs": 2456,
      "finishReason": "tool-calls",
      "tokenUsage": {
        "promptTokens": 2103,
        "completionTokens": 156,
        "totalTokens": 2259
      },
      "toolCalls": [
        {
          "name": "search_resources",
          "durationMs": 1823,
          "timestamp": 1730000000000,
          "args": {
            "query": "setup 4 players",
            "resourceType": "all"
          }
        },
        {
          "name": "search_media",
          "durationMs": 1456,
          "timestamp": 1730000001823,
          "args": {
            "query": "setup diagram 4 players"
          }
        }
      ]
    },
    {
      "stepNumber": 2,
      "durationMs": 4123,
      "stepDurationMs": 1667,
      "finishReason": "tool-calls",
      "tokenUsage": {
        "promptTokens": 4523,
        "completionTokens": 89,
        "totalTokens": 4612
      },
      "toolCalls": [
        {
          "name": "getAttachment",
          "durationMs": 234,
          "timestamp": 1730000004000,
          "args": {
            "attachmentId": "att_xyz789"
          }
        }
      ]
    },
    {
      "stepNumber": 3,
      "durationMs": 5892,
      "stepDurationMs": 1769,
      "finishReason": "stop",
      "tokenUsage": {
        "promptTokens": 5234,
        "completionTokens": 523,
        "totalTokens": 5757
      },
      "toolCalls": []
    }
  ],
  "totalTokens": {
    "prompt": 11860,
    "completion": 768,
    "total": 12628
  },
  "toolCallCount": 3,
  "avgToolDurationMs": 1171
}
```

**Analysis:**
- Longer response (5.9s)
- 3 steps with multiple rounds of tool calls
- Parallel tool calls in step 1 (search_resources + search_media)
- Image attachment retrieved in step 2
- Higher token usage (12.6k total)

### Error Case

**Tool fails during execution:**

```json
{
  "totalDurationMs": 3234,
  "steps": [
    {
      "stepNumber": 1,
      "durationMs": 2103,
      "stepDurationMs": 2103,
      "finishReason": "tool-calls",
      "tokenUsage": {
        "promptTokens": 2045,
        "completionTokens": 67,
        "totalTokens": 2112
      },
      "toolCalls": [
        {
          "name": "getAttachment",
          "durationMs": 1523,
          "timestamp": 1730000000000,
          "args": {
            "attachmentId": "invalid_id"
          },
          "error": "Attachment not found: invalid_id"
        }
      ]
    },
    {
      "stepNumber": 2,
      "durationMs": 3234,
      "stepDurationMs": 1131,
      "finishReason": "stop",
      "tokenUsage": {
        "promptTokens": 2567,
        "completionTokens": 45,
        "totalTokens": 2612
      },
      "toolCalls": []
    }
  ],
  "totalTokens": {
    "prompt": 4612,
    "completion": 112,
    "total": 4724
  },
  "toolCallCount": 1,
  "avgToolDurationMs": 1523
}
```

**Analysis:**
- Tool error captured in metadata
- LLM gracefully handled the error and responded
- Error message included for debugging

## Using Performance Metadata

### 1. Display Performance Badge

```tsx
function ChatMessage({ message }: { message: Message }) {
  const perf = message.metadata?.performance;

  return (
    <div className="message">
      <div className="content">{message.content}</div>
      {perf && (
        <div className="performance-badge">
          <span>⚡ {perf.totalDurationMs}ms</span>
          <span>·</span>
          <span>{perf.toolCallCount} tools</span>
          <span>·</span>
          <span>{perf.totalTokens.total.toLocaleString()} tokens</span>
        </div>
      )}
    </div>
  );
}
```

### 2. Performance Dashboard

```tsx
function PerformanceDashboard({ messages }: { messages: Message[] }) {
  const stats = messages
    .filter(m => m.role === 'assistant' && m.metadata?.performance)
    .map(m => m.metadata!.performance);

  const avgDuration = stats.reduce((sum, s) => sum + s.totalDurationMs, 0) / stats.length;
  const avgTokens = stats.reduce((sum, s) => sum + s.totalTokens.total, 0) / stats.length;
  const totalToolCalls = stats.reduce((sum, s) => sum + s.toolCallCount, 0);

  return (
    <div className="dashboard">
      <h3>Session Performance</h3>
      <div className="stats">
        <div>Avg Response Time: {avgDuration.toFixed(0)}ms</div>
        <div>Avg Tokens: {avgTokens.toFixed(0)}</div>
        <div>Total Tool Calls: {totalToolCalls}</div>
      </div>
    </div>
  );
}
```

### 3. Detailed Performance Breakdown

```tsx
function PerformanceDetails({ performance }: { performance: PerformanceMetadata }) {
  return (
    <details className="performance-details">
      <summary>
        Performance: {performance.totalDurationMs}ms,
        {performance.steps.length} steps,
        {performance.totalTokens.total} tokens
      </summary>
      <div className="breakdown">
        {performance.steps.map((step, i) => (
          <div key={i} className="step">
            <div className="step-header">
              Step {step.stepNumber}: {step.stepDurationMs}ms
              ({step.finishReason})
            </div>
            <div className="step-tokens">
              Tokens: {step.tokenUsage.totalTokens}
              (↑{step.tokenUsage.promptTokens} ↓{step.tokenUsage.completionTokens})
            </div>
            {step.toolCalls.length > 0 && (
              <div className="tool-calls">
                <strong>Tools:</strong>
                <ul>
                  {step.toolCalls.map((tool, j) => (
                    <li key={j}>
                      {tool.name}: {tool.durationMs}ms
                      {tool.error && <span className="error">❌ {tool.error}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
```

### 4. Analytics Tracking

```typescript
function trackPerformance(
  gameId: string,
  performance: PerformanceMetadata,
  metadata: { model: string; timestamp: number }
) {
  // Calculate cost (example GPT-5 pricing)
  const inputCost = (performance.totalTokens.prompt / 1_000_000) * 15;
  const outputCost = (performance.totalTokens.completion / 1_000_000) * 60;
  const reasoningCost = ((performance.totalTokens.reasoning ?? 0) / 1_000_000) * 60;
  const totalCost = inputCost + outputCost + reasoningCost;

  // Track in analytics
  analytics.track('Chat Response', {
    gameId,
    model: metadata.model,
    durationMs: performance.totalDurationMs,
    steps: performance.steps.length,
    toolCalls: performance.toolCallCount,
    avgToolDurationMs: performance.avgToolDurationMs,
    totalTokens: performance.totalTokens.total,
    promptTokens: performance.totalTokens.prompt,
    completionTokens: performance.totalTokens.completion,
    reasoningTokens: performance.totalTokens.reasoning,
    estimatedCost: totalCost,
    timestamp: metadata.timestamp,
  });

  // Identify slow queries
  if (performance.totalDurationMs > 6000) {
    analytics.track('Slow Chat Response', {
      gameId,
      durationMs: performance.totalDurationMs,
      steps: performance.steps.length,
      toolCalls: performance.toolCallCount,
      slowTools: performance.steps
        .flatMap(s => s.toolCalls)
        .filter(t => t.durationMs > 2000)
        .map(t => ({ name: t.name, durationMs: t.durationMs })),
    });
  }
}
```

## Benefits

1. **Cost Tracking** - Calculate exact cost per query using token counts
2. **Performance Monitoring** - Identify slow queries and bottlenecks
3. **User Transparency** - Show users how long queries take
4. **Debugging** - Trace which tools are called and how long they take
5. **Optimization** - Identify opportunities to improve response time
6. **Analytics** - Track usage patterns and performance trends
