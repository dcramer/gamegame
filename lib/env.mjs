import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    // Vercel Blob - optional, falls back to local storage in development
    BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    // Vercel KV - optional, falls back to no rate limiting
    KV_URL: z.string().min(1).optional(),
    KV_REST_API_URL: z.string().min(1).optional(),
    KV_REST_API_TOKEN: z.string().min(1).optional(),
    // Required: OpenAI for embeddings and chat
    OPENAI_API_KEY: z.string().min(1),
    // Required: Database connection
    DATABASE_URL: z.string().min(1),
    // Required: Session secret for iron-session (32+ characters)
    SESSION_SECRET: z.string().min(32),
    // Required: Mistral for PDF OCR extraction
    MISTRAL_API_KEY: z.string().min(1),
    // Optional: Default PDF extractor
    DEFAULT_PDF_EXTRACTOR: z.enum(['mistral']).default('mistral'),
    // Optional: Fragment batch size for database insertions (default: 100)
    FRAGMENT_BATCH_SIZE: z.coerce.number().int().min(10).max(500).default(100),
    // Optional: Sentry DSN for server-side error tracking (production only)
    SENTRY_DSN: z.string().url().optional(),
    // Optional: BGG API key
    BGG_API_KEY: z.string().optional(),
    // Optional: Enable full-text search in hybrid search
    ENABLE_FULL_TEXT_SEARCH: z
      .enum(['true', 'false'])
      .transform((val) => val === 'true')
      .pipe(z.boolean())
      .default('true'),
    // Optional: Environment for model selection
    ENVIRONMENT: z.enum(['development', 'production']).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    // Optional: Sentry DSN for client-side error tracking (production only)
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
});
