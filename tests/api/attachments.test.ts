/**
 * Tests for Attachments API Routes
 * GET /api/attachments/:attachmentId - Get attachment
 * PATCH /api/attachments/:attachmentId - Update attachment
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GET as getAttachment, PATCH as updateAttachment } from '@/app/api/attachments/[attachmentId]/route';
import { db } from '@/lib/db';
import { games, resources, attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createNextRequest, createRouteContext } from '@/tests/utils/next-request';

describe.sequential('Attachments API', () => {
  let testGameId: string;
  let testResourceId: string;
  let testAttachmentId: string;

  beforeEach(async () => {
    // Clean up test data
    await db.delete(games).where(eq(games.slug, 'test-game-attachments-api'));

    // Create test game
    testGameId = nanoid();
    await db.insert(games).values({
      id: testGameId,
      name: 'Test Game',
      slug: 'test-game-attachments-api',
      year: null,
      imageUrl: null,
      bggId: null,
      bggUrl: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create test resource
    testResourceId = nanoid();
    await db.insert(resources).values({
      id: testResourceId,
      gameId: testGameId,
      name: 'Test Resource',
      description: null,
      url: 'https://example.com/test.pdf',
      originalFilename: null,
      status: 'ready',
      processingStage: 'ready',
      currentRunId: null,
      processingMetadata: null,
      content: 'Test content',
      version: 1,
      pdfExtractor: 'mistral',
      processedAt: Date.now(),
      pageCount: 5,
      imageCount: 1,
      wordCount: 100,
      resourceType: 'rulebook',
      edition: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create test attachment
    testAttachmentId = nanoid();
    await db.insert(attachments).values({
      id: testAttachmentId,
      gameId: testGameId,
      resourceId: testResourceId,
      type: 'image',
      mimeType: 'image/png',
      blobKey: `resources/${testResourceId}/attachments/${testAttachmentId}.png`,
      url: `/uploads/resources/${testResourceId}/attachments/${testAttachmentId}.png`,
      originalFilename: 'test.png',
      pageNumber: 1,
      bbox: [100, 200, 300, 400],
      caption: 'Test image',
      width: 800,
      height: 600,
      description: 'Original description',
      createdAt: Date.now(),
    });
  });

  describe('GET /api/attachments/:attachmentId', () => {
    it('should get attachment with URL and parsed bbox', async () => {
      const request = createNextRequest(`http://localhost/api/attachments/${testAttachmentId}`);
      const response = await getAttachment(
        request,
        createRouteContext({ attachmentId: testAttachmentId })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        id: testAttachmentId,
        resourceId: testResourceId,
        type: 'image',
        caption: 'Test image',
        width: 800,
        height: 600,
        description: 'Original description',
      });
      expect(data.url).toBeDefined();
      expect(Array.isArray(data.bbox)).toBe(true);
      expect(data.bbox).toEqual([100, 200, 300, 400]);
    });

    it('should return 404 for non-existent attachment', async () => {
      const request = createNextRequest('http://localhost/api/attachments/non-existent');
      const response = await getAttachment(
        request,
        createRouteContext({ attachmentId: 'non-existent' })
      );

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/attachments/:attachmentId', () => {
    it('should update attachment description', async () => {
      const request = createNextRequest(`http://localhost/api/attachments/${testAttachmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Updated description',
        }),
      });

      const response = await updateAttachment(
        request,
        createRouteContext({ attachmentId: testAttachmentId })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.description).toBe('Updated description');
      expect(data.caption).toBe('Test image'); // Should remain unchanged
    });

    it('should update attachment filename', async () => {
      const request = createNextRequest(`http://localhost/api/attachments/${testAttachmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalFilename: 'updated.png',
        }),
      });

      const response = await updateAttachment(
        request,
        createRouteContext({ attachmentId: testAttachmentId })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.originalFilename).toBe('updated.png');
    });

    it('should return 404 for non-existent attachment', async () => {
      const request = createNextRequest('http://localhost/api/attachments/non-existent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Test' }),
      });

      const response = await updateAttachment(
        request,
        createRouteContext({ attachmentId: 'non-existent' })
      );

      expect(response.status).toBe(404);
    });
  });
});
