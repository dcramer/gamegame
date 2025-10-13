import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import "dotenv/config";

import { loadEnvConfig } from "@next/env";

const projectDir = process.cwd();
loadEnvConfig(projectDir);

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
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
    // Required: Auth secret for NextAuth
    AUTH_SECRET: z.string().min(1),
    // Required: Resend for passwordless login emails
    AUTH_RESEND_KEY: z.string().min(1),
    // Required: Mistral for PDF OCR extraction
    MISTRAL_API_KEY: z.string().min(1),
    // Optional: Default PDF extractor
    DEFAULT_PDF_EXTRACTOR: z.enum(["mistral"]).default("mistral"),
    // Optional: Datalab integration
    DATALAB_API_KEY: z.string().optional(),
  },
  client: {
    // NEXT_PUBLIC_PUBLISHABLE_KEY: z.string().min(1),
  },
  // For Next.js >= 13.4.4, you only need to destructure client variables:
  experimental__runtimeEnv: {
    // NEXT_PUBLIC_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_PUBLISHABLE_KEY,
  },
});
