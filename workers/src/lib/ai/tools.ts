import { tool } from "@openai/agents";
import { z } from "zod";
import { findRelevantContent } from "./search";
import type { D1Database, VectorizeIndex } from "@cloudflare/workers-types";
import { getDb, resources, attachments } from "../db";
import { normalizeResourceSourceUrl } from "../services/r2-storage";
import { eq } from "drizzle-orm";
import type { ToolMetrics } from "@/types";

// Tool execution timeout in milliseconds (30 seconds)
const TOOL_TIMEOUT_MS = 30000;

/**
 * Wraps a tool execution function with a timeout
 * Prevents hanging requests when tools take too long
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`)
          ),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Wraps a tool's execute function with performance tracking
 * Records execution time, arguments, and errors
 */
function withPerformanceTracking<TArgs, TResult>(
  toolName: string,
  execute: (args: TArgs) => Promise<TResult>,
  onComplete?: (metrics: ToolMetrics) => void
): (args: TArgs) => Promise<TResult> {
  if (!onComplete) {
    return execute; // No tracking if no callback provided
  }

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
        args,
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

export function getAgentTools(
  gameId: string,
  db: D1Database,
  vectorIndex: VectorizeIndex,
  openaiApiKey: string,
  baseUrl: string,
  environment?: string,
  onToolComplete?: (metrics: ToolMetrics) => void,
  enableFullTextSearch?: boolean
) {
  return [
    tool({
      name: "search_resources",
      description:
        "Search the rulebook for relevant content. Returns text chunks with page numbers and section context.",
      parameters: z.object({
        query: z.string().describe("Natural language search query. Use the user's question directly or rephrase it clearly (e.g., 'how do docks work' or 'dock mechanics and rules'). DO NOT keyword stuff."),
        resourceType: z
          .enum(["all", "rulebook", "expansion", "faq", "errata"])
          .default("all")
          .describe("Optional: limit to specific resource type"),
        limit: z
          .number()
          .min(1)
          .max(10)
          .default(5)
          .describe(
            "Number of results to return (1-10). Use 2-3 for simple factual questions (player count, play time), 5 for complex rules questions. Default: 5"
          ),
      }),
      execute: withPerformanceTracking(
        "search_resources",
        async ({ query, resourceType, limit }) =>
          withTimeout(
            findRelevantContent(db, vectorIndex, gameId, query, openaiApiKey, {
              fragmentType: "text",
              resourceType: resourceType === "all" ? undefined : resourceType,
              limit,
              environment,
              enableReranking: false, // Temporarily disabled - gpt-5-mini API errors
              enableFullTextSearch, // Pass through FTS toggle
            }),
            TOOL_TIMEOUT_MS,
            "search_resources"
          ),
        onToolComplete
      ),
    }),

    tool({
      name: "search_media",
      description:
        "Find diagrams, setup photos, component images, and visual aids from rulebooks. Use when the user wants to SEE something, understand layout visually, identify components, or when text alone is not sufficient.",
      parameters: z.object({
        query: z
          .string()
          .describe(
            'What image/diagram to find (e.g., "setup diagram", "game board", "player board")'
          ),
      }),
      execute: withPerformanceTracking(
        "search_media",
        async ({ query }) =>
          withTimeout(
            findRelevantContent(db, vectorIndex, gameId, query, openaiApiKey, {
              fragmentType: "image",
              limit: 5, // Fewer images
              environment,
              enableReranking: false, // Temporarily disabled - gpt-5-mini API errors
            }),
            TOOL_TIMEOUT_MS,
            "search_media"
          ),
        onToolComplete
      ),
    }),

    tool({
      name: "list_resources",
      description: "List the resources available to you with their statistics",
      parameters: z.object({}),
      execute: withPerformanceTracking(
        "list_resources",
        async () =>
          withTimeout(
            (async () => {
              const orm = getDb(db);
              const resourceList = await orm
                .select()
                .from(resources)
                .where(eq(resources.gameId, gameId))
                .all();

              return resourceList.map((r) => ({
                id: r.id,
                name: r.name,
                url: normalizeResourceSourceUrl(r.id, r.url) ?? r.url,
                originalFilename: r.originalFilename ?? null,
                description: r.description ?? null,
                pageCount: r.pageCount ?? null,
                imageCount: r.imageCount ?? 0,
                wordCount: r.wordCount ?? 0,
              }));
            })(),
            TOOL_TIMEOUT_MS,
            "list_resources"
          ),
        onToolComplete
      ),
    }),

    tool({
      name: "get_attachment",
      description:
        "Retrieve an attachment (image, diagram, etc.) by its ID to include in your response. Use this when you find attachment:// references in the knowledge base content.",
      parameters: z.object({
        attachmentId: z
          .string()
          .describe("The attachment ID from attachment:// URL"),
      }),
      execute: withPerformanceTracking(
        "get_attachment",
        async ({ attachmentId }) =>
          withTimeout(
            (async () => {
              try {
                const orm = getDb(db);
                const [attachment] = await orm
                  .select()
                  .from(attachments)
                  .where(eq(attachments.id, attachmentId))
                  .limit(1);

                if (!attachment) {
                  return {
                    success: false,
                    error: `Attachment not found: ${attachmentId}`,
                  };
                }

                const { r2KeyToUrl } = await import("../services/r2-storage");

                return {
                  success: true,
                  id: attachment.id,
                  type: attachment.type,
                  url: `${baseUrl}${r2KeyToUrl(attachment.r2Key)}`,
                  mimeType: attachment.mimeType ?? "image/png",
                  caption: attachment.caption,
                  pageNumber: attachment.pageNumber,
                };
              } catch (error) {
                return {
                  success: false,
                  error: `Attachment not found or unavailable: ${attachmentId}`,
                };
              }
            })(),
            TOOL_TIMEOUT_MS,
            "get_attachment"
          ),
        onToolComplete
      ),
    }),
  ];
}
