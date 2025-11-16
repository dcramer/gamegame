import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uploadImage,
  uploadPDFImages,
  deleteImage,
  bulkDelete,
  deleteResourceFiles,
  buildResourceSourceKey,
  buildAttachmentKey,
  blobKeyToUrl,
  getExtensionFromKey,
  parseResourceSourceKey,
  extractBlobKeyFromUrl,
} from './blob-storage';

// Mock Vercel Blob
vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
  del: vi.fn(),
  list: vi.fn(),
}));

// Mock fs for local storage
vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  readdir: vi.fn(),
}));

describe('Blob Storage - Key Building', () => {
  it('should build resource source key', () => {
    expect(buildResourceSourceKey('res-123')).toBe('resources/res-123/source.pdf');
    expect(buildResourceSourceKey('res-123', 'txt')).toBe('resources/res-123/source.txt');
  });

  it('should build attachment key', () => {
    expect(buildAttachmentKey('res-123', 'img-1', 'png')).toBe(
      'resources/res-123/attachments/img-1.png'
    );
    expect(buildAttachmentKey('res-123', 'img-1', 'JPEG')).toBe(
      'resources/res-123/attachments/img-1.jpeg'
    );
  });

  it('should convert key to URL', () => {
    expect(blobKeyToUrl('resources/res-123/source.pdf')).toBe(
      '/uploads/resources/res-123/source.pdf'
    );
  });

  it('should extract extension from key', () => {
    expect(getExtensionFromKey('file.pdf')).toBe('pdf');
    expect(getExtensionFromKey('resources/res-123/source.PDF')).toBe('pdf');
    expect(getExtensionFromKey('path/to/file.jpeg')).toBe('jpeg');
    expect(getExtensionFromKey('noextension')).toBe('');
  });

  it('should parse resource source key', () => {
    expect(parseResourceSourceKey('resources/res-123/source.pdf')).toEqual({
      resourceId: 'res-123',
      extension: 'pdf',
    });

    expect(parseResourceSourceKey('resources/res-123/source.txt')).toEqual({
      resourceId: 'res-123',
      extension: 'txt',
    });

    expect(parseResourceSourceKey('invalid/key')).toBeNull();
  });
});

describe('Blob Storage - URL Extraction', () => {
  it('should extract key from /uploads/ URL', () => {
    expect(extractBlobKeyFromUrl('/uploads/resources/res-123/source.pdf')).toBe(
      'resources/res-123/source.pdf'
    );
  });

  it('should extract key from Vercel Blob URL', () => {
    const url = 'https://blob.vercel-storage.com/resources/res-123/attachments/img-1.png';
    const key = extractBlobKeyFromUrl(url);
    expect(key).toBe('resources/res-123/attachments/img-1.png');
  });

  it('should handle URLs with query parameters', () => {
    const url = '/uploads/resources/res-123/source.pdf?token=abc123';
    expect(extractBlobKeyFromUrl(url)).toBe('resources/res-123/source.pdf');
  });

  it('should return null for invalid URLs', () => {
    expect(extractBlobKeyFromUrl('')).toBeNull();
    expect(extractBlobKeyFromUrl(null as any)).toBeNull();
  });
});

describe('Blob Storage - Upload (Local Mode)', () => {
  beforeEach(() => {
    // Clear BLOB_READ_WRITE_TOKEN to use local storage
    delete process.env.BLOB_READ_WRITE_TOKEN;
    vi.clearAllMocks();
  });

  it('should upload image to local storage', async () => {
    const fs = await import('fs/promises');
    (fs.mkdir as any).mockResolvedValue(undefined);
    (fs.writeFile as any).mockResolvedValue(undefined);

    const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG signature
    const result = await uploadImage('res-123', 'img-1', buffer, {
      originalFilename: 'test.png',
      pageNumber: 1,
    });

    expect(result).toEqual({
      id: 'img-1',
      blobKey: 'resources/res-123/attachments/img-1.png',
      url: '/uploads/resources/res-123/attachments/img-1.png',
      mimeType: 'image/png',
      originalFilename: 'test.png',
      pageNumber: 1,
      bbox: undefined,
      caption: undefined,
      width: undefined,
      height: undefined,
    });

    expect(fs.mkdir).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should detect JPEG mime type', async () => {
    const fs = await import('fs/promises');
    (fs.mkdir as any).mockResolvedValue(undefined);
    (fs.writeFile as any).mockResolvedValue(undefined);

    const buffer = Buffer.from([0xFF, 0xD8, 0xFF]); // JPEG signature
    const result = await uploadImage('res-123', 'img-1', buffer, {});

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.blobKey).toBe('resources/res-123/attachments/img-1.jpeg');
  });

  it('should detect WebP mime type', async () => {
    const fs = await import('fs/promises');
    (fs.mkdir as any).mockResolvedValue(undefined);
    (fs.writeFile as any).mockResolvedValue(undefined);

    const buffer = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]); // WebP signature
    const result = await uploadImage('res-123', 'img-1', buffer, {});

    expect(result.mimeType).toBe('image/webp');
    expect(result.blobKey).toBe('resources/res-123/attachments/img-1.webp');
  });

  it('should strip existing extension from imageId', async () => {
    const fs = await import('fs/promises');
    (fs.mkdir as any).mockResolvedValue(undefined);
    (fs.writeFile as any).mockResolvedValue(undefined);

    const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG
    const result = await uploadImage('res-123', 'img-1.old.jpeg', buffer, {});

    expect(result.id).toBe('img-1.old');
    expect(result.blobKey).toBe('resources/res-123/attachments/img-1.old.png');
  });
});

