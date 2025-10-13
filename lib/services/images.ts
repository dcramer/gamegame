import { upload } from "../uploads/server";
import { env } from "@/lib/env.mjs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { PDFImage } from "../types/pdf";
import { db } from "../db";
import { attachments } from "../db/schema/attachments";
import { eq } from "drizzle-orm";

/**
 * Detect image format from buffer magic bytes
 */
export function detectImageFormat(buffer: Buffer): { extension: string; mimeType: string } {
  // Ensure buffer has enough bytes to check
  if (buffer.length < 4) {
    // For very small buffers, default to JPEG
    return { extension: 'jpeg', mimeType: 'image/jpeg' };
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
  // Default to JPEG (most common from Mistral OCR)
  return { extension: 'jpeg', mimeType: 'image/jpeg' };
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

  // Use temp ID for filename (will be replaced with DB ID later)
  const filename = `resources/${resourceId}/attachments/${tempId}.${extension}`;

  // Upload to blob storage
  const { url } = await upload(filename, buffer);

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
  const [attachment] = await tx
    .insert(attachments)
    .values({
      gameId,
      resourceId,
      type: "image",
      url: blobUrl,
      originalFilename: image.originalFilename,
      pageNumber: image.pageNumber,
      bbox: image.bbox,
      caption: image.caption,
      mimeType,
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
 * Legacy function - kept for backward compatibility
 * For new code, prefer uploadPDFImageToBlob + createAttachmentRecord pattern
 */
export async function storePDFImage(
  image: PDFImage,
  gameId: string,
  resourceId: string,
  tx?: typeof db
): Promise<{ id: string; url: string; originalFilename?: string; bbox?: number[]; caption?: string; pageNumber?: number }> {
  if (!image.base64) {
    throw new Error("Image must have base64 data to be stored");
  }

  // Strip data URI prefix if present (e.g., "data:image/jpeg;base64,")
  // Mistral OCR returns imageBase64 with this prefix, which needs to be removed before decoding
  let base64Data = image.base64;
  const dataUriMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    base64Data = dataUriMatch[2];
  }

  // Convert base64 to buffer
  const buffer = Buffer.from(base64Data, "base64");

  // Detect actual image format from buffer
  const { extension, mimeType } = detectImageFormat(buffer);

  // Use transaction if provided, otherwise use global db
  const dbClient = tx || db;

  // First, create database record to get a real ID
  const [attachment] = await dbClient
    .insert(attachments)
    .values({
      gameId,
      resourceId,
      type: "image",
      url: "", // Placeholder, will update after upload
      originalFilename: image.originalFilename,
      pageNumber: image.pageNumber,
      bbox: image.bbox,
      caption: image.caption,
      mimeType,
    })
    .returning();

  if (!attachment) {
    throw new Error("Failed to create attachment record");
  }

  // Generate filename using database ID and correct extension
  const filename = `resources/${resourceId}/attachments/${attachment.id}.${extension}`;

  // Upload to blob storage
  const { url } = await upload(filename, buffer);

  // Update database record with actual URL
  await dbClient
    .update(attachments)
    .set({ url })
    .where(eq(attachments.id, attachment.id));

  // Return attachment with database ID and URL
  return {
    id: attachment.id,
    url,
    originalFilename: attachment.originalFilename || undefined,
    bbox: (attachment.bbox as number[] | undefined) || undefined,
    caption: attachment.caption || undefined,
    pageNumber: attachment.pageNumber || undefined,
  };
}

/**
 * Store multiple PDF images in parallel
 * @param pdfImages Array of PDF images with base64 data (without database IDs yet)
 * @param gameId The game ID these images belong to
 * @param resourceId The resource ID these images belong to
 * @param tx Optional database transaction to use
 * @returns Array of attachments with database IDs and URLs
 */
export async function storePDFImages(
  pdfImages: PDFImage[],
  gameId: string,
  resourceId: string,
  tx?: typeof db
): Promise<Array<{ id: string; url: string; originalFilename?: string; bbox?: number[]; caption?: string; pageNumber?: number }>> {
  // Filter images that have base64 data
  const imagesToStore = pdfImages.filter((img) => img.base64);

  if (imagesToStore.length === 0) {
    return [];
  }

  // Store all images in parallel
  const storedImages = await Promise.all(
    imagesToStore.map((img) => storePDFImage(img, gameId, resourceId, tx))
  );

  return storedImages;
}

/**
 * Delete an image from blob storage
 * @param url The URL of the image to delete
 */
export async function deleteImage(url: string): Promise<void> {
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
    } catch (error) {
      console.error(`[deleteImage] Failed to delete local file ${url}:`, error);
    }
  } else {
    // Production: use Vercel Blob del()
    try {
      const { del } = await import("@vercel/blob");
      await del(url);
    } catch (error) {
      console.error(`[deleteImage] Failed to delete blob ${url}:`, error);
    }
  }
}

/**
 * Delete multiple images in parallel
 * @param urls Array of image URLs to delete
 */
export async function deleteImages(urls: string[]): Promise<void> {
  if (urls.length === 0) return;

  await Promise.all(urls.map((url) => deleteImage(url)));
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

  if (imageUrls.size > 0) {
    await deleteImages(Array.from(imageUrls));
  }
}
