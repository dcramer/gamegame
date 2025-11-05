/**
 * Tests for Resource Attachments API Route
 * GET /api/resources/:resourceId/attachments - Get attachments for a resource
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GET as getAttachments } from '@/app/api/resources/[resourceId]/attachments/route';
import { db } from '@/lib/db';
import { games, resources, attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

describe.sequential('Resource Attachments API', () => {
  let testGameId: string;
  let testResourceId: string;

  beforeEach(async () => {
    // Clean up test data
    await db.delete(games).where(eq(games.slug, 'test-game-attachments'));

    // Create test game
    testGameId = nanoid();
    await db.insert(games).values({
      id: testGameId,
      name: 'Test Game',
      slug: 'test-game-attachments',
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
      name: 'Test Resource Attachments',
      description: null,
      url: 'https://example.com/test.pdf',
      originalFilename: null,
      status: 'ready',
      processingStage: 'ready',
      currentJobId: null,
      processingMetadata: null,
      content: 'Test content',
      version: 1,
      pdfExtractor: 'mistral',
      processedAt: Date.now(),
      pageCount: 5,
      imageCount: 2,
      wordCount: 100,
      resourceType: 'rulebook',
      edition: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  describe('GET /api/resources/:resourceId/attachments', () => {
    it('should return empty array when no attachments exist', async () => {
      const request = new Request(`http://localhost/api/resources/${testResourceId}/attachments`);
      const response = await getAttachments(request, { params: { resourceId: testResourceId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toEqual([]);
    });

    it('should return list of attachments with URLs', async () => {
      // Create attachment
      const attachmentId = nanoid();
      await db.insert(attachments).values({
        id: attachmentId,
        gameId: testGameId,
        resourceId: testResourceId,
        type: 'image',
        mimeType: 'image/png',
        blobKey: `resources/${testResourceId}/attachments/${attachmentId}.png`,
        originalFilename: 'test.png',
        pageNumber: 1,
        bbox: JSON.stringify([100, 200, 300, 400]),
        caption: 'Test image',
        width: 800,
        height: 600,
        createdAt: Date.now(),
      });

      const request = new Request(`http://localhost/api/resources/${testResourceId}/attachments`);
      const response = await getAttachments(request, { params: { resourceId: testResourceId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0]).toMatchObject({
        id: attachmentId,
        type: 'image',
        caption: 'Test image',
        width: 800,
        height: 600,
      });
      expect(data[0].url).toBeDefined();
      expect(Array.isArray(data[0].bbox)).toBe(true);
      expect(data[0].bbox).toEqual([100, 200, 300, 400]);

      // Cleanup
      await db.delete(attachments).where(eq(attachments.id, attachmentId));
    });

    it('should parse bbox correctly', async () => {
      const attachmentId = nanoid();
      await db.insert(attachments).values({
        id: attachmentId,
        gameId: testGameId,
        resourceId: testResourceId,
        type: 'image',
        mimeType: 'image/png',
        blobKey: `resources/${testResourceId}/attachments/${attachmentId}.png`,
        originalFilename: 'test.png',
        pageNumber: 2,
        bbox: JSON.stringify([10, 20, 30, 40]),
        caption: null,
        width: 400,
        height: 300,
        createdAt: Date.now(),
      });

      const request = new Request(`http://localhost/api/resources/${testResourceId}/attachments`);
      const response = await getAttachments(request, { params: { resourceId: testResourceId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data[0].bbox).toEqual([10, 20, 30, 40]);

      // Cleanup
      await db.delete(attachments).where(eq(attachments.id, attachmentId));
    });

    it('should order by page number and creation time', async () => {
      // Create attachments in reverse order
      const attachment1Id = nanoid();
      const attachment2Id = nanoid();

      await db.insert(attachments).values([
        {
          id: attachment2Id,
          gameId: testGameId,
          resourceId: testResourceId,
          type: 'image',
          mimeType: 'image/png',
          blobKey: `resources/${testResourceId}/attachments/${attachment2Id}.png`,
          originalFilename: 'test2.png',
          pageNumber: 2,
          bbox: null,
          caption: 'Page 2',
          width: 400,
          height: 300,
          createdAt: Date.now() + 1000,
        },
        {
          id: attachment1Id,
          gameId: testGameId,
          resourceId: testResourceId,
          type: 'image',
          mimeType: 'image/png',
          blobKey: `resources/${testResourceId}/attachments/${attachment1Id}.png`,
          originalFilename: 'test1.png',
          pageNumber: 1,
          bbox: null,
          caption: 'Page 1',
          width: 400,
          height: 300,
          createdAt: Date.now(),
        },
      ]);

      const request = new Request(`http://localhost/api/resources/${testResourceId}/attachments`);
      const response = await getAttachments(request, { params: { resourceId: testResourceId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.length).toBe(2);
      expect(data[0].caption).toBe('Page 1');
      expect(data[1].caption).toBe('Page 2');

      // Cleanup
      await db.delete(attachments).where(eq(attachments.resourceId, testResourceId));
    });
  });
});
