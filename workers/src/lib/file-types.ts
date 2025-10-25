/**
 * File type detection and validation utilities
 * Supports multiple document formats beyond just PDFs
 */

export const SUPPORTED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'text/plain',
  'text/markdown',

  // Word processing
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc

  // Images
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
] as const;

export const SUPPORTED_EXTENSIONS = [
  // Documents
  'pdf',
  'txt',
  'md',
  'markdown',

  // Word processing
  'docx',
  'doc',

  // Images
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'tiff',
  'tif',
] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];
export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/**
 * Map file extensions to MIME types
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  // Documents
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',

  // Word processing
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',

  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
};

/**
 * Get MIME type for a file extension
 */
export function getMimeTypeForExtension(ext: string): string {
  return EXTENSION_TO_MIME[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Extract file extension from filename safely
 * Handles null bytes, multiple dots, and edge cases
 */
export function extractFileExtension(filename: string): string {
  const cleaned = filename.replace(/\0/g, ''); // Remove null bytes
  const lastDotIndex = cleaned.lastIndexOf('.');
  if (lastDotIndex < 0) return '';
  return cleaned.slice(lastDotIndex + 1).toLowerCase();
}

/**
 * Check if a file extension is supported
 */
export function isSupportedExtension(ext: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(ext.toLowerCase() as SupportedExtension);
}

/**
 * Check if a MIME type is supported
 */
export function isSupportedMimeType(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMimeType);
}

/**
 * Magic byte signatures for file type validation
 */
const MAGIC_BYTES: Record<string, { signature: number[]; offset?: number }> = {
  // PDF: %PDF-
  pdf: { signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },

  // PNG: \x89PNG\r\n\x1a\n
  png: { signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },

  // JPEG: \xFF\xD8\xFF
  jpeg: { signature: [0xff, 0xd8, 0xff] },

  // WebP: RIFF....WEBP (check 'WEBP' at offset 8)
  webp: { signature: [0x57, 0x45, 0x42, 0x50], offset: 8 },

  // GIF: GIF87a or GIF89a
  gif: { signature: [0x47, 0x49, 0x46, 0x38] },

  // BMP: BM
  bmp: { signature: [0x42, 0x4d] },

  // TIFF: II (little-endian) or MM (big-endian)
  tiff: { signature: [0x49, 0x49, 0x2a, 0x00] }, // II*\0
  tiff_be: { signature: [0x4d, 0x4d, 0x00, 0x2a] }, // MM\0*

  // ZIP-based formats (DOCX, etc.): PK\x03\x04
  zip: { signature: [0x50, 0x4b, 0x03, 0x04] },
};

/**
 * Validate file content matches expected type based on magic bytes
 * Returns the detected file type or null if unknown
 */
export function detectFileType(buffer: Uint8Array): string | null {
  if (buffer.length < 4) return null;

  // Check each magic byte signature
  for (const [type, { signature, offset = 0 }] of Object.entries(MAGIC_BYTES)) {
    if (buffer.length < offset + signature.length) continue;

    const matches = signature.every((byte, i) => buffer[offset + i] === byte);
    if (matches) {
      // Handle special cases
      if (type === 'tiff_be') return 'tiff';
      if (type === 'zip') {
        // Could be DOCX or other ZIP-based formats
        // For now, we'll need additional logic to distinguish
        return 'zip';
      }
      return type;
    }
  }

  // Plain text detection: Check if it's valid UTF-8 without control characters
  if (isValidTextFile(buffer)) {
    return 'text';
  }

  return null;
}

/**
 * Check if buffer appears to be valid UTF-8 text
 * Validates encoding and checks for excessive control characters
 */
function isValidTextFile(buffer: Uint8Array, maxSample = 1024): boolean {
  // Sample first maxSample bytes for performance
  const sample = buffer.slice(0, Math.min(buffer.length, maxSample));

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(sample);

    // Count control characters (excluding whitespace)
    let controlCharCount = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // Control chars: 0-31 (except tab=9, newline=10, carriage return=13)
      if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) {
        controlCharCount++;
      }
    }

    // If more than 5% control characters, probably not a text file
    const controlRatio = controlCharCount / text.length;
    return controlRatio < 0.05;
  } catch {
    // Not valid UTF-8
    return false;
  }
}

/**
 * Validate file buffer matches expected extension
 * Performs magic byte validation for security
 */
export function validateFileContent(buffer: Uint8Array, expectedExtension: string): {
  valid: boolean;
  detectedType: string | null;
  error?: string;
} {
  const detectedType = detectFileType(buffer);

  // Special handling for text files - no magic bytes
  if (expectedExtension === 'txt' || expectedExtension === 'md' || expectedExtension === 'markdown') {
    if (detectedType === 'text' || detectedType === null) {
      // Additional validation: ensure it's valid UTF-8
      if (isValidTextFile(buffer)) {
        return { valid: true, detectedType: 'text' };
      }
      return { valid: false, detectedType: null, error: 'File does not appear to be valid text' };
    }
    return { valid: false, detectedType, error: `Expected text file but detected ${detectedType}` };
  }

  // PDF validation
  if (expectedExtension === 'pdf') {
    if (detectedType === 'pdf') {
      return { valid: true, detectedType };
    }
    return { valid: false, detectedType, error: 'File does not appear to be a valid PDF' };
  }

  // Image validation
  const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif'];
  if (imageExtensions.includes(expectedExtension)) {
    const normalizedExtension = expectedExtension === 'jpg' ? 'jpeg' : expectedExtension;
    const normalizedTif = expectedExtension === 'tif' ? 'tiff' : normalizedExtension;

    if (detectedType === normalizedTif) {
      return { valid: true, detectedType };
    }
    return {
      valid: false,
      detectedType,
      error: `Expected ${expectedExtension} image but detected ${detectedType || 'unknown'}`,
    };
  }

  // ZIP-based formats (DOCX, DOC)
  if (expectedExtension === 'docx' || expectedExtension === 'doc') {
    if (detectedType === 'zip') {
      // ZIP signature matches - assume it's valid
      // Full validation would require inspecting ZIP contents
      return { valid: true, detectedType: 'zip' };
    }
    return {
      valid: false,
      detectedType,
      error: `Expected ${expectedExtension} document but detected ${detectedType || 'unknown'}`,
    };
  }

  // Unknown extension - reject
  return { valid: false, detectedType, error: 'Unsupported file extension' };
}

/**
 * Get human-readable file type name
 */
export function getFileTypeName(extension: string): string {
  const names: Record<string, string> = {
    pdf: 'PDF Document',
    txt: 'Plain Text',
    md: 'Markdown Document',
    markdown: 'Markdown Document',
    docx: 'Word Document',
    doc: 'Word Document',
    png: 'PNG Image',
    jpg: 'JPEG Image',
    jpeg: 'JPEG Image',
    webp: 'WebP Image',
    gif: 'GIF Image',
    bmp: 'Bitmap Image',
    tiff: 'TIFF Image',
    tif: 'TIFF Image',
  };
  return names[extension.toLowerCase()] || 'Document';
}
