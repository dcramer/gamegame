/**
 * Tests for Attachment Reprocess API Route
 * POST /api/attachments/[attachmentId]/reprocess - Reprocess attachment with vision
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { POST as reprocessAttachment } from '@/app/api/attachments/[attachmentId]/reprocess/route';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cleanupTestDb } from '@/tests/db-helpers';
import { createTestGame, createTestResource, createTestAttachment } from '@/tests/fixtures';

// Mock the vision analysis function (external API)
vi.mock('@/lib/services/image-analysis', () => ({
  analyzeImageQuality: vi.fn(() =>
    Promise.resolve({
      description: 'A game board showing player positions and resources',
      quality: 'high',
      relevant: true,
      type: 'diagram',
      ocrText: 'Player 1: 5 points',
    })
  ),
}));

// Mock requireAdmin
vi.mock('@/lib/auth/helpers', () => ({
  requireAdmin: vi.fn(),
}));

// Mock blob storage URL helper
vi.mock('@/lib/services/blob-storage', () => ({
  blobKeyToUrl: vi.fn((key: string) => `https://blob.example.com/${key}`),
}));

// Mock env to provide required environment variables
vi.mock('@/lib/env.mjs', () => ({
  env: {
    OPENAI_API_KEY: 'test-openai-key',
    BLOB_READ_WRITE_TOKEN: undefined,
  },
}));

describe.sequential('Attachment Reprocess API', () => {
  let testGameId: string;
  let testResourceId: string;
  let testAttachmentId: string;

  beforeEach(async () => {
    await cleanupTestDb();

    // Reset mocks
    vi.clearAllMocks();

    // Mock global fetch to return fake image data
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      } as Response)
    );

    // Mock requireAdmin to allow all requests
    const { requireAdmin } = await import('@/lib/auth/helpers');
    (requireAdmin as any).mockResolvedValue(undefined);

    // Create test data
    const game = await createTestGame({ name: 'Test Game' });
    const resource = await createTestResource(game.id, {
      name: 'Test Resource',
    });
    const attachment = await createTestAttachment(resource.id, game.id, {
      type: 'image',
      mimeType: 'image/png',
      url: 'https://blob.example.com/test-image.png',
      blobKey: 'test-image.png',
      caption: 'Original caption',
    });

    testGameId = game.id;
    testResourceId = resource.id;
    testAttachmentId = attachment.id;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/attachments/[attachmentId]/reprocess', () => {
    it('should reject unauthorized requests', async () => {
      const { requireAdmin } = await import('@/lib/auth/helpers');
      (requireAdmin as any).mockRejectedValue(new Error('Unauthorized'));

      const response = await reprocessAttachment(new NextRequest('http://localhost'), {
        params: Promise.resolve({ attachmentId: testAttachmentId }),
      });
      const data = await response.json();

      expect(response.status).toBe(500); // Auth error gets caught by general error handler
      expect(data.error).toBeDefined();
    });

    it('should reject non-existent attachment', async () => {
      const response = await reprocessAttachment(new NextRequest('http://localhost'), {
        params: Promise.resolve({ attachmentId: 'non-existent-id' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Attachment not found');
    });

    it('should reject non-image attachments', async () => {
      // Create a non-image attachment
      const pdfAttachment = await createTestAttachment(testResourceId, testGameId, {
        type: 'pdf',
        mimeType: 'application/pdf',
      });

      const response = await reprocessAttachment(new NextRequest('http://localhost'), {
        params: Promise.resolve({ attachmentId: pdfAttachment.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Only image attachments can be reprocessed with vision');
    });

    it('should reject attachments with non-image mimeType', async () => {
      // Create attachment with image type but wrong mimeType
      const badAttachment = await createTestAttachment(testResourceId, testGameId, {
        type: 'image',
        mimeType: 'text/plain',
      });

      const response = await reprocessAttachment(new NextRequest('http://localhost'), {
        params: Promise.resolve({ attachmentId: badAttachment.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Only image attachments can be reprocessed with vision');
    });

    it('should successfully reprocess image attachment', async () => {
      const { analyzeImageQuality } = await import('@/lib/services/image-analysis');

      const response = await reprocessAttachment(new NextRequest('http://localhost'), {
        params: Promise.resolve({ attachmentId: testAttachmentId }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(analyzeImageQuality).toHaveBeenCalled();

      // Verify response data
      expect(data.id).toBe(testAttachmentId);
      expect(data.description).toBe('A game board showing player positions and resources');
      expect(data.isGoodQuality).toBe('high');
      expect(data.isRelevant).toBe(1); // true converted to 1
      expect(data.detectedType).toBe('diagram');
      expect(data.ocrText).toBe('Player 1: 5 points');

      // Verify database was updated
      const [updatedAttachment] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, testAttachmentId))
        .limit(1);

      expect(updatedAttachment.description).toBe('A game board showing player positions and resources');
      expect(updatedAttachment.isGoodQuality).toBe('high');
      expect(updatedAttachment.isRelevant).toBe(1);
      expect(updatedAttachment.detectedType).toBe('diagram');
      expect(updatedAttachment.ocrText).toBe('Player 1: 5 points');
    });

    it('should pass correct context to vision analysis', async () => {
      const { analyzeImageQuality } = await import('@/lib/services/image-analysis');

      // Create attachment with specific metadata
      const testAttachment = await createTestAttachment(testResourceId, testGameId, {
        type: 'image',
        mimeType: 'image/jpeg',
        pageNumber: 5,
        caption: 'Setup diagram',
        blobKey: 'test-key.jpg',
      });

      await reprocessAttachment(new NextRequest('http://localhost'), {
        params: Promise.resolve({ attachmentId: testAttachment.id }),
      });

      // Verify analyzeImageQuality was called with correct metadata
      expect(analyzeImageQuality).toHaveBeenCalledWith(
        expect.any(Buffer),
        {
          pageNumber: 5,
          section: undefined,
          caption: 'Setup diagram',
        },
        expect.any(String) // OPENAI_API_KEY
      );
    });

    it('should handle vision analysis with null ocrText', async () => {
      const { analyzeImageQuality } = await import('@/lib/services/image-analysis');
      (analyzeImageQuality as any).mockResolvedValueOnce({
        description: 'Abstract game art',
        quality: 'medium',
        relevant: false,
        type: 'artwork',
        ocrText: null,
      });

      const response = await reprocessAttachment(new NextRequest('http://localhost'), {
        params: Promise.resolve({ attachmentId: testAttachmentId }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ocrText).toBeNull();
      expect(data.isRelevant).toBe(0); // false converted to 0
    });

    it('should handle vision analysis errors', async () => {
      const { analyzeImageQuality } = await import('@/lib/services/image-analysis');
      (analyzeImageQuality as any).mockRejectedValueOnce(new Error('Vision API timeout'));

      const response = await reprocessAttachment(new NextRequest('http://localhost'), {
        params: Promise.resolve({ attachmentId: testAttachmentId }),
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Vision API timeout');
    });

    it('should include blobKey URL in response', async () => {
      const { blobKeyToUrl } = await import('@/lib/services/blob-storage');

      const testAttachment = await createTestAttachment(testResourceId, testGameId, {
        type: 'image',
        mimeType: 'image/png',
        blobKey: 'my-blob-key.png',
      });

      const response = await reprocessAttachment(new NextRequest('http://localhost'), {
        params: Promise.resolve({ attachmentId: testAttachment.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(blobKeyToUrl).toHaveBeenCalledWith('my-blob-key.png');
      expect(data.url).toBe('https://blob.example.com/my-blob-key.png');
    });

    it('should parse bbox from array format', async () => {
      const testAttachment = await createTestAttachment(testResourceId, testGameId, {
        type: 'image',
        mimeType: 'image/png',
        bbox: [100, 200, 400, 600] as any,
      });

      const response = await reprocessAttachment(new NextRequest('http://localhost'), {
        params: Promise.resolve({ attachmentId: testAttachment.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.bbox).toEqual([100, 200, 400, 600]);
    });
  });
});
