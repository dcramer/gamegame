/**
 * Resource Processing Service
 *
 * Handles PDF resource processing pipeline:
 * 1. Upload images to blob storage
 * 2. Generate embeddings and fragments from content
 * 3. Calculate resource statistics
 * 4. Cleanup on errors
 *
 * Ported from Workers app to Next.js with PostgreSQL/Vercel Blob integration.
 */

import { nanoid } from 'nanoid';
import type { StructuredPDFContent, PDFImage } from '../types/pdf';
import type { Attachment, NewAttachment } from '../db/schema/attachments';
import type { NewFragment, ImageMetadata } from '../db/schema/fragments';
import { attachments } from '../db/schema/attachments';
import { fragments as fragmentsTable } from '../db/schema/fragments';
import { uploadPDFImages, type UploadedImage } from './blob-storage';
import { chunkStructuredPDF, calculateResourceStats as calcStats } from './chunking';
import { generateEmbeddings, CURRENT_INDEX_VERSION } from '../ai/embeddings';
import { replaceImageReferences } from '../pdf';
import { deleteImages } from './images';
import { env } from '../env.mjs';
import { logger } from '../logger';
import { sql } from 'drizzle-orm';

/**
 * Uploaded blob metadata with URL
 */
interface UploadedBlobMetadata {
  id: string;
  url: string;
  mimeType: string;
  originalFilename: string;
  pageNumber?: number;
  bbox?: number[];
  caption?: string;
}

/**
 * Upload extracted PDF images to blob storage
 *
 * This should be called BEFORE the database transaction to avoid blob leaks.
 *
 * @param structured - Structured PDF content with images
 * @param resourceId - Resource ID for storage path
 * @returns Array of uploaded image metadata with URLs
 */
export async function uploadResourceImages(
  structured: StructuredPDFContent | undefined,
  resourceId: string
): Promise<UploadedBlobMetadata[]> {
  const log = logger.child({
    operation: 'uploadResourceImages',
    resourceId,
  });

  if (!structured) {
    log.debug('No structured content provided, skipping image upload');
    return [];
  }

  // Collect all images with base64 data from all pages
  const imagesToUpload = structured.pages.flatMap(page =>
    page.images
      .filter(img => img.base64)
      .map(img => ({
        id: img.id,
        base64: img.base64!,
        originalFilename: img.originalFilename,
        pageNumber: img.pageNumber,
        bbox: img.bbox,
        caption: img.caption,
      }))
  );

  if (imagesToUpload.length === 0) {
    log.debug('No images to upload');
    return [];
  }

  log.info({ imageCount: imagesToUpload.length }, 'Uploading PDF images to blob storage');

  // Upload all images to blob storage
  const uploadedImages = await uploadPDFImages(resourceId, imagesToUpload);

  log.info({ uploadedCount: uploadedImages.length }, 'Images uploaded successfully');

  return uploadedImages.map(img => ({
    id: img.id,
    url: img.url,
    mimeType: img.mimeType,
    originalFilename: img.originalFilename,
    pageNumber: img.pageNumber,
    bbox: img.bbox,
    caption: img.caption,
  }));
}

/**
 * Process resource content: generate fragments and embeddings
 *
 * This should be called WITHIN a database transaction.
 *
 * @param content - Markdown content with image references
 * @param structured - Structured PDF content
 * @param uploadedBlobs - Previously uploaded blob metadata
 * @param gameId - Game ID
 * @param resourceId - Resource ID
 * @param tx - Database transaction
 * @returns Final content with attachment:// references, embeddings, and version
 */
