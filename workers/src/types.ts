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
  JWT_SECRET: string;
  RESEND_API_KEY?: string; // Optional: for sending emails via Resend

  // Environment
  ENVIRONMENT?: string;
  R2_PUBLIC_URL?: string; // Public URL for R2 bucket (e.g., https://pub-xxx.r2.dev or custom domain)
}

export interface QueueMessage {
  jobId: string;
  resourceId: string;
  gameId: string;
  name: string;
  url: string;
  gameName?: string; // Optional: game name for vision analysis context
}

// Vectorize metadata must be primitives only (string | number | boolean | string[])
// Note: Optional fields will be omitted if undefined (not sent to Vectorize)
export type VectorMetadata = Record<string, string | number | boolean | string[]> & {
  fragmentId: string;
  gameId: string;
  resourceId: string;
  pageNumber?: number;
  section?: string;
};
