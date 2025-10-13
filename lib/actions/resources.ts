"use server";

import { auth } from "@/auth";
import { generateEmbeddings } from "../ai/search";
import { db } from "../db";
import { fragments as fragmentsTable } from "../db/schema/fragments";
import { attachments } from "../db/schema/attachments";
import { insertResourceSchema, resources } from "../db/schema/resources";
import mime from "mime";
import { asc, eq, sql } from "drizzle-orm";
import { extractTextFromPdf } from "../pdf";
import {
  uploadPDFImageToBlob,
  createAttachmentRecord,
  storePDFImages,
  deleteImages,
  deleteResourceImages,
} from "../services/images";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.mjs";
import type { PDFImage } from "../types/pdf";

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
  const startTime = performance.now();
  console.log(`[Resource Processing] Starting: "${input.name}" (gameId: ${input.gameId})`);

  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

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
  const uploadedBlobs: Array<{ tempId: string; url: string; mimeType: string; image: PDFImage }> = [];
  if (structured) {
    const allImages = structured.pages.flatMap((p) => p.images).filter((img) => img.base64);

    if (allImages.length > 0) {
      // Upload all images in parallel
      const blobUploads = await Promise.all(
        allImages.map(async (img) => {
          const { url, mimeType } = await uploadPDFImageToBlob(img, input.id || 'temp', img.id);
          return { tempId: img.id, url, mimeType, image: img };
        })
      );
      uploadedBlobs.push(...blobUploads);
    }
  }

  // Step 2: Start transaction and create DB records
  let resource;
  try {
    resource = await db.transaction(async (tx) => {
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

      // Create attachment records for uploaded blobs
      let finalContent = newContent;
      if (uploadedBlobs.length > 0) {
        const storedImages = await Promise.all(
          uploadedBlobs.map((blob) =>
            createAttachmentRecord(blob.image, input.gameId, resource.id, blob.url, blob.mimeType, tx)
          )
        );

        // Build mapping of temp ID -> database ID
        const idMapping = new Map<string, string>();
        uploadedBlobs.forEach((blob, index) => {
          const stored = storedImages[index];
          if (stored) {
            idMapping.set(blob.tempId, stored.id);
            // Update image in structured content
            blob.image.id = stored.id;
            blob.image.url = stored.url;
          }
        });

        // Replace temp IDs in markdown with database IDs
        // Match only valid ID characters (alphanumeric, underscore, hyphen)
        finalContent = newContent.replace(/attachment:\/\/([a-zA-Z0-9_-]+)/g, (match, tempId) => {
          const dbId = idMapping.get(tempId);
          return dbId ? `attachment://${dbId}` : match;
        });
      }

      // Generate embeddings with metadata (using final content with database IDs)
      const [embeddings, version] = await generateEmbeddings(finalContent, structured);
      if (!embeddings.length) {
        throw new Error("Failed to generate embeddings");
      }

      // Calculate stats from structured content
      const pageCount = structured?.pageCount || null;
      const imageCount = structured
        ? structured.pages.reduce((sum, p) => sum + p.images.length, 0)
        : 0;
      const wordCount = newContent
        ? newContent.split(/\s+/).filter((w) => w.length > 0).length
        : 0;

      // Update resource with correct version, stats, and final content with database IDs
      const [updatedResource] = await tx
        .update(resources)
        .set({
          content: finalContent,
          version,
          pageCount,
          imageCount,
          wordCount,
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

      // dont batch this to avoid timeouts
      for (const embedding of embeddings) {
        await tx.insert(fragmentsTable).values({
          gameId: resource.gameId,
          resourceId: resource.id,
          content: embedding.content,
          embedding: embedding.embedding,
          version,
          pageNumber: embedding.pageNumber || null,
          pageRange: embedding.pageRange || null,
          section: embedding.section || null,
          images: embedding.images || null,
        });
      }

      return [updatedResource, embeddings.length] as const;
    });
  } catch (error) {
    // If transaction failed, clean up orphaned blob files (best effort)
    if (uploadedBlobs.length > 0) {
      const blobUrls = uploadedBlobs.map((b) => b.url);
      await deleteImages(blobUrls).catch((cleanupError) => {
        console.error('[Resource] Failed to cleanup blobs after transaction failure:', cleanupError);
      });
    }
    throw error;
  }

  const [newResource, fragmentCount] = resource;

  const elapsedTime = ((performance.now() - startTime) / 1000).toFixed(2);

  console.log(
    `[Resource Processing] Completed: "${input.name}" - ` +
    `${fragmentCount} fragments, ${newResource.pageCount || 0} pages, ` +
    `${newResource.imageCount || 0} images, ${newResource.wordCount || 0} words ` +
    `(${elapsedTime}s)`
  );

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
  const resourceList = await db
    .select({
      id: resources.id,
      name: resources.name,
      url: resources.url,
      version: resources.version,
      pdfExtractor: resources.pdfExtractor,
      processedAt: resources.processedAt,
      content: resources.content,
      hasContent: sql<boolean>`${resources.content} != '' AND ${resources.content} is not null`,
      pageCount: resources.pageCount,
      imageCount: resources.imageCount,
      wordCount: resources.wordCount,
    })
    .from(resources)
    .where(eq(resources.gameId, gameId))
    .orderBy(asc(resources.name));

  // Get fragment count for each resource (only stat not denormalized)
  const enriched = await Promise.all(
    resourceList.map(async (resource) => {
      const [{ count: fragmentCount }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(fragmentsTable)
        .where(eq(fragmentsTable.resourceId, resource.id))
        .limit(1);

      return {
        id: resource.id,
        name: resource.name,
        url: resource.url,
        version: resource.version,
        pdfExtractor: resource.pdfExtractor,
        processedAt: resource.processedAt,
        hasContent: resource.hasContent,
        stats: {
          fragmentCount: Number(fragmentCount),
          pageCount: resource.pageCount,
          imageCount: resource.imageCount ?? 0,
          wordCount: resource.wordCount ?? 0,
        },
      };
    })
  );

  return enriched;
};

export const updateResource = async (
  resourceId: string,
  input: {
    name?: string;
    content?: string;
    // url?: string;
  }
) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

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
    const updatedContent = input.content; // TypeScript narrowing
    const newResource = await db.transaction(async (tx) => {
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

      return newResource;
    });

    return newResource;
  }

  // Otherwise, just update the name (no need to regenerate embeddings)
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
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

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
      console.error('[deleteResource] Failed to cleanup blobs:', cleanupError);
      // Don't fail the operation if blob cleanup fails
    });
  }

  return {};
};

