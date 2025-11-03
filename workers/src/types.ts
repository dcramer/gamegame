import type { D1Database, KVNamespace, Queue, R2Bucket, VectorizeIndex } from '@cloudflare/workers-types';

export interface Env {
  // Database
  DB: D1Database;

  // Vector search
  VECTORIZE: VectorizeIndex;

  // Storage
  FILES: R2Bucket;
  ASSETS: { fetch: typeof fetch }; // Wrangler 4 static assets binding

  // KV Stores
  RATE_LIMIT_KV: KVNamespace;
  JOB_STATUS_KV: KVNamespace;

  // Queues
  RESOURCE_QUEUE: Queue;

  // Secrets
  OPENAI_API_KEY: string;
  MISTRAL_API_KEY: string;
  BGG_API_KEY?: string; // Optional: BoardGameGeek API key for XML API access (required as of 2025)
  JWT_SECRET: string;
  RESEND_API_KEY?: string; // Optional: for sending emails via Resend
  SENTRY_DSN?: string; // Optional: Sentry DSN for error tracking and performance monitoring

  // Environment
  ENVIRONMENT?: string;
  R2_PUBLIC_URL?: string; // Public URL for R2 bucket (e.g., https://pub-xxx.r2.dev or custom domain)
  CHAT_MODEL?: string; // OpenAI model to use for chat (default: gpt-5)

  // Debug flags (set to 'true' to enable)
  CHAT_DEBUG_VERBOSE?: string; // Log detailed tool call traces to stdout
}

export type ProcessingTaskType = 'INGEST' | 'VISION' | 'CLEANUP' | 'METADATA' | 'EMBED' | 'FINALIZE';

export interface QueueMessage {
  jobId: string;
  resourceId: string;
  gameId: string;
  name: string;
  type: ProcessingTaskType;
  url?: string;
  gameName?: string; // Optional: game name for vision analysis context
  sourceKey?: string; // Optional: internal R2 object key for the source PDF
}

// Vectorize metadata must be primitives only (string | number | boolean | string[])
// Note: Optional fields will be omitted if undefined (not sent to Vectorize)
export type VectorMetadata = Record<string, string | number | boolean | string[]> & {
  fragmentId: string;
  gameId: string;
  resourceId: string;
  pageNumber?: number;
  section?: string;

  // Vector type discrimination
  type: 'content' | 'question'; // 'content' = fragment content, 'question' = synthetic question

  // Fragment type (only for content vectors)
  fragmentType?: 'text' | 'image';

  // Question-specific fields (only for question vectors)
  questionIndex?: number;      // Which question (0-4) in the syntheticQuestions array
  questionText?: string;       // The actual question text (for debugging)
};

// ============================================================================
// Performance Tracking Types
// ============================================================================

export interface ToolMetrics {
  /** Tool name (e.g., "search_resources", "getAttachment") */
  name: string;
  /** How long the tool took to execute (ms) */
  durationMs: number;
  /** When the tool was called (Unix timestamp ms) */
  timestamp: number;
  /** Arguments passed to the tool (be careful with PII) */
  args?: any;
  /** Error message if tool failed */
  error?: string;
}

export interface StepMetrics {
  /** Step number (1-indexed) */
  stepNumber: number;
  /** Time from request start to this step's completion (ms) */
  durationMs: number;
  /** Time spent on just this step (ms) */
  stepDurationMs: number;
  /** Why the step finished */
  finishReason: string;
  /** Token usage for this step only */
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    reasoningTokens?: number;
  };
  /** Tools executed in this step */
  toolCalls: ToolMetrics[];
}

export interface PerformanceMetadata {
  /** Total time from request start to completion (ms) */
  totalDurationMs: number;
  /** Per-step breakdown of execution */
  steps: StepMetrics[];
  /** Aggregated token usage across all steps */
  totalTokens: {
    prompt: number;
    completion: number;
    total: number;
    reasoning?: number;
  };
  /** Total number of tool calls across all steps */
  toolCallCount: number;
  /** Average duration of tool calls (ms) */
  avgToolDurationMs: number;
}
