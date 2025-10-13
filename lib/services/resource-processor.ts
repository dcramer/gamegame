"use server";

import type { PDFImage, StructuredPDFContent } from "../types/pdf";
import {
  uploadPDFImageToBlob,
  createAttachmentRecord,
  deleteImages,
} from "./images";
import { generateEmbeddings } from "../ai/search";
import { db } from "../db";
import { fragments as fragmentsTable } from "../db/schema/fragments";

/**
 * Type-safe transaction type extracted from the database instance
 * This ensures the transaction type always matches the db configuration
 */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Attachment reference regex - matches attachment://id format
 */
export const ATTACHMENT_REFERENCE_REGEX = /attachment:\/\/([a-zA-Z0-9_-]+)/g;

/**
 * Replace attachment temp IDs with database IDs in markdown
 */
export function replaceAttachmentIds(
  content: string,
  idMapping: Map<string, string>
): string {
  return content.replace(
    ATTACHMENT_REFERENCE_REGEX,
    (match, tempId) => {
      const dbId = idMapping.get(tempId);
      return dbId ? `attachment://${dbId}` : match;
    }
  );
}

/**
 * Calculate resource stats from structured content and text
 */
export function calculateResourceStats(
  text: string,
  structured: StructuredPDFContent | undefined
): {
  pageCount: number | null;
  imageCount: number;
  wordCount: number;
} {
  const pageCount = structured?.pageCount || null;
  const imageCount = structured
    ? structured.pages.reduce((sum, p) => sum + p.images.length, 0)
    : 0;
  const wordCount = text
    ? text.split(/\s+/).filter((w) => w.length > 0).length
    : 0;

  return { pageCount, imageCount, wordCount };
}

/**
 * Upload images to blob storage (before transaction)
 */
export async function uploadResourceImages(
  structured: StructuredPDFContent | undefined,
  resourceId: string
): Promise<Array<{ tempId: string; url: string; mimeType: string; image: PDFImage }>> {
  const uploadedBlobs: Array<{
    tempId: string;
    url: string;
    mimeType: string;
    image: PDFImage;
  }> = [];

  if (structured) {
    const allImages = structured.pages
      .flatMap((p) => p.images)
      .filter((img) => img.base64);

    if (allImages.length > 0) {
      // Upload all images in parallel
      const blobUploads = await Promise.all(
        allImages.map(async (img) => {
          const { url, mimeType } = await uploadPDFImageToBlob(
            img,
            resourceId,
            img.id
          );
          return { tempId: img.id, url, mimeType, image: img };
        })
      );
      uploadedBlobs.push(...blobUploads);
    }
  }

  return uploadedBlobs;
}

/**
 * Process uploaded blobs into attachment records and replace references
 */
export async function processAttachments(
  uploadedBlobs: Array<{ tempId: string; url: string; mimeType: string; image: PDFImage }>,
  content: string,
  gameId: string,
  resourceId: string,
  tx: DbTransaction
): Promise<string> {
  if (uploadedBlobs.length === 0) {
    return content;
  }

  // Create attachment records
  const storedImages = await Promise.all(
    uploadedBlobs.map((blob) =>
      createAttachmentRecord(
        blob.image,
        gameId,
        resourceId,
        blob.url,
        blob.mimeType,
        tx
      )
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
  return replaceAttachmentIds(content, idMapping);
}

/**
 * Insert fragments in batches to avoid timeouts
 */
export async function insertFragments(
  embeddings: Array<{
    content: string;
    embedding: number[];
    pageNumber?: number;
    pageRange?: [number, number];
    section?: string;
    images?: Array<{ id: string; url: string; bbox?: number[]; caption?: string }>;
  }>,
  gameId: string,
  resourceId: string,
  version: number,
  tx: DbTransaction
): Promise<void> {
  const BATCH_SIZE = 100;

  for (let i = 0; i < embeddings.length; i += BATCH_SIZE) {
    const batch = embeddings.slice(i, i + BATCH_SIZE);
    await tx.insert(fragmentsTable).values(
      batch.map((embedding) => ({
        gameId,
        resourceId,
        content: embedding.content,
        embedding: embedding.embedding,
        version,
        pageNumber: embedding.pageNumber || null,
        pageRange: embedding.pageRange || null,
        section: embedding.section || null,
        images: embedding.images || null,
      }))
    );
  }
}

/**
 * Process resource content: attachments, embeddings, and fragments
 * This is the core shared logic used by both createResource and reprocessResource
 */
export async function processResourceContent(
  content: string,
  structured: StructuredPDFContent | undefined,
  uploadedBlobs: Array<{ tempId: string; url: string; mimeType: string; image: PDFImage }>,
  gameId: string,
  resourceId: string,
  tx: DbTransaction
): Promise<{
  finalContent: string;
  embeddings: Array<{
    content: string;
    embedding: number[];
    pageNumber?: number;
    pageRange?: [number, number];
    section?: string;
    images?: Array<{ id: string; url: string; bbox?: number[]; caption?: string }>;
  }>;
  version: number;
}> {
  // Process attachments and replace references
  const finalContent = await processAttachments(
    uploadedBlobs,
    content,
    gameId,
    resourceId,
    tx
  );

  // Generate embeddings with metadata
  const [embeddings, version] = await generateEmbeddings(
    finalContent,
    structured
  );
  if (!embeddings.length) {
    throw new Error("Failed to generate embeddings");
  }

  // Insert fragments in batches
  await insertFragments(embeddings, gameId, resourceId, version, tx);

  return { finalContent, embeddings, version };
}

/**
 * Cleanup uploaded blobs on error (best effort)
 */
export async function cleanupBlobsOnError(
  uploadedBlobs: Array<{ url: string }>,
  context: string
): Promise<void> {
  if (uploadedBlobs.length === 0) return;

  const blobUrls = uploadedBlobs.map((b) => b.url);
  await deleteImages(blobUrls).catch((cleanupError) => {
    console.error(`[${context}] Failed to cleanup blobs after transaction failure:`, cleanupError);
  });
}
