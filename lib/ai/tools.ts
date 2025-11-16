import { z } from "zod";
import { findRelevantContent } from "./search";
import { db } from "../db";
import { resources, attachments } from "../db/schema";
import { DETECTED_IMAGE_TYPES } from "../db/schema/attachments";
import { eq } from "drizzle-orm";

const searchResourcesInputSchema = z.object({
  query: z
    .string()
    .describe(
      "Natural language search query. Keep it simple and focused on key terms from the user's question (e.g., 'how do docks work' or 'dock rules'). Use the user's exact words when possible. DO NOT add extra context, semicolons, or keyword stuff."
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

const IMAGE_TYPE_OPTIONS = ['any', ...DETECTED_IMAGE_TYPES] as const;

const searchImagesInputSchema = z.object({
  query: z
    .string()
    .describe(
      'What visual you need (e.g., "setup diagram", "player mat layout", "resource reference table"). Use concise, literal descriptions pulled from the user prompt.'
    ),
  limit: z
    .number()
    .min(1)
    .max(8)
    .default(3)
    .describe("How many images to retrieve (1-8). Default: 3"),
  imageType: z
    .enum(IMAGE_TYPE_OPTIONS)
    .default("any")
    .describe('Filter by detected type (diagram, table, photo, icon, decorative). Use "any" for broad searches.'),
});

type SearchImagesInput = z.infer<typeof searchImagesInputSchema>;

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

    search_images: {
      description:
        "Find diagrams, setup photos, tables, and component close-ups with surrounding rulebook context. Use when the user explicitly asks to SEE something, or when a visual reference removes ambiguity.",
      inputSchema: searchImagesInputSchema,
      execute: async ({ query, limit, imageType }: SearchImagesInput) => {
        const normalizedType = imageType === "any" ? undefined : imageType;
        const searchResults = await findRelevantContent(gameId, query, openaiApiKey, {
          fragmentType: "image",
          limit,
          environment,
          enableReranking: false,
        });

        const imageBlocks = [];
        for (const result of searchResults) {
          if (!result.images || result.images.length === 0) {
            continue;
          }

          const contextualSnippet = extractContextSnippet(result.searchableContent);
          const filteredImages = result.images.filter((image) => {
            if (!normalizedType) return true;
            return image.detectedType === normalizedType;
          });

          for (const image of filteredImages) {
            if (!image.url) continue;

            imageBlocks.push({
              type: "image",
              id: image.id,
              source: {
                url: image.url,
                blobKey: extractBlobKey(image.url),
              },
              caption: image.caption ?? image.description ?? result.content ?? null,
              pageNumber: result.pageNumber ?? null,
              resourceId: result.resourceId,
              resourceName: result.resourceName,
              section: result.section ?? null,
              description: image.description ?? result.content ?? null,
              detectedType: image.detectedType ?? null,
              ocrText: image.ocrText ?? null,
              surroundingText: contextualSnippet,
            });
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

function extractContextSnippet(searchableContent?: string | null): string | null {
  if (!searchableContent) {
    return null;
  }

  const marker = '--- SURROUNDING TEXT ---';
  const markerIndex = searchableContent.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const afterMarker = searchableContent
    .slice(markerIndex + marker.length)
    .trim();

  if (!afterMarker) {
    return null;
  }

  const nextSectionIndex = afterMarker.indexOf('--- ');
  const snippet =
    nextSectionIndex === -1
      ? afterMarker.trim()
      : afterMarker.slice(0, nextSectionIndex).trim();

  if (!snippet) {
    return null;
  }

  return snippet.length > 600 ? `${snippet.slice(0, 600)}…` : snippet;
}

function extractBlobKey(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/api\/blob\/([^?]+)/);
  return match ? match[1] : null;
}
