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
export const RESOURCE_SOURCE_FILENAME = 'source.pdf';

export function buildResourceSourceUrl(resourceId: string): string {
  return `/uploads/resources/${resourceId}`;
}

export function buildAttachmentUrl(resourceId: string, attachmentId: string, ext: string): string {
  const normalizedExt = ext.toLowerCase();
  return `/uploads/resources/${resourceId}/attachments/${attachmentId}.${normalizedExt}`;
}

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
  const ext = (mimeType.split('/')[1] || 'png').toLowerCase();
  const cleanId = imageId.replace(/\.[^./]+$/, '');
  const key = `resources/${resourceId}/attachments/${cleanId}.${ext}`;

  try {
    // Upload to R2 directly without conversion
    const result = await bucket.put(key, imageData, {
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

    if (!result) {
      throw new Error(`R2 put returned null for key: ${key}`);
    }

    return {
      id: cleanId,
      url: buildAttachmentUrl(resourceId, cleanId, ext),
      mimeType,
      originalFilename: metadata.originalFilename ?? cleanId,
      pageNumber: metadata.pageNumber,
      bbox: metadata.bbox,
      caption: metadata.caption,
      // Note: width/height not available without Sharp - could parse headers if needed
      width: undefined,
      height: undefined,
    };
  } catch (error) {
    const errorMsg = `Failed to upload image to R2 (key: ${key}): ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
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
 * Uses Promise.allSettled to continue even if individual uploads fail
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
    const base64Data = extractBase64(image.base64);
    const buffer = Buffer.from(base64Data, 'base64');
    return uploadImageToR2(bucket, resourceId, image.id, buffer, {
      originalFilename: image.originalFilename,
      pageNumber: image.pageNumber,
      bbox: image.bbox,
      caption: image.caption,
    });
  });

  const results = await Promise.allSettled(uploads);

  const successfulUploads: UploadedImage[] = [];
  const failedUploads: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successfulUploads.push(result.value);
    } else {
      const imageId = images[index].id;
      failedUploads.push(imageId);
      console.error(`Failed to upload image ${imageId}:`, result.reason);
    }
  });

  if (failedUploads.length > 0) {
    console.warn(
      `Uploaded ${successfulUploads.length}/${images.length} images. ` +
      `Failed: ${failedUploads.join(', ')}`
    );
  }

  // Return successful uploads - caller can check if count matches expected
  return successfulUploads;
}

function extractBase64(value: string): string {
  const dataUriMatch = value.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    return dataUriMatch[2];
  }
  return value;
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

  let cursor: string | undefined;
  let totalDeleted = 0;

  while (true) {
    const listed = await bucket.list({ prefix, cursor });

    if (listed.objects.length > 0) {
      const keys = listed.objects.map((obj) => obj.key);
      await bulkDeleteFromR2(bucket, keys);
      totalDeleted += keys.length;
    }

    if (!listed.truncated || !listed.cursor) {
      break;
    }

    cursor = listed.cursor;
  }

  return totalDeleted;
}

/**
 * Extract R2 key from URL
 * Handles both relative URLs (/uploads/path) and full URLs (https://...)
 */
export function extractR2KeyFromUrl(url: string): string | null {
  if (!url) {
    return null;
  }

  const [withoutQuery] = url.split('?');

  if (withoutQuery.startsWith('/uploads/')) {
    const relative = withoutQuery.replace('/uploads/', '');
    const resourceRoot = relative.match(/^resources\/([^/]+)$/);
    if (resourceRoot) {
      return `resources/${resourceRoot[1]}/${RESOURCE_SOURCE_FILENAME}`;
    }
    return relative;
  }

  const bareResourceMatch = withoutQuery.match(/^\/resources\/([^/]+)\/source\.pdf$/);
  if (bareResourceMatch) {
    return `resources/${bareResourceMatch[1]}/${RESOURCE_SOURCE_FILENAME}`;
  }

  const bareAttachmentMatch = withoutQuery.match(/^\/resources\/([^/]+)\/attachments\/(.+)$/);
  if (bareAttachmentMatch) {
    return `resources/${bareAttachmentMatch[1]}/attachments/${bareAttachmentMatch[2]}`;
  }

  const resourceRootMatch = withoutQuery.match(/^\/(?:files|uploads)\/resources\/([^/]+)$/);
  if (resourceRootMatch) {
    return `resources/${resourceRootMatch[1]}/${RESOURCE_SOURCE_FILENAME}`;
  }

  const attachmentMatch = withoutQuery.match(/^\/(?:files|uploads)\/resources\/([^/]+)\/attachments\/(.+)$/);
  if (attachmentMatch) {
    return `resources/${attachmentMatch[1]}/attachments/${attachmentMatch[2]}`;
  }

  if (withoutQuery.startsWith('/files/')) {
    return withoutQuery.replace('/files/', '');
  }

  try {
    const parsed = new URL(withoutQuery);
    const recursive = extractR2KeyFromUrl(parsed.pathname);
    if (recursive) {
      return recursive;
    }
    return parsed.pathname.startsWith('/')
      ? parsed.pathname.substring(1)
      : parsed.pathname;
  } catch {
    console.warn('Failed to parse R2 URL:', url);
    return null;
  }
}

export function normalizeResourceSourceUrl(resourceId: string, url: string | null | undefined): string | null | undefined {
  if (!url) {
    return url;
  }
  const canonical = buildResourceSourceUrl(resourceId);
  if (url === canonical) {
    return url;
  }
  const key = extractR2KeyFromUrl(url);
  if (key === `resources/${resourceId}/${RESOURCE_SOURCE_FILENAME}` || key === `resources/${resourceId}`) {
    return canonical;
  }
  return url;
}

export function normalizeAttachmentUrl(
  resourceId: string,
  url: string | null | undefined
): string | null | undefined {
  if (!url) {
    return url;
  }
  const key = extractR2KeyFromUrl(url);
  if (!key) {
    return url;
  }
  const escapedResourceId = resourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = key.match(new RegExp(`^resources/${escapedResourceId}/attachments/(.+)$`));
  if (!match) {
    return url;
  }
  const filename = match[1];
  const extMatch = filename.match(/\.([^.]+)$/);
  if (!extMatch) {
    return url;
  }
  const ext = extMatch[1].toLowerCase();
  const attachmentId = filename.replace(/\.[^.]+$/, '');
  return buildAttachmentUrl(resourceId, attachmentId, ext);
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
