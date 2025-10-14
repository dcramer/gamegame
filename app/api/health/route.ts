import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { env } from "@/lib/env.mjs";

export const dynamic = "force-dynamic";

/**
 * Health check endpoint for monitoring and deployment verification
 *
 * Checks:
 * - Database connectivity
 * - Required environment variables
 * - Basic API functionality
 *
 * Returns 200 OK if all checks pass, 503 Service Unavailable otherwise
 */
export async function GET() {
  const checks: Record<string, { status: "ok" | "error"; message?: string }> = {};

  // Check 1: Database connectivity
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { status: "ok" };
  } catch (error) {
    checks.database = {
      status: "error",
      message: error instanceof Error ? error.message : "Database connection failed",
    };
  }

  // Check 2: Required environment variables
  const requiredEnvVars = [
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "MISTRAL_API_KEY",
    "AUTH_SECRET",
    "AUTH_RESEND_KEY",
  ];

  const missingEnvVars = requiredEnvVars.filter((varName) => {
    const value = env[varName as keyof typeof env];
    return !value || (typeof value === "string" && value.trim() === "");
  });

  if (missingEnvVars.length === 0) {
    checks.environment = { status: "ok" };
  } else {
    checks.environment = {
      status: "error",
      message: `Missing required environment variables: ${missingEnvVars.join(", ")}`,
    };
  }

  // Check 3: Vector extension availability
  try {
    await db.execute(sql`SELECT * FROM pg_extension WHERE extname = 'vector'`);
    checks.vectorExtension = { status: "ok" };
  } catch (error) {
    checks.vectorExtension = {
      status: "error",
      message: "pgvector extension not available",
    };
  }

  // Determine overall status
  const allHealthy = Object.values(checks).every((check) => check.status === "ok");
  const status = allHealthy ? 200 : 503;

  return Response.json(
    {
      status: allHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status }
  );
}
