"use server";

import { requireAdmin } from "../auth/helpers";
import { generateEmbeddings } from "../ai/embeddings";
import { db } from "../db";
import { fragments as fragmentsTable } from "../db/schema/fragments";
import { attachments } from "../db/schema/attachments";
import { insertResourceSchema, resources } from "../db/schema/resources";
import { games } from "../db/schema/games";
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
import { enrichPDFImagesWithVision } from "../services/vision";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.mjs";
import type { PDFImage } from "../types/pdf";
import { logger, logTiming } from "../logger";
import { nanoid } from "nanoid";

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
  const log = logger.child({
    operation: "createResource",
    resourceName: input.name,
    gameId: input.gameId
  });
  log.info("Starting async resource processing");

  await requireAdmin();

  const mimeType = mime.getType(input.name);

  if (!mimeType) {
    throw new Error(`Unable to determine file type for "${input.name}". Please ensure the file has a valid extension (e.g., .pdf).`);
  }

  if (mimeType !== "application/pdf") {
    throw new Error(`Unsupported mime type: ${mimeType}. Only PDF files are currently supported.`);
  }

  // Generate resource ID
  const resourceId = input.id ?? nanoid();

  // Fetch game name for workflow context
  const [game] = await db
    .select({ name: games.name })
    .from(games)
    .where(eq(games.id, input.gameId))
    .limit(1);

  if (!game) {
    throw new Error(`Game ${input.gameId} not found`);
  }

  // Create resource record with 'processing' status
  await db.insert(resources).values({
    id: resourceId,
    gameId: input.gameId,
    name: input.name,
    url: input.url,
    content: "",
    version: 0,
    status: "processing",
    processingStage: "ingest",
  });

  // Trigger Vercel Workflow asynchronously via API route
  const workflowUrl = `${env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/workflows/process-resource`;

  try {
    const response = await fetch(workflowUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resourceId,
        gameId: input.gameId,
        gameName: game.name,
        name: input.name,
        url: input.url,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Failed to start workflow: ${response.status} ${error.error || response.statusText}`);
    }

    const result = await response.json();
    log.info({ jobId: result.jobId }, "Workflow started successfully");

    return {
      id: resourceId,
      name: input.name,
      url: input.url,
      status: "processing" as const,
      jobId: result.jobId,
    };
  } catch (error) {
    // If workflow failed to start, mark resource as failed
    await db
      .update(resources)
      .set({
        status: "failed",
        processingStage: "failed",
      })
      .where(eq(resources.id, resourceId));

    log.error({ err: error }, "Failed to start workflow");
    throw error;
  }
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
      status: resources.status,
      processingStage: resources.processingStage,
      currentJobId: resources.currentJobId,
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
    status: resource.status,
    processingStage: resource.processingStage,
    currentJobId: resource.currentJobId,
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

  const log = logger.child({
    operation: "reprocessResource",
    resourceId,
    resourceName: resource.name,
    gameId: resource.gameId,
  });
  log.info("Starting async resource reprocessing");

  const mimeType = mime.getType(resource.name);

  if (!mimeType) {
    throw new Error(`Unable to determine file type for "${resource.name}". Please ensure the file has a valid extension (e.g., .pdf).`);
  }

  if (mimeType !== "application/pdf") {
    throw new Error(`Unsupported mime type: ${mimeType}. Only PDF files are currently supported.`);
  }

  // Fetch game name for workflow context
  const [game] = await db
    .select({ name: games.name })
    .from(games)
    .where(eq(games.id, resource.gameId))
    .limit(1);

  if (!game) {
    throw new Error(`Game ${resource.gameId} not found`);
  }

  // Delete old fragments and attachments before starting reprocess
  // This ensures we don't have duplicate data during processing
  await db.transaction(async (tx) => {
    await tx
      .delete(fragmentsTable)
      .where(eq(fragmentsTable.resourceId, resourceId));

    const oldAttachments = await tx
      .select({ url: attachments.url })
      .from(attachments)
      .where(eq(attachments.resourceId, resourceId));

    if (oldAttachments.length > 0) {
      await tx
        .delete(attachments)
        .where(eq(attachments.resourceId, resourceId));

      // Clean up old blob files in background
      const oldBlobUrls = oldAttachments.map((a) => a.url);
      deleteImages(oldBlobUrls).catch((cleanupError) => {
        log.error({ err: cleanupError }, "Failed to cleanup old blobs");
      });
    }
  });

  // Update resource status to 'processing'
  await db
    .update(resources)
    .set({
      status: "processing",
      processingStage: "ingest",
      content: "",
      version: 0,
    })
    .where(eq(resources.id, resourceId));

  // Trigger Vercel Workflow asynchronously via API route
  const workflowUrl = `${env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/workflows/process-resource`;

  try {
    const response = await fetch(workflowUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resourceId,
        gameId: resource.gameId,
        gameName: game.name,
        name: resource.name,
        url: resource.url,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Failed to start workflow: ${response.status} ${error.error || response.statusText}`);
    }

    const result = await response.json();
    log.info({ jobId: result.jobId }, "Reprocessing workflow started successfully");

    return {
      id: resourceId,
      name: resource.name,
      url: resource.url,
      status: "processing" as const,
      jobId: result.jobId,
    };
  } catch (error) {
    // If workflow failed to start, mark resource as failed
    await db
      .update(resources)
      .set({
        status: "failed",
        processingStage: "failed",
      })
      .where(eq(resources.id, resourceId));

    log.error({ err: error }, "Failed to start reprocessing workflow");
    throw error;
  }
};