export async function processResourceContent(
  content: string,
  structured: StructuredPDFContent | undefined,
  uploadedBlobs: UploadedBlobMetadata[],
  gameId: string,
  resourceId: string,
  tx: Parameters<Parameters<typeof import('../db').db.transaction>[0]>[0]
): Promise<{
  finalContent: string;
  embeddings: NewFragment[];
  version: number;
}> {
  const log = logger.child({
    operation: 'processResourceContent',
    resourceId,
    gameId,
  });

  // Create attachment records in database
  log.info({ attachmentCount: uploadedBlobs.length }, 'Creating attachment records');
  const attachmentRecords: NewAttachment[] = uploadedBlobs.map(img => ({
    id: img.id,
    gameId,
    resourceId,
    type: 'image' as const,
    mimeType: img.mimeType,
    blobKey: img.url, // Store URL as blobKey for now (will extract key if needed)
    url: img.url,
    originalFilename: img.originalFilename || null,
    pageNumber: img.pageNumber || null,
    bbox: (img.bbox && img.bbox.length === 4)
      ? (img.bbox as [number, number, number, number])
      : null,
    caption: img.caption || null,
    width: null,
    height: null,
    description: null,
    isGoodQuality: null,
  }));

  // Insert attachments in batches to avoid parameter limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < attachmentRecords.length; i += BATCH_SIZE) {
    const batch = attachmentRecords.slice(i, i + BATCH_SIZE);
    if (batch.length > 0) {
      await tx.insert(attachments).values(batch);
    }
  }

  // Replace image references with attachment:// URLs
  let finalContent = content;
  if (structured) {
    const allImages: PDFImage[] = structured.pages.flatMap(page =>
      page.images.map(img => {
        const uploaded = uploadedBlobs.find(blob => blob.id === img.id);
        return {
          ...img,
          url: uploaded?.url || img.url,
        };
      })
    );

    const imagesWithUrls = allImages.filter(
      (img): img is PDFImage & { url: string } => !!img.url
    );
    finalContent = replaceImageReferences(content, imagesWithUrls);
  }

  // Generate chunks from structured content
  log.info('Generating chunks from structured content');
  const chunks = structured
    ? await chunkStructuredPDF(structured)
    : [{ content, pageNumber: 1, images: [] }];

  log.info({ chunkCount: chunks.length }, 'Chunks generated');

  // Prepare chunks with image metadata for embedding
  const chunksWithImages = chunks.map(chunk => {
    // Find images for this chunk by page number
    const chunkImages: ImageMetadata[] = uploadedBlobs
      .filter(img => img.pageNumber === chunk.pageNumber)
      .map(img => ({
        id: img.id,
        url: img.url,
        bbox: (img.bbox && img.bbox.length === 4)
          ? (img.bbox as [number, number, number, number])
          : undefined,
        caption: img.caption,
        description: undefined,
      }));

    return {
      content: chunk.content,
      pageNumber: chunk.pageNumber,
      pageRange: chunk.pageRange,
      section: chunk.section,
      images: chunkImages,
    };
  });

  // Generate embeddings
  log.info({ chunkCount: chunksWithImages.length }, 'Generating embeddings');
  const [embeddingsData, version] = await generateEmbeddings(
    chunksWithImages,
    env.OPENAI_API_KEY
  );
  log.info({ embeddingCount: embeddingsData.length, version }, 'Embeddings generated');

  // Create fragment records
  const fragmentRecords: NewFragment[] = embeddingsData.map(data => {
    // Convert images to ImageMetadata type with proper bbox typing
    const images: ImageMetadata[] | null = data.images && data.images.length > 0
      ? data.images.map(img => ({
          id: img.id,
          url: img.url,
          bbox: (img.bbox && Array.isArray(img.bbox) && img.bbox.length === 4)
            ? (img.bbox as [number, number, number, number])
            : undefined,
          caption: img.caption,
          description: undefined,
        }))
      : null;

    return {
      gameId,
      resourceId,
      content: data.content,
      embedding: data.embedding,
      version,
      type: 'text' as const,
      attachmentId: null,
      searchableContent: data.content, // Use same content for now
      syntheticQuestions: null,
      resourceName: null,
      resourceDescription: null,
      resourceType: null,
      pageNumber: data.pageNumber ?? null,
      pageRange: data.pageRange ?? null,
      section: data.section ?? null,
      images,
      // Generate search vector from content (use raw SQL)
      searchVector: sql`to_tsvector('english', ${data.content})` as any,
    };
  });

  // Insert fragments in batches
  log.info({ fragmentCount: fragmentRecords.length }, 'Inserting fragments');
  for (let i = 0; i < fragmentRecords.length; i += BATCH_SIZE) {
    const batch = fragmentRecords.slice(i, i + BATCH_SIZE);
    if (batch.length > 0) {
      await tx.insert(fragmentsTable).values(batch);
    }
  }

  return {
    finalContent,
    embeddings: fragmentRecords,
    version,
  };
}

/**
 * Calculate resource statistics from content and structured data
 *
 * @param content - Full markdown content
 * @param structured - Structured PDF content (optional)
 * @returns Resource statistics (pageCount, wordCount, imageCount)
 */
export function calculateResourceStats(
  content: string,
  structured: StructuredPDFContent | undefined
): {
  pageCount: number | null;
  imageCount: number;
  wordCount: number;
} {
  return calcStats(content, structured);
}

/**
 * Cleanup uploaded blobs on transaction error
 *
 * Best-effort cleanup - does not throw errors.
 *
 * @param uploadedBlobs - Previously uploaded blob metadata
 * @param context - Context string for logging (e.g., "Resource", "Reprocess")
 */
export async function cleanupBlobsOnError(
  uploadedBlobs: UploadedBlobMetadata[],
  context: string
): Promise<void> {
  if (uploadedBlobs.length === 0) {
    return;
  }

  const log = logger.child({
    operation: 'cleanupBlobsOnError',
    context,
    blobCount: uploadedBlobs.length,
  });

  log.warn('Transaction failed, cleaning up uploaded blobs');

  try {
    const urls = uploadedBlobs.map(blob => blob.url);
    await deleteImages(urls);
    log.info({ deletedCount: urls.length }, 'Blob cleanup completed');
  } catch (error) {
    log.error({ err: error }, 'Blob cleanup failed - orphaned files may exist');
    // Don't throw - cleanup is best effort
  }
}
