/**
 * Tests for Attachment Reprocess API Route
 * POST /api/attachments/[attachmentId]/reprocess - Reprocess attachment with vision
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { POST as reprocessAttachment } from '@/app/api/attachments/[attachmentId]/reprocess/route';
import { createNextRequest, createRouteContext } from '@/tests/utils/next-request';
import { db } from '@/lib/db';
import { attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cleanupTestDb } from '@/tests/db-helpers';
import { createTestGame, createTestResource, createTestAttachment } from '@/tests/fixtures';

// Mock the unified workflow
vi.mock('@/workflows/analyze-images', () => ({
  analyzeImagesWorkflow: vi.fn(() =>
    Promise.resolve({
      success: true,
      mode: 'single-attachment',
    })
  ),
}));

// Mock requireAdmin from session module
vi.mock('@/lib/session', () => ({
  requireAdmin: vi.fn(() => Promise.resolve({ id: 'test-user', email: 'admin@test.com', isAdmin: true })),
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
    const { requireAdmin } = await import('@/lib/session');
    (requireAdmin as any).mockResolvedValue({ id: 'test-user', email: 'admin@test.com', isAdmin: true });

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
      const { requireAdmin } = await import('@/lib/session');
      (requireAdmin as any).mockRejectedValueOnce(new Error('Unauthorized'));

      const response = await reprocessAttachment(createNextRequest('http://localhost'), createRouteContext({ attachmentId: testAttachmentId }));
      const data = await response.json();

      expect(response.status).toBe(401); // Unauthorized
      expect(data.error).toBe('Authentication required');
    });

    it('should reject non-existent attachment', async () => {
      const response = await reprocessAttachment(createNextRequest('http://localhost'), createRouteContext({ attachmentId: 'non-existent-id' }));
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

      const response = await reprocessAttachment(createNextRequest('http://localhost'), createRouteContext({ attachmentId: pdfAttachment.id }));
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

      const response = await reprocessAttachment(createNextRequest('http://localhost'), createRouteContext({ attachmentId: badAttachment.id }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Only image attachments can be reprocessed with vision');
    });

    it('should successfully reprocess image attachment', async () => {
      const { analyzeImagesWorkflow } = await import('@/workflows/analyze-images');

      // Update the attachment first to simulate what the workflow does
      await db
        .update(attachments)
        .set({
          description: 'A game board showing player positions and resources',
          isGoodQuality: 'good',
          isRelevant: 1,
          detectedType: 'diagram',
          ocrText: 'Player 1: 5 points',
        })
        .where(eq(attachments.id, testAttachmentId));

      const response = await reprocessAttachment(createNextRequest('http://localhost'), createRouteContext({ attachmentId: testAttachmentId }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(analyzeImagesWorkflow).toHaveBeenCalledWith({
        mode: 'single-attachment',
        attachmentId: testAttachmentId,
        gameId: testGameId,
      });

      // Verify response data
      expect(data.id).toBe(testAttachmentId);
      expect(data.description).toBe('A game board showing player positions and resources');
      expect(data.isGoodQuality).toBe('good');
      expect(data.isRelevant).toBe(1);
      expect(data.detectedType).toBe('diagram');
      expect(data.ocrText).toBe('Player 1: 5 points');
    });

    it('should pass correct parameters to workflow', async () => {
      const { analyzeImagesWorkflow } = await import('@/workflows/analyze-images');

      // Create attachment with specific metadata
      const testAttachment = await createTestAttachment(testResourceId, testGameId, {
        type: 'image',
        mimeType: 'image/jpeg',
        pageNumber: 5,
        caption: 'Setup diagram',
        blobKey: 'test-key.jpg',
      });

      await reprocessAttachment(createNextRequest('http://localhost'), createRouteContext({ attachmentId: testAttachment.id }));

      // Verify workflow was called with correct parameters
      expect(analyzeImagesWorkflow).toHaveBeenCalledWith({
        mode: 'single-attachment',
        attachmentId: testAttachment.id,
        gameId: testGameId,
      });
    });

    it('should handle vision analysis with null ocrText', async () => {
      // Update attachment to simulate workflow result with null ocrText
      await db
        .update(attachments)
        .set({
          description: 'Abstract game art',
          isGoodQuality: 'bad',
          isRelevant: 0,
          detectedType: 'artwork',
          ocrText: null,
        })
        .where(eq(attachments.id, testAttachmentId));

      const response = await reprocessAttachment(createNextRequest('http://localhost'), createRouteContext({ attachmentId: testAttachmentId }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ocrText).toBeNull();
      expect(data.isRelevant).toBe(0); // false converted to 0
    });

    it('should handle workflow errors', async () => {
      const { analyzeImagesWorkflow } = await import('@/workflows/analyze-images');
      (analyzeImagesWorkflow as any).mockRejectedValueOnce(new Error('Vision API timeout'));

      const response = await reprocessAttachment(createNextRequest('http://localhost'), createRouteContext({ attachmentId: testAttachmentId }));
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

      const response = await reprocessAttachment(createNextRequest('http://localhost'), createRouteContext({ attachmentId: testAttachment.id }));
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

      const response = await reprocessAttachment(createNextRequest('http://localhost'), createRouteContext({ attachmentId: testAttachment.id }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.bbox).toEqual([100, 200, 400, 600]);
    });
  });
});
