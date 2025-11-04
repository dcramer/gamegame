/**
 * Blob Storage Abstraction
 *
 * Supports both Vercel Blob (production) and local filesystem (development)
 * Provides a unified interface for file operations
 */

import { put, del, list } from '@vercel/blob';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface UploadedImage {
  id: string;
  blobKey: string; // Storage key/path
  url: string;     // Public URL
  mimeType: string;
  originalFilename: string;
  pageNumber?: number;
  bbox?: number[];
  caption?: string;
  width?: number;
  height?: number;
}

/**
 * Storage backend type
 */
type StorageBackend = 'vercel-blob' | 'local';

/**
 * Get the storage backend from environment
 */
function getStorageBackend(): StorageBackend {
  // Use Vercel Blob if token is available
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return 'vercel-blob';
  }
  // Fall back to local storage for development
  return 'local';
}

/**
 * Local storage directory
 */
const LOCAL_STORAGE_DIR = path.join(process.cwd(), 'public', 'uploads');

/**
 * Convert blob key to public URL
 */
export function blobKeyToUrl(blobKey: string): string {
  return `/uploads/${blobKey}`;
}

/**
 * Build blob key for a resource source file
 */
export function buildResourceSourceKey(resourceId: string, extension: string = 'pdf'): string {
  const normalizedExt = extension.toLowerCase();
  return `resources/${resourceId}/source.${normalizedExt}`;
}

/**
 * Build blob key for an attachment
 */
export function buildAttachmentKey(resourceId: string, attachmentId: string, ext: string): string {
  const normalizedExt = ext.toLowerCase();
  return `resources/${resourceId}/attachments/${attachmentId}.${normalizedExt}`;
}

/**
 * Build URL for a resource source file
 */
export function buildResourceSourceUrl(resourceId: string, extension: string = 'pdf'): string {
  return blobKeyToUrl(buildResourceSourceKey(resourceId, extension));
}

/**
 * Extract file extension from key or filename
 */
export function getExtensionFromKey(keyOrFilename: string): string {
  const lastDot = keyOrFilename.lastIndexOf('.');
  const lastSlash = keyOrFilename.lastIndexOf('/');

  if (lastDot > lastSlash) {
    return keyOrFilename.slice(lastDot + 1).toLowerCase();
  }

  return '';
}

/**
 * Parse resource source key
 */
export function parseResourceSourceKey(blobKey: string): { resourceId: string; extension: string } | null {
  const match = blobKey.match(/^resources\/([^/]+)\/source\.([^./]+)$/);
  if (match) {
    return {
      resourceId: match[1],
      extension: match[2],
    };
  }
  return null;
}

/**
 * Simple mime type detection from buffer header
 */
export function detectMimeType(buffer: Buffer): string {
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
  // Check PDF signature
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }
  // Default to octet-stream
  return 'application/octet-stream';
}

/**
 * Upload file to blob storage (Vercel Blob or local filesystem)
 */
