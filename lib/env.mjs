import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import "dotenv/config";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    BLOB_READ_WRITE_TOKEN: z.string().min(1),
    KV_URL: z.string().min(1),
    KV_REST_API_URL: z.string().min(1),
    KV_REST_API_TOKEN: z.string().min(1),
    DATABASE_URL: z.string().min(1).optional(),
    AUTH_RESEND_KEY: z.string().min(1),
    DEFAULT_PDF_EXTRACTOR: z.enum(["pdfjs", "marker"]).default("pdfjs"),
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
