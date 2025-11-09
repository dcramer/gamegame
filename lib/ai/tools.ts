import { z } from "zod";
import { findRelevantContent } from "./search";
import { db } from "../db";
import { resources, attachments } from "../db/schema";
import { eq } from "drizzle-orm";

const searchResourcesInputSchema = z.object({
  query: z
    .string()
    .describe(
      "Natural language search query. Use the user's question directly or rephrase it clearly (e.g., 'how do docks work' or 'dock mechanics and rules'). DO NOT keyword stuff."
    ),
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
});

type SearchResourcesInput = z.infer<typeof searchResourcesInputSchema>;

const searchMediaInputSchema = z.object({
  query: z
    .string()
    .describe(
      'What image/diagram to find (e.g., "setup diagram", "game board", "player board")'
    ),
});

type SearchMediaInput = z.infer<typeof searchMediaInputSchema>;

const getAttachmentInputSchema = z.object({
  attachmentId: z
    .string()
    .describe("The attachment ID from attachment:// URL"),
});

type GetAttachmentInput = z.infer<typeof getAttachmentInputSchema>;

/**
 * Get tools for the chat agent
 * Provides search, resource listing, and attachment retrieval capabilities
 */
export function getTools(
  gameId: string,
  openaiApiKey: string,
  environment?: string,
) {
  return {
    search_resources: {
      description:
        "Search the rulebook for relevant content. Returns text chunks with page numbers and section context.",
      inputSchema: searchResourcesInputSchema,
      execute: async ({ query, resourceType, limit }: SearchResourcesInput) => {
        return await findRelevantContent(gameId, query, openaiApiKey, {
          fragmentType: "text",
          resourceType: resourceType === "all" ? undefined : resourceType,
          limit,
          environment,
          enableReranking: false, // Disabled for performance (can enable later)
        });
      },
    },

    search_media: {
      description:
        "Find diagrams, setup photos, component images, and visual aids from rulebooks. Returns image content blocks that can be directly included in your response. Use when the user wants to SEE something, understand layout visually, identify components, or when text alone is not sufficient.",
      inputSchema: searchMediaInputSchema,
      execute: async ({ query }: SearchMediaInput) => {
        const searchResults = await findRelevantContent(gameId, query, openaiApiKey, {
          fragmentType: "image",
          limit: 5, // Fewer images
          environment,
          enableReranking: false,
        });

        // Transform SearchResults into image content blocks
        const imageBlocks = [];
        for (const result of searchResults) {
          if (result.images) {
            for (const image of result.images) {
              // Extract blobKey from URL if present
              const urlMatch = image.url.match(/\/api\/blob\/([^?]+)/);
              const blobKey = urlMatch ? urlMatch[1] : null;

              imageBlocks.push({
                type: "image",
                id: image.id,
                source: {
                  url: image.url,
                  blobKey: blobKey,
                },
                caption: image.caption ?? null,
                pageNumber: result.pageNumber ?? null,
                // Include resource metadata for context
                resourceId: result.resourceId,
                resourceName: result.resourceName,
              });
            }
          }
        }

        return imageBlocks;
      },
    },

    list_resources: {
      description: "List the resources available to you with their statistics",
      inputSchema: z.object({}),
      execute: async () => {
        const resourceList = await db
          .select({
            id: resources.id,
            name: resources.name,
            url: resources.url,
            originalFilename: resources.originalFilename,
            description: resources.description,
            pageCount: resources.pageCount,
            imageCount: resources.imageCount,
            wordCount: resources.wordCount,
            resourceType: resources.resourceType,
          })
          .from(resources)
          .where(eq(resources.gameId, gameId));

        return resourceList.map((r) => ({
          id: r.id,
          name: r.name,
          url: r.url,
          originalFilename: r.originalFilename ?? null,
          description: r.description ?? null,
          pageCount: r.pageCount ?? null,
          imageCount: r.imageCount ?? 0,
          wordCount: r.wordCount ?? 0,
          resourceType: r.resourceType ?? 'rulebook',
        }));
      },
    },

    get_attachment: {
      description:
        "Retrieve an attachment (image, diagram, etc.) by its ID to include in your response. Use this when you find attachment:// references in the knowledge base content.",
      inputSchema: getAttachmentInputSchema,
      execute: async ({ attachmentId }: GetAttachmentInput) => {
        try {
          const [attachment] = await db
            .select({
              id: attachments.id,
              type: attachments.type,
              url: attachments.url,
              mimeType: attachments.mimeType,
              caption: attachments.caption,
              pageNumber: attachments.pageNumber,
            })
            .from(attachments)
            .where(eq(attachments.id, attachmentId))
            .limit(1);

          if (!attachment) {
            return {
              success: false,
              error: `Attachment not found: ${attachmentId}`,
            };
          }

          return {
            success: true,
            id: attachment.id,
            type: attachment.type,
            url: attachment.url,
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
      },
    },
  };
}
