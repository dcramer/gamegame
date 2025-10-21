import type { R2Bucket } from '@cloudflare/workers-types';

export interface UploadedImage {
  id: string;
  url: string;
  mimeType: string;
  originalFilename: string;
  pageNumber?: number;
  bbox?: number[];
  caption?: string;
  width?: number;
  height?: number;
}

/**
 * Upload image to R2 bucket
 * Path: resources/{resourceId}/attachments/{imageId}.png
 *
 * Note: We store images as-is from Mistral OCR without conversion
 * since Sharp (native image processing) doesn't work in Workers
 */
export async function uploadImageToR2(
  bucket: R2Bucket,
  resourceId: string,
  imageId: string,
  imageData: Buffer,
  metadata: {
    originalFilename?: string;
    pageNumber?: number;
    bbox?: number[];
    caption?: string;
  }
): Promise<UploadedImage> {
  // Determine mime type from buffer header (simple detection)
  const mimeType = detectMimeType(imageData);
  const ext = mimeType.split('/')[1] || 'png';
  const key = `resources/${resourceId}/attachments/${imageId}.${ext}`;

  // Upload to R2 directly without conversion
  await bucket.put(key, imageData, {
    httpMetadata: {
      contentType: mimeType,
    },
    customMetadata: {
      resourceId,
      imageId,
      originalFilename: metadata.originalFilename || `image.${ext}`,
      pageNumber: metadata.pageNumber?.toString() || '',
      bbox: metadata.bbox ? JSON.stringify(metadata.bbox) : '',
      caption: metadata.caption || '',
    },
  });

  // Generate URL through worker's /uploads endpoint
  // Note: In production, you may want to use a full URL with your domain
  const url = `/uploads/${key}`;

  return {
    id: imageId,
    url,
    mimeType,
    originalFilename: metadata.originalFilename || `image.${ext}`,
    pageNumber: metadata.pageNumber,
    bbox: metadata.bbox,
    caption: metadata.caption,
    // Note: width/height not available without Sharp - could parse headers if needed
    width: undefined,
    height: undefined,
  };
}

/**
 * Simple mime type detection from buffer header
 */
function detectMimeType(buffer: Buffer): string {
  // Check PNG signature
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  // Check JPEG signature
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  // Check WebP signature
  if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp';
  }
  // Default to PNG
  return 'image/png';
}

/**
 * Upload multiple images from PDF extraction
 */
export async function uploadPDFImages(
  bucket: R2Bucket,
  resourceId: string,
  images: Array<{
    id: string;
    base64: string;
    originalFilename?: string;
    pageNumber?: number;
    bbox?: number[];
    caption?: string;
  }>
): Promise<UploadedImage[]> {
  const uploads = images.map(async (image) => {
    const buffer = Buffer.from(image.base64, 'base64');
    return uploadImageToR2(bucket, resourceId, image.id, buffer, {
      originalFilename: image.originalFilename,
      pageNumber: image.pageNumber,
      bbox: image.bbox,
      caption: image.caption,
    });
  });

  return Promise.all(uploads);
}

/**
 * Delete image from R2
 * Handles any extension (.png, .jpeg, .webp) by listing with prefix
 */
export async function deleteImageFromR2(
  bucket: R2Bucket,
  resourceId: string,
  imageId: string
): Promise<void> {
  // List all files with this imageId prefix (will match any extension)
  const prefix = `resources/${resourceId}/attachments/${imageId}.`;
  const listed = await bucket.list({ prefix, limit: 1 });

  if (listed.objects.length > 0) {
    await bucket.delete(listed.objects[0].key);
  }
}

/**
 * Delete multiple files from R2 in batches
 * R2 supports up to 1000 keys per delete call
 */
export async function bulkDeleteFromR2(
  bucket: R2Bucket,
  keys: string[]
): Promise<void> {
  if (keys.length === 0) return;

  const BATCH_SIZE = 1000;
  const batches: string[][] = [];

  // Split into batches of 1000
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    batches.push(keys.slice(i, i + BATCH_SIZE));
  }

  // Delete each batch
  await Promise.all(batches.map(batch => bucket.delete(batch)));
}

/**
 * Delete all stored files for a resource (source PDF + attachments)
 */
export async function deleteResourceFiles(
  bucket: R2Bucket,
  resourceId: string
): Promise<number> {
  const prefix = `resources/${resourceId}/`;

  // List all objects with prefix
  const listed = await bucket.list({ prefix });

  if (listed.objects.length === 0) {
    return 0;
  }

  // Extract keys and delete in bulk
  const keys = listed.objects.map(obj => obj.key);
  await bulkDeleteFromR2(bucket, keys);

  return keys.length;
}

/**
 * Extract R2 key from URL
 * Handles both relative URLs (/uploads/path) and full URLs (https://...)
 */
export function extractR2KeyFromUrl(url: string): string | null {
  // Handle relative URLs like: /uploads/resources/abc/attachments/xyz.png
  if (url.startsWith('/uploads/')) {
    return url.replace('/uploads/', '');
  }

  // Handle full R2 URLs like: https://pub-xyz.r2.dev/resources/abc/attachments/xyz.png
  try {
    const parsed = new URL(url);
    // Extract path without leading slash
    return parsed.pathname.substring(1);
  } catch {
    console.warn('Failed to parse R2 URL:', url);
    return null;
  }
}

/**
 * Delete attachments by URLs
 * Extracts R2 keys from URLs and deletes in bulk
 */
export async function deleteAttachmentsByUrls(
  bucket: R2Bucket,
  urls: string[]
): Promise<number> {
  const keys = urls
    .map(url => extractR2KeyFromUrl(url))
    .filter((key): key is string => key !== null);

  if (keys.length === 0) {
    return 0;
  }

  await bulkDeleteFromR2(bucket, keys);
  return keys.length;
}

/**
 * Get presigned URL for temporary upload (for client-side uploads)
 */
export async function createPresignedUploadUrl(): Promise<string> {
  // Note: R2 presigned URLs require additional setup
  // For now, we'll upload server-side from the Worker
  // In production, you might use Cloudflare Workers with R2 presigned URLs

  throw new Error('Presigned URLs not yet implemented - use server-side upload');
}