describe('Blob Storage - Upload (Vercel Blob Mode)', () => {
  beforeEach(() => {
    // Set BLOB_READ_WRITE_TOKEN to use Vercel Blob
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it('should upload image to Vercel Blob', async () => {
    const { put } = await import('@vercel/blob');
    (put as any).mockResolvedValue({
      url: 'https://blob.vercel-storage.com/resources/res-123/attachments/img-1.png',
    });

    const buffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG
    const result = await uploadImage('res-123', 'img-1', buffer, {
      originalFilename: 'test.png',
    });

    expect(result.url).toBe('https://blob.vercel-storage.com/resources/res-123/attachments/img-1.png');
    expect(put).toHaveBeenCalledWith(
      'resources/res-123/attachments/img-1.png',
      buffer,
      {
        access: 'public',
        contentType: 'image/png',
        token: 'test-token',
      }
    );
  });
});

describe('Blob Storage - Batch Upload', () => {
  beforeEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    vi.clearAllMocks();
  });

  it('should upload multiple images', async () => {
    const fs = await import('fs/promises');
    (fs.mkdir as any).mockResolvedValue(undefined);
    (fs.writeFile as any).mockResolvedValue(undefined);

    const images = [
      {
        id: 'img-1',
        base64: Buffer.from([0x89, 0x50, 0x4E, 0x47]).toString('base64'),
        pageNumber: 1,
      },
      {
        id: 'img-2',
        base64: `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4E, 0x47]).toString('base64')}`,
        pageNumber: 2,
      },
    ];

    const results = await uploadPDFImages('res-123', images);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('img-1');
    expect(results[1].id).toBe('img-2');
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
  });

  it('should handle partial failures', async () => {
    const fs = await import('fs/promises');
    (fs.mkdir as any).mockResolvedValue(undefined);

    // First upload succeeds, second fails
    (fs.writeFile as any)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Disk full'));

    const images = [
      { id: 'img-1', base64: Buffer.from([0x89, 0x50, 0x4E, 0x47]).toString('base64') },
      { id: 'img-2', base64: Buffer.from([0x89, 0x50, 0x4E, 0x47]).toString('base64') },
    ];

    await expect(uploadPDFImages('res-123', images)).rejects.toThrow(
      'Failed to upload 1/2 images'
    );
  });

  it('should extract base64 from data URI', async () => {
    const fs = await import('fs/promises');
    (fs.mkdir as any).mockResolvedValue(undefined);
    (fs.writeFile as any).mockResolvedValue(undefined);

    const base64Data = Buffer.from([0x89, 0x50, 0x4E, 0x47]).toString('base64');
    const images = [
      { id: 'img-1', base64: `data:image/png;base64,${base64Data}` },
    ];

    const results = await uploadPDFImages('res-123', images);
    expect(results).toHaveLength(1);
  });
});

describe('Blob Storage - Delete', () => {
  beforeEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    vi.clearAllMocks();
  });

  it('should delete image from local storage', async () => {
    const fs = await import('fs/promises');
    (fs.readdir as any).mockResolvedValue(['img-1.png']);
    (fs.unlink as any).mockResolvedValue(undefined);

    await deleteImage('res-123', 'img-1');

    expect(fs.unlink).toHaveBeenCalled();
  });

  it('should handle file not found', async () => {
    const fs = await import('fs/promises');
    (fs.readdir as any).mockResolvedValue([]);

    // Should not throw
    await deleteImage('res-123', 'img-1');
  });

  it('should bulk delete files', async () => {
    const fs = await import('fs/promises');
    (fs.unlink as any).mockResolvedValue(undefined);

    const keys = [
      'resources/res-123/attachments/img-1.png',
      'resources/res-123/attachments/img-2.png',
    ];

    await bulkDelete(keys);

    expect(fs.unlink).toHaveBeenCalledTimes(2);
  });

  it('should delete all resource files', async () => {
    const fs = await import('fs/promises');
    (fs.readdir as any).mockResolvedValue(['source.pdf', 'attachments/img-1.png']);
    (fs.unlink as any).mockResolvedValue(undefined);

    const count = await deleteResourceFiles('res-123');

    expect(count).toBe(2);
  });
});

describe('Blob Storage - Delete (Vercel Blob Mode)', () => {
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it('should delete from Vercel Blob', async () => {
    const { del, list } = await import('@vercel/blob');
    (list as any).mockResolvedValue({
      blobs: [
        { url: 'https://blob.vercel-storage.com/resources/res-123/attachments/img-1.png' },
      ],
    });
    (del as any).mockResolvedValue(undefined);

    await deleteImage('res-123', 'img-1');

    expect(list).toHaveBeenCalled();
    expect(del).toHaveBeenCalled();
  });

  it('should bulk delete from Vercel Blob', async () => {
    const { del } = await import('@vercel/blob');
    (del as any).mockResolvedValue(undefined);

    const keys = [
      'resources/res-123/attachments/img-1.png',
      'resources/res-123/attachments/img-2.png',
    ];

    await bulkDelete(keys);

    expect(del).toHaveBeenCalledWith(
      ['/uploads/resources/res-123/attachments/img-1.png', '/uploads/resources/res-123/attachments/img-2.png'],
      { token: 'test-token' }
    );
  });
});
