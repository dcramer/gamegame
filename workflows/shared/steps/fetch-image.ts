/**
 * FETCH IMAGE Step - Load image buffer from various sources
 *
 * Shared step that can fetch images from:
 * - Blob storage (via blobKey)
 * - URLs (absolute or relative)
 * - Base64 encoded strings
 */
'use step';

import { stripDataUriBase64 } from '../helpers';

export interface FetchImageInput {
  source:
    | { type: 'blobKey'; blobKey: string }
    | { type: 'url'; url: string }
    | { type: 'base64'; base64: string };
}

export interface FetchImageResult {
  success: boolean;
  buffer?: Buffer;
  error?: string;
}

export async function fetchImageStep(input: FetchImageInput): Promise<FetchImageResult> {
  try {
    let buffer: Buffer;

    switch (input.source.type) {
      case 'blobKey': {
        const { getBlob } = await import('@/lib/services/blob-storage');
        const data = await getBlob(input.source.blobKey);

        if (!data) {
          return {
            success: false,
            error: `Failed to fetch blob: ${input.source.blobKey}`,
          };
        }

        buffer = data;
        break;
      }

      case 'base64': {
        const payload = stripDataUriBase64(input.source.base64);
        buffer = Buffer.from(payload, 'base64');
        break;
      }

      case 'url': {
        const url = input.source.url;

        // If URL is relative and we're using local storage, read from filesystem
        if (url.startsWith('/') && !process.env.BLOB_READ_WRITE_TOKEN) {
          const { readFile } = await import('node:fs/promises');
          const path = await import('node:path');
          const filePath = path.join(process.cwd(), 'public', url);

          try {
            buffer = await readFile(filePath);
          } catch (error) {
            return {
              success: false,
              error: `Failed to read file from local storage at "${filePath}": ${
                error instanceof Error ? error.message : String(error)
              }`,
            };
          }
        } else {
          // Otherwise fetch from URL
          const response = await fetch(url);
          if (!response.ok) {
            return {
              success: false,
              error: `Failed to fetch image from "${url}": ${response.status} ${response.statusText}`,
            };
          }
          buffer = Buffer.from(await response.arrayBuffer());
        }
        break;
      }

      default:
        return {
          success: false,
          error: 'Invalid source type',
        };
    }

    return {
      success: true,
      buffer,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
