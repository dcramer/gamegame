import { upload } from "../uploads/server";
import { env } from "@/lib/env.mjs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { PDFImage } from "../types/pdf";
import { db } from "../db";
import { attachments } from "../db/schema/attachments";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

/**
 * Detect image format from buffer magic bytes
 * @throws Error if format is unrecognized or buffer is invalid
 */
export function detectImageFormat(buffer: Buffer): { extension: string; mimeType: string } {
  // Ensure buffer has enough bytes to check magic bytes
  if (buffer.length < 4) {
    throw new Error(
      `Invalid image buffer: too small (${buffer.length} bytes). ` +
      `Minimum 4 bytes required for format detection.`
    );
  }

  // Check magic bytes for common image formats
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { extension: 'jpeg', mimeType: 'image/jpeg' };
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { extension: 'png', mimeType: 'image/png' };
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { extension: 'gif', mimeType: 'image/gif' };
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return { extension: 'webp', mimeType: 'image/webp' };
  }

  // Unrecognized format - throw error instead of guessing
  const magicBytes = Array.from(buffer.slice(0, 4))
    .map(b => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`)
    .join(' ');

  throw new Error(
    `Unrecognized image format. Magic bytes: ${magicBytes}. ` +
    `Supported formats: JPEG, PNG, GIF, WebP.`
  );
}

/**
 * Upload a PDF image to blob storage (WITHOUT database operations)
 * This should be called BEFORE the transaction to avoid blob leaks
 * @returns Object with url, mimeType, and buffer for later DB insertion
 */
export async function uploadPDFImageToBlob(
  image: PDFImage,
  resourceId: string,
  tempId: string
): Promise<{ url: string; mimeType: string; buffer: Buffer }> {
  const log = logger.child({
    operation: "uploadPDFImageToBlob",
    resourceId,
    tempId,
    pageNumber: image.pageNumber,
  });

  if (!image.base64) {
    throw new Error("Image must have base64 data to be stored");
  }

  // Strip data URI prefix if present
  let base64Data = image.base64;
  const dataUriMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    base64Data = dataUriMatch[2];
  }

  // Convert base64 to buffer
  const buffer = Buffer.from(base64Data, "base64");

  // Detect actual image format from buffer
  const { extension, mimeType } = detectImageFormat(buffer);
  log.debug({ extension, mimeType, size: buffer.length }, "Image format detected");

  // Use temp ID for filename (will be replaced with DB ID later)
  const filename = `resources/${resourceId}/attachments/${tempId}.${extension}`;

  // Upload to blob storage
  const { url } = await upload(filename, buffer);
  log.debug({ url, size: buffer.length }, "Image uploaded to blob storage");

  return { url, mimeType, buffer };
}

/**
 * Create attachment database record (within transaction)
 * Should be called AFTER blob upload succeeds
 */
export async function createAttachmentRecord(
  image: PDFImage,
  gameId: string,
  resourceId: string,
  blobUrl: string,
  mimeType: string,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<{ id: string; url: string; originalFilename?: string; bbox?: number[]; caption?: string; pageNumber?: number }> {
  const bbox =
    Array.isArray(image.bbox) && image.bbox.length === 4
      ? (image.bbox as [number, number, number, number])
      : undefined;

  const [attachment] = await tx
    .insert(attachments)
    .values({
      gameId,
      resourceId,
      type: "image",
      blobKey: blobUrl,
      url: blobUrl,
      originalFilename: image.originalFilename,
      pageNumber: image.pageNumber,
      bbox,
      caption: image.caption,
      mimeType,
      description: image.description,
      isGoodQuality: image.isGoodQuality,
    })
    .returning();

  if (!attachment) {
    throw new Error("Failed to create attachment record");
  }

  return {
    id: attachment.id,
    url: attachment.url,
    originalFilename: attachment.originalFilename || undefined,
    bbox: (attachment.bbox as number[] | undefined) || undefined,
    caption: attachment.caption || undefined,
    pageNumber: attachment.pageNumber || undefined,
  };
}

/**
 * Delete an image from blob storage
 * @param url The URL of the image to delete
 */
export async function deleteImage(url: string): Promise<void> {
  const log = logger.child({
    operation: "deleteImage",
    url,
    isProduction: !!env.BLOB_READ_WRITE_TOKEN,
  });

  if (!env.BLOB_READ_WRITE_TOKEN) {
    // Local development: delete from public/uploads
    try {
      // Handle both relative paths (/uploads/...) and absolute URLs (http://localhost:3000/uploads/...)
      let pathname: string;
      if (url.startsWith('/')) {
        // Relative path
        pathname = url;
      } else {
        // Absolute URL
        const urlObj = new URL(url);
        pathname = urlObj.pathname;
      }

      // Remove leading /uploads/ prefix if present
      // All local files should be under /uploads/, so if not, something is wrong
      const filename = pathname.startsWith('/uploads/')
        ? pathname.substring('/uploads/'.length)
        : pathname.startsWith('/')
          ? pathname.substring(1) // Remove leading slash
          : pathname; // Use as-is

      const filePath = path.join("public/uploads", filename);
      await unlink(filePath);
      log.debug({ filePath }, "Local image file deleted");
    } catch (error) {
      log.error({ err: error }, "Failed to delete local image file");
    }
  } else {
    // Production: use Vercel Blob del()
    try {
      const { del } = await import("@vercel/blob");
      await del(url);
      log.debug("Blob image deleted");
    } catch (error) {
      log.error({ err: error }, "Failed to delete blob image");
    }
  }
}

/**
 * Delete multiple images in parallel
 * @param urls Array of image URLs to delete
 */
export async function deleteImages(urls: string[]): Promise<void> {
  if (urls.length === 0) return;

  const log = logger.child({
    operation: "deleteImages",
    count: urls.length,
  });
  log.info("Deleting multiple images");

  await Promise.all(urls.map((url) => deleteImage(url)));

  log.info({ count: urls.length }, "Batch image deletion completed");
}

/**
 * Delete all images for a specific resource by extracting URLs from fragments
 * Since images are stored per-resource (resources/{resourceId}/images/),
 * we don't need to check for references - they're unique to this resource.
 * @param fragments Array of fragments containing image metadata
 */
export async function deleteResourceImages(
  fragments: Array<{
    images:
      | Array<{ id: string; url?: string; bbox?: number[]; caption?: string }>
      | null;
  }>
): Promise<void> {
  const imageUrls = new Set<string>();

  for (const fragment of fragments) {
    if (fragment.images && Array.isArray(fragment.images)) {
      for (const img of fragment.images) {
        if (img.url) {
          imageUrls.add(img.url);
        }
      }
    }
  }

  const log = logger.child({
    operation: "deleteResourceImages",
    imageCount: imageUrls.size,
  });

  if (imageUrls.size > 0) {
    log.info("Deleting resource images");
    await deleteImages(Array.from(imageUrls));
  } else {
    log.debug("No resource images to delete");
  }
}
