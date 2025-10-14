"use server";

import { requireAdmin } from "../auth/require-admin";
import { generateEmbeddings } from "../ai/search";
import { db } from "../db";
import { fragments as fragmentsTable } from "../db/schema/fragments";
import { attachments } from "../db/schema/attachments";
import { insertResourceSchema, resources } from "../db/schema/resources";
import mime from "mime";
import { asc, eq, sql } from "drizzle-orm";
import { extractTextFromPdf } from "../pdf";
import {
  deleteImages,
  deleteResourceImages,
} from "../services/images";
import {
  uploadResourceImages,
  processResourceContent,
  calculateResourceStats,
  cleanupBlobsOnError,
} from "../services/resource-processor";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.mjs";
import type { PDFImage } from "../types/pdf";
import { logger, logTiming } from "../logger";

/**
 * Fetch file content, handling both absolute URLs and relative paths
 */
async function fetchFileContent(url: string): Promise<Buffer> {
  // If URL is relative and we're using local storage, read from filesystem
  if (url.startsWith("/") && !env.BLOB_READ_WRITE_TOKEN) {
    const filePath = path.join(process.cwd(), "public", url);
    try {
      return await readFile(filePath);
    } catch (error) {
      throw new Error(`Failed to read file from local storage at "${filePath}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Otherwise use fetch for absolute URLs (Vercel Blob, etc)
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file from "${url}": ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export const createResource = async (input: {
  id?: string;
  gameId: string;
  name: string;
  url: string;
}) => {
  const endTimer = logTiming("resource-processing");
  const log = logger.child({
    operation: "createResource",
    resourceName: input.name,
    gameId: input.gameId
  });
  log.info("Starting resource processing");

  await requireAdmin();

  const mimeType = mime.getType(input.name);

  if (!mimeType) {
    throw new Error(`Unable to determine file type for "${input.name}". Please ensure the file has a valid extension (e.g., .pdf).`);
  }

  const content = await fetchFileContent(input.url);

  let extractionResult;
  switch (mimeType) {
    case "application/pdf":
      extractionResult = await extractTextFromPdf(content);
      break;
    default:
      throw new Error(`Unsupported mime type: ${mimeType}. Only PDF files are currently supported.`);
  }

  const newContent = extractionResult.text;
  const structured = extractionResult.structured;

  const parsedInput = insertResourceSchema.parse({
    ...input,
    version: 0,
    content: newContent,
  });

  // Step 1: Upload images to blob storage BEFORE transaction to avoid leaks
  const uploadedBlobs = await uploadResourceImages(structured, input.id || 'temp');

  // Step 2: Start transaction and create DB records
  let resource;
  try {
    resource = await db.transaction(async (tx) => {
      // Set transaction timeout to prevent long-running locks
      await tx.execute(sql`SET LOCAL statement_timeout = '60s'`);

      // Create resource first to get ID
      const now = new Date();
      const [resource] = await tx
        .insert(resources)
        .values({
          ...parsedInput,
          version: 0, // Will update after embeddings
          pdfExtractor: "mistral",
          processedAt: now,
        })
        .returning();

      if (!resource) {
        throw new Error("Failed to create resource");
      }

      // Process content: attachments, embeddings, and fragments
      const { finalContent, embeddings, version } = await processResourceContent(
        newContent,
        structured,
        uploadedBlobs,
        input.gameId,
        resource.id,
        tx
      );

      // Calculate stats from structured content
      const stats = calculateResourceStats(newContent, structured);

      // Update resource with correct version, stats, and final content with database IDs
      const [updatedResource] = await tx
        .update(resources)
        .set({
          content: finalContent,
          version,
          ...stats,
        })
        .where(eq(resources.id, resource.id))
        .returning({
          id: resources.id,
          name: resources.name,
          url: resources.url,
          version: resources.version,
          pdfExtractor: resources.pdfExtractor,
          processedAt: resources.processedAt,
          pageCount: resources.pageCount,
          imageCount: resources.imageCount,
          wordCount: resources.wordCount,
        });

      return [updatedResource, embeddings.length] as const;
    });
  } catch (error) {
    // If transaction failed, clean up orphaned blob files
    await cleanupBlobsOnError(uploadedBlobs, 'Resource');
    throw error;
  }

  const [newResource, fragmentCount] = resource;

  endTimer({
    fragmentCount,
    pageCount: newResource.pageCount || 0,
    imageCount: newResource.imageCount || 0,
    wordCount: newResource.wordCount || 0,
    success: true,
  });

  return {
    id: newResource.id,
    name: newResource.name,
    url: newResource.url,
    version: newResource.version,
    pdfExtractor: newResource.pdfExtractor,
    processedAt: newResource.processedAt,
    hasContent: true,
    stats: {
      fragmentCount,
      pageCount: newResource.pageCount,
      imageCount: newResource.imageCount ?? 0,
      wordCount: newResource.wordCount ?? 0,
    },
  };
};

export async function getResource(
  resourceId: string,
  withContent: true
): Promise<{
  id: string;
  name: string;
  url: string;
  version: number;
  content: string;
  embeddingCount: number;
  pageCount: number | null;
  imageCount: number;
  wordCount: number;
}>;
export async function getResource(
  resourceId: string,
  withContent?: false | undefined
): Promise<{
  id: string;
  name: string;
  url: string;
  version: number;
  embeddingCount: number;
  pageCount: number | null;
  imageCount: number;
  wordCount: number;
}>;
export async function getResource(resourceId: string, withContent = false) {
  const [resource] = await db
    .select({
      id: resources.id,
      name: resources.name,
      url: resources.url,
      version: resources.version,
      pageCount: resources.pageCount,
      imageCount: resources.imageCount,
      wordCount: resources.wordCount,
      ...(withContent ? { content: resources.content } : {}),
    })
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);

  if (!resource) {
    throw new Error("Resource not found");
  }

  const [{ count: embeddingCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(fragmentsTable)
    .where(eq(fragmentsTable.resourceId, resource.id))
    .limit(1);

  return {
    ...resource,
    embeddingCount,
    pageCount: resource.pageCount,
    imageCount: resource.imageCount ?? 0,
    wordCount: resource.wordCount ?? 0,
  };
}

export const getAllResourcesForGame = async (gameId: string) => {
  // Use a single query with LEFT JOIN and GROUP BY to get fragment counts
  // This eliminates the N+1 query problem
  const resourceList = await db
    .select({
      id: resources.id,
      name: resources.name,
      url: resources.url,
      version: resources.version,
      pdfExtractor: resources.pdfExtractor,
      processedAt: resources.processedAt,
      hasContent: sql<boolean>`${resources.content} != '' AND ${resources.content} is not null`,
      pageCount: resources.pageCount,
      imageCount: resources.imageCount,
      wordCount: resources.wordCount,
      fragmentCount: sql<number>`count(${fragmentsTable.id})`,
    })
    .from(resources)
    .leftJoin(fragmentsTable, eq(resources.id, fragmentsTable.resourceId))
    .where(eq(resources.gameId, gameId))
    .groupBy(resources.id)
    .orderBy(asc(resources.name));

  return resourceList.map((resource) => ({
    id: resource.id,
    name: resource.name,
    url: resource.url,
    version: resource.version,
    pdfExtractor: resource.pdfExtractor,
    processedAt: resource.processedAt,
    hasContent: resource.hasContent,
    stats: {
      fragmentCount: Number(resource.fragmentCount),
      pageCount: resource.pageCount,
      imageCount: resource.imageCount ?? 0,
      wordCount: resource.wordCount ?? 0,
    },
  }));
};

export const updateResource = async (
  resourceId: string,
  input: {
    name?: string;
    content?: string;
    // url?: string;
  }
) => {
  await requireAdmin();

  const log = logger.child({
    operation: "updateResource",
    resourceId,
  });

  const [resource] = await db
    .select({
      id: resources.id,
      gameId: resources.gameId,
      content: resources.content,
    })
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);
  if (!resource) {
    throw new Error("Resource not found");
  }

  const parsedInput = insertResourceSchema.partial().parse(input);

  // If content is being updated, regenerate embeddings
  if (input.content && input.content !== resource.content) {
    log.info("Regenerating embeddings for content update");
    const endTimer = logTiming("resource-content-update");

    const updatedContent = input.content; // TypeScript narrowing
    const [newResource, fragmentCount] = await db.transaction(async (tx) => {
      // Set transaction timeout to prevent long-running locks
      await tx.execute(sql`SET LOCAL statement_timeout = '60s'`);

      const [embeddings, version] = await generateEmbeddings(updatedContent);
      if (!embeddings.length) {
        throw new Error("Failed to generate embeddings");
      }

      const [newResource] = await tx
        .update(resources)
        .set({ ...parsedInput, version: version })
        .where(eq(resources.id, resourceId))
        .returning({
          id: resources.id,
          name: resources.name,
          url: resources.url,
          content: resources.content,
          version: resources.version,
          hasContent: sql<boolean>`${resources.content} != '' AND ${resources.content} is not null`,
        });

      await tx
        .delete(fragmentsTable)
        .where(eq(fragmentsTable.resourceId, resource.id));
      await tx.insert(fragmentsTable).values(
        embeddings.map((embedding) => ({
          gameId: resource.gameId,
          resourceId: resource.id,
          ...embedding,
          version,
        }))
      );

      return [newResource, embeddings.length] as const;
    });

    endTimer({
      fragmentCount,
      success: true,
    });

    return newResource;
  }

  // Otherwise, just update the name (no need to regenerate embeddings)
  log.info("Updating resource metadata (no content change)");
  const [updatedResource] = await db
    .update(resources)
    .set(parsedInput)
    .where(eq(resources.id, resourceId))
    .returning({
      id: resources.id,
      name: resources.name,
      url: resources.url,
      content: resources.content,
      version: resources.version,
      hasContent: sql<boolean>`${resources.content} != '' AND ${resources.content} is not null`,
    });

  return updatedResource;
};

export const deleteResource = async (resourceId: string) => {
  await requireAdmin();

  const log = logger.child({
    operation: "deleteResource",
    resourceId,
  });

  // Get all attachments for this resource to find blob URLs before deletion
  const resourceAttachments = await db
    .select({ url: attachments.url })
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId));

  // Delete the resource (fragments and attachments cascade automatically via FK constraints)
  await db.delete(resources).where(eq(resources.id, resourceId));

  // Delete all blob files for this resource
  // No need for reference counting since blobs are stored per-resource
  // at resources/{resourceId}/attachments/ and can't be shared between resources
  if (resourceAttachments.length > 0) {
    const blobUrls = resourceAttachments.map((a) => a.url);
    await deleteImages(blobUrls).catch((cleanupError) => {
      log.error({ err: cleanupError, blobCount: blobUrls.length }, "Failed to cleanup blobs");
      // Don't fail the operation if blob cleanup fails
    });
  }

  log.info({ attachmentCount: resourceAttachments.length }, "Resource deleted");
  return {};
};

export const reprocessResource = async (resourceId: string) => {
  await requireAdmin();

  const [resource] = await db
    .select()
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);
  if (!resource) {
    throw new Error("Resource not found");
  }

  const endTimer = logTiming("resource-reprocessing");
  const log = logger.child({
    operation: "reprocessResource",
    resourceId,
    resourceName: resource.name,
    gameId: resource.gameId,
  });
  log.info("Starting resource reprocessing");

  const mimeType = mime.getType(resource.name);

  if (!mimeType) {
    throw new Error(`Unable to determine file type for "${resource.name}". Please ensure the file has a valid extension (e.g., .pdf).`);
  }

  const content = await fetchFileContent(resource.url);

  let extractionResult;
  switch (mimeType) {
    case "application/pdf":
      extractionResult = await extractTextFromPdf(content);
      break;
    default:
      throw new Error(`Unsupported mime type: ${mimeType}. Only PDF files are currently supported.`);
  }

  const newContent = extractionResult.text;
  const structured = extractionResult.structured;

  // Step 1: Get old attachments for cleanup (before transaction)
  const oldAttachments = await db
    .select({ id: attachments.id, url: attachments.url })
    .from(attachments)
    .where(eq(attachments.resourceId, resource.id));

  // Step 2: Upload new images to blob storage BEFORE transaction
  const uploadedBlobs = await uploadResourceImages(structured, resource.id);

  // Step 3: Transaction - update DB
  let result;
  try {
    result = await db.transaction(async (tx) => {
      // Set transaction timeout to prevent long-running locks
      await tx.execute(sql`SET LOCAL statement_timeout = '60s'`);

      // Delete old attachments (CASCADE will not work here since we're updating, not deleting resource)
      if (oldAttachments.length > 0) {
        await tx
          .delete(attachments)
          .where(eq(attachments.resourceId, resource.id));
      }

      // Delete old fragments
      await tx
        .delete(fragmentsTable)
        .where(eq(fragmentsTable.resourceId, resource.id));

      // Process content: attachments, embeddings, and fragments
      const { finalContent, embeddings, version } = await processResourceContent(
        newContent,
        structured,
        uploadedBlobs,
        resource.gameId,
        resource.id,
        tx
      );

      // Calculate stats from structured content
      const stats = calculateResourceStats(newContent, structured);

      const now = new Date();
      const [newResource] = await tx
        .update(resources)
        .set({
          content: finalContent,
          version,
          pdfExtractor: "mistral",
          processedAt: now,
          updatedAt: now,
          ...stats,
        })
        .where(eq(resources.id, resourceId))
        .returning({
          id: resources.id,
          name: resources.name,
          url: resources.url,
          version: resources.version,
          pdfExtractor: resources.pdfExtractor,
          processedAt: resources.processedAt,
          pageCount: resources.pageCount,
          imageCount: resources.imageCount,
          wordCount: resources.wordCount,
        });

      return [newResource, embeddings.length] as const;
    });
  } catch (error) {
    // If transaction failed, clean up newly uploaded blob files
    await cleanupBlobsOnError(uploadedBlobs, 'Reprocess');
    throw error;
  }

  // Step 4: Delete old blob files after successful transaction
  const [newResource, embeddingCount] = result;
  if (oldAttachments.length > 0) {
    const oldBlobUrls = oldAttachments.map((a) => a.url);
    await deleteImages(oldBlobUrls).catch((cleanupError) => {
      log.error({ err: cleanupError }, "Failed to cleanup old blobs");
      // Don't fail the operation if cleanup fails
    });
  }

  endTimer({
    fragmentCount: embeddingCount,
    pageCount: newResource.pageCount || 0,
    imageCount: newResource.imageCount || 0,
    wordCount: newResource.wordCount || 0,
    success: true,
  });

  return {
    id: newResource.id,
    name: newResource.name,
    url: newResource.url,
    version: newResource.version,
    pdfExtractor: newResource.pdfExtractor,
    processedAt: newResource.processedAt,
    hasContent: true,
    stats: {
      fragmentCount: embeddingCount,
      pageCount: newResource.pageCount,
      imageCount: newResource.imageCount ?? 0,
      wordCount: newResource.wordCount ?? 0,
    },
  };
};
