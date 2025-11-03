import type { R2Bucket } from '@cloudflare/workers-types';

export interface UploadedImage {
  id: string;
  r2Key: string; // R2 storage key
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

/**
 * @deprecated Use buildResourceSourceKey(resourceId, extension) instead
 * Legacy constant for backward compatibility
 */
export const RESOURCE_SOURCE_FILENAME = 'source.pdf';

/**
 * Convert R2 key to public URL
 */
export function r2KeyToUrl(r2Key: string): string {
  return `/uploads/${r2Key}`;
}

/**
 * Build R2 key for a resource source file
 * @param resourceId - The resource ID
 * @param extension - The file extension (without dot), e.g., 'pdf', 'txt', 'png'
 */
export function buildResourceSourceKey(resourceId: string, extension: string = 'pdf'): string {
  const normalizedExt = extension.toLowerCase();
  return `resources/${resourceId}/source.${normalizedExt}`;
}

/**
 * Build R2 key for an attachment
 */
export function buildAttachmentKey(resourceId: string, attachmentId: string, ext: string): string {
  const normalizedExt = ext.toLowerCase();
  return `resources/${resourceId}/attachments/${attachmentId}.${normalizedExt}`;
}

/**
 * Build URL for a resource source file
 * @param resourceId - The resource ID
 * @param extension - The file extension (without dot), defaults to 'pdf' for backward compat
 */
export function buildResourceSourceUrl(resourceId: string, extension: string = 'pdf'): string {
  return r2KeyToUrl(buildResourceSourceKey(resourceId, extension));
}


/**
 * Extract file extension from R2 key or filename
 * @param keyOrFilename - R2 key or filename
 * @returns Extension without dot, or empty string if none found
 */
export function getExtensionFromKey(keyOrFilename: string): string {
  const lastDot = keyOrFilename.lastIndexOf('.');
  const lastSlash = keyOrFilename.lastIndexOf('/');

  // If dot comes after last slash (or no slash), it's a valid extension
  if (lastDot > lastSlash) {
    return keyOrFilename.slice(lastDot + 1).toLowerCase();
  }

  return '';
}

/**
 * Get the resource ID and extension from an R2 source key
 * @param r2Key - R2 key like 'resources/{id}/source.{ext}'
 * @returns {resourceId, extension} or null if invalid format
 */
export function parseResourceSourceKey(r2Key: string): { resourceId: string; extension: string } | null {
  const match = r2Key.match(/^resources\/([^/]+)\/source\.([^./]+)$/);
  if (match) {
    return {
      resourceId: match[1],
      extension: match[2],
    };
  }
  return null;
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
      r2Key: key,
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
    const errorMsg =
      `Failed to upload ${failedUploads.length}/${images.length} images. ` +
      `Failed IDs: ${failedUploads.join(', ')}. ` +
      `This will result in missing images in the knowledge base.`;
    console.error(errorMsg);

    // Throw error to make failures explicit and prevent partial processing
    throw new Error(errorMsg);
  }

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
 * Now supports any file extension, not just .pdf
 */
export function extractR2KeyFromUrl(url: string): string | null {
  if (!url) {
    return null;
  }

  const [withoutQuery] = url.split('?');

  if (withoutQuery.startsWith('/uploads/')) {
    const relative = withoutQuery.replace('/uploads/', '');
    // Check if it's a bare resource reference (no filename)
    const resourceRoot = relative.match(/^resources\/([^/]+)$/);
    if (resourceRoot) {
      // Default to .pdf for backward compatibility with bare references
      return `resources/${resourceRoot[1]}/source.pdf`;
    }
    return relative;
  }

  // Match source files with any extension: /resources/{id}/source.{ext}
  const bareResourceMatch = withoutQuery.match(/^\/resources\/([^/]+)\/source\.([^./]+)$/);
  if (bareResourceMatch) {
    return `resources/${bareResourceMatch[1]}/source.${bareResourceMatch[2]}`;
  }

  const bareAttachmentMatch = withoutQuery.match(/^\/resources\/([^/]+)\/attachments\/(.+)$/);
  if (bareAttachmentMatch) {
    return `resources/${bareAttachmentMatch[1]}/attachments/${bareAttachmentMatch[2]}`;
  }

  const resourceRootMatch = withoutQuery.match(/^\/(?:files|uploads)\/resources\/([^/]+)$/);
  if (resourceRootMatch) {
    // Default to .pdf for backward compatibility with bare references
    return `resources/${resourceRootMatch[1]}/source.pdf`;
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
  return r2KeyToUrl(buildAttachmentKey(resourceId, attachmentId, ext));
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