export const reprocessResource = async (resourceId: string) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const [resource] = await db
    .select()
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);
  if (!resource) {
    throw new Error("Resource not found");
  }

  const startTime = performance.now();
  console.log(`[Resource Reprocessing] Starting: "${resource.name}" (resourceId: ${resourceId})`);

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
  const uploadedBlobs: Array<{ tempId: string; url: string; mimeType: string; image: PDFImage }> = [];
  if (structured) {
    const allImages = structured.pages.flatMap((p) => p.images).filter((img) => img.base64);

    if (allImages.length > 0) {
      // Upload all images in parallel
      const blobUploads = await Promise.all(
        allImages.map(async (img) => {
          const { url, mimeType } = await uploadPDFImageToBlob(img, resource.id, img.id);
          return { tempId: img.id, url, mimeType, image: img };
        })
      );
      uploadedBlobs.push(...blobUploads);
    }
  }

  // Step 3: Transaction - update DB
  let result;
  try {
    result = await db.transaction(async (tx) => {
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

      // Create new attachment records for uploaded blobs
      let finalContent = newContent;
      if (uploadedBlobs.length > 0) {
        const storedImages = await Promise.all(
          uploadedBlobs.map((blob) =>
            createAttachmentRecord(blob.image, resource.gameId, resource.id, blob.url, blob.mimeType, tx)
          )
        );

        // Build mapping of temp ID -> database ID
        const idMapping = new Map<string, string>();
        uploadedBlobs.forEach((blob, index) => {
          const stored = storedImages[index];
          if (stored) {
            idMapping.set(blob.tempId, stored.id);
            // Update image in structured content
            blob.image.id = stored.id;
            blob.image.url = stored.url;
          }
        });

        // Replace temp IDs in markdown with database IDs
        // Match only valid ID characters (alphanumeric, underscore, hyphen)
        finalContent = newContent.replace(/attachment:\/\/([a-zA-Z0-9_-]+)/g, (match, tempId) => {
          const dbId = idMapping.get(tempId);
          return dbId ? `attachment://${dbId}` : match;
        });
      }

      const [embeddings, version] = await generateEmbeddings(finalContent, structured);
      if (!embeddings.length) {
        throw new Error("Failed to generate embeddings");
      }

      // Insert fragments with metadata
      for (const embedding of embeddings) {
        await tx.insert(fragmentsTable).values({
          gameId: resource.gameId,
          resourceId: resource.id,
          content: embedding.content,
          embedding: embedding.embedding,
          version,
          pageNumber: embedding.pageNumber || null,
          pageRange: embedding.pageRange || null,
          section: embedding.section || null,
          images: embedding.images || null,
        });
      }

      // Calculate stats from structured content
      const pageCount = structured?.pageCount || null;
      const imageCount = structured
        ? structured.pages.reduce((sum, p) => sum + p.images.length, 0)
        : 0;
      const wordCount = newContent
        ? newContent.split(/\s+/).filter((w) => w.length > 0).length
        : 0;

      const now = new Date();
      const [newResource] = await tx
        .update(resources)
        .set({
          content: finalContent,
          version,
          pdfExtractor: "mistral",
          processedAt: now,
          updatedAt: now,
          pageCount,
          imageCount,
          wordCount,
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
    // If transaction failed, clean up newly uploaded blob files (best effort)
    if (uploadedBlobs.length > 0) {
      const blobUrls = uploadedBlobs.map((b) => b.url);
      await deleteImages(blobUrls).catch((cleanupError) => {
        console.error('[Reprocess] Failed to cleanup blobs after transaction failure:', cleanupError);
      });
    }
    throw error;
  }

  // Step 4: Delete old blob files after successful transaction
  const [newResource, embeddingCount] = result;
  if (oldAttachments.length > 0) {
    const oldBlobUrls = oldAttachments.map((a) => a.url);
    await deleteImages(oldBlobUrls).catch((cleanupError) => {
      console.error('[Reprocess] Failed to cleanup old blobs:', cleanupError);
      // Don't fail the operation if cleanup fails
    });
  }

  const elapsedTime = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(
    `[Resource Reprocessing] Completed: "${newResource.name}" - ` +
    `${embeddingCount} fragments, ${newResource.pageCount || 0} pages, ` +
    `${newResource.imageCount || 0} images, ${newResource.wordCount || 0} words ` +
    `(${elapsedTime}s)`
  );

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