async function uploadToStorage(
  blobKey: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const backend = getStorageBackend();

  if (backend === 'vercel-blob') {
    // Upload to Vercel Blob
    const blob = await put(blobKey, data, {
      access: 'public',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  } else {
    // Upload to local filesystem
    const filePath = path.join(LOCAL_STORAGE_DIR, blobKey);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, data);
    return blobKeyToUrl(blobKey);
  }
}

/**
 * Upload image to blob storage
 */
export async function uploadImage(
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
  const mimeType = detectMimeType(imageData);
  const ext = (mimeType.split('/')[1] || 'png').toLowerCase();
  const cleanId = imageId.replace(/\.[^./]+$/, '');
  const blobKey = buildAttachmentKey(resourceId, cleanId, ext);

  try {
    const url = await uploadToStorage(blobKey, imageData, mimeType);

    return {
      id: cleanId,
      blobKey,
      url,
      mimeType,
      originalFilename: metadata.originalFilename ?? cleanId,
      pageNumber: metadata.pageNumber,
      bbox: metadata.bbox,
      caption: metadata.caption,
      width: undefined,
      height: undefined,
    };
  } catch (error) {
    const errorMsg = `Failed to upload image (key: ${blobKey}): ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Extract base64 data from data URI
 */
function extractBase64(value: string): string {
  const dataUriMatch = value.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    return dataUriMatch[2];
  }
  return value;
}

/**
 * Upload multiple images from PDF extraction
 */
export async function uploadPDFImages(
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
    return uploadImage(resourceId, image.id, buffer, {
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
    throw new Error(errorMsg);
  }

  return successfulUploads;
}

/**
 * Delete file from storage
 */
async function deleteFromStorage(blobKey: string): Promise<void> {
  const backend = getStorageBackend();

  if (backend === 'vercel-blob') {
    // Vercel Blob requires URLs, not keys
    const url = blobKeyToUrl(blobKey);
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } else {
    // Delete from local filesystem
    const filePath = path.join(LOCAL_STORAGE_DIR, blobKey);
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

/**
 * List files with prefix
 */
export async function listFiles(prefix: string): Promise<string[]> {
  const backend = getStorageBackend();

  if (backend === 'vercel-blob') {
    const { blobs } = await list({ prefix, token: process.env.BLOB_READ_WRITE_TOKEN });
    return blobs.map(blob => {
      // Extract key from URL
      const urlPath = new URL(blob.url).pathname;
      return urlPath.replace('/uploads/', '');
    });
  } else {
    // List from local filesystem
    const dirPath = path.join(LOCAL_STORAGE_DIR, prefix);
    try {
      const entries = await fs.readdir(dirPath, { recursive: true });
      return entries.map(entry => path.join(prefix, entry as string));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

/**
 * Delete image from storage
 */
export async function deleteImage(
  resourceId: string,
  imageId: string
): Promise<void> {
  // List all files with this imageId prefix (will match any extension)
  const prefix = `resources/${resourceId}/attachments/${imageId}.`;
  const files = await listFiles(prefix);

  if (files.length > 0) {
    await deleteFromStorage(files[0]);
  }
}

/**
 * Bulk delete from storage
 */
export async function bulkDelete(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const backend = getStorageBackend();

  if (backend === 'vercel-blob') {
    // Vercel Blob del() accepts multiple URLs
    const urls = keys.map(key => blobKeyToUrl(key));
    await del(urls, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } else {
    // Delete from local filesystem in parallel
    await Promise.all(keys.map(key => deleteFromStorage(key)));
  }
}

/**
 * Delete all files for a resource
 */
export async function deleteResourceFiles(resourceId: string): Promise<number> {
  const prefix = `resources/${resourceId}/`;
  const files = await listFiles(prefix);

  if (files.length > 0) {
    await bulkDelete(files);
  }

  return files.length;
}

/**
 * Extract blob key from URL
 */
export function extractBlobKeyFromUrl(url: string): string | null {
  if (!url) {
    return null;
  }

  const [withoutQuery] = url.split('?');

  if (withoutQuery.startsWith('/uploads/')) {
    return withoutQuery.replace('/uploads/', '');
  }

  // Handle Vercel Blob URLs
  try {
    const parsed = new URL(withoutQuery);
    if (parsed.pathname.startsWith('/uploads/')) {
      return parsed.pathname.replace('/uploads/', '');
    }
    // Vercel Blob URLs might have the key in the pathname directly
    return parsed.pathname.startsWith('/') ? parsed.pathname.substring(1) : parsed.pathname;
  } catch {
    console.warn('Failed to parse blob URL:', url);
    return null;
  }
}

/**
 * Delete attachments by URLs
 */
export async function deleteAttachmentsByUrls(urls: string[]): Promise<number> {
  const keys = urls
    .map(url => extractBlobKeyFromUrl(url))
    .filter((key): key is string => key !== null);

  if (keys.length === 0) {
    return 0;
  }

  await bulkDelete(keys);
  return keys.length;
}

/**
 * Get blob data from storage
 */
export async function getBlob(blobKey: string): Promise<Buffer | null> {
  const backend = getStorageBackend();

  if (backend === 'vercel-blob') {
    // For Vercel Blob, construct URL and fetch
    const url = blobKeyToUrl(blobKey);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(`Failed to get blob ${blobKey}:`, error);
      return null;
    }
  } else {
    // Read from local filesystem
    const filePath = path.join(LOCAL_STORAGE_DIR, blobKey);
    try {
      return await fs.readFile(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
}

/**
 * Upload blob data to storage
 */
export async function uploadBlob(
  blobKey: string,
  data: Buffer,
  contentType?: string
): Promise<string> {
  const mimeType = contentType || detectMimeType(data);
  return uploadToStorage(blobKey, data, mimeType);
}
