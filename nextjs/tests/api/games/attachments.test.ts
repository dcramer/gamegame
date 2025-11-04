/**
 * Tests for Game Attachments API Route
 * GET /api/games/:gameIdOrSlug/attachments - Get attachments for a game
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GET as getGameAttachments } from '@/app/api/games/[gameIdOrSlug]/attachments/route';
import { db } from '@/lib/db';
import { games, resources, attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

describe.sequential('Game Attachments API', () => {
  let testGameId: string;
  let testGameSlug: string;
  let testResourceId: string;

  beforeEach(async () => {
    // Clean up test data
    await db.delete(games).where(eq(games.slug, 'test-game-attachments'));

    // Create test game
    testGameId = nanoid();
    testGameSlug = 'test-game-attachments';
    await db.insert(games).values({
      id: testGameId,
      name: 'Test Game Attachments',
      slug: testGameSlug,
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

  describe('GET /api/games/:gameIdOrSlug/attachments', () => {
    it('should return empty array when no attachments exist', async () => {
      const request = new Request(`http://localhost/api/games/${testGameSlug}/attachments`);
      const response = await getGameAttachments(request, { params: { gameIdOrSlug: testGameSlug } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toEqual([]);
    });

    it('should return list of attachments for game by slug', async () => {
      // Create attachments
      const attachment1Id = nanoid();
      const attachment2Id = nanoid();
      await db.insert(attachments).values([
        {
          id: attachment1Id,
          gameId: testGameId,
          resourceId: testResourceId,
          type: 'image',
          mimeType: 'image/png',
          blobKey: `resources/${testResourceId}/attachments/${attachment1Id}.png`,
          originalFilename: 'diagram1.png',
          pageNumber: 1,
          bbox: JSON.stringify([100, 200, 300, 400]),
          caption: 'Game setup diagram',
          width: 800,
          height: 600,
          description: null,
          createdAt: Date.now(),
        },
        {
          id: attachment2Id,
          gameId: testGameId,
          resourceId: testResourceId,
          type: 'image',
          mimeType: 'image/jpeg',
          blobKey: `resources/${testResourceId}/attachments/${attachment2Id}.jpeg`,
          originalFilename: 'board.jpg',
          pageNumber: 2,
          bbox: null,
          caption: 'Game board',
          width: 1024,
          height: 768,
          description: null,
          createdAt: Date.now() + 1000,
        },
      ]);

      const request = new Request(`http://localhost/api/games/${testGameSlug}/attachments`);
      const response = await getGameAttachments(request, { params: { gameIdOrSlug: testGameSlug } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
      expect(data[0].caption).toBe('Game setup diagram');
      expect(data[1].caption).toBe('Game board');
    });

    it('should return attachments for game by ID', async () => {
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
        bbox: null,
        caption: 'Test image',
        width: 400,
        height: 300,
        description: null,
        createdAt: Date.now(),
      });

      const request = new Request(`http://localhost/api/games/${testGameId}/attachments`);
      const response = await getGameAttachments(request, { params: { gameIdOrSlug: testGameId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.length).toBe(1);
      expect(data[0].id).toBe(attachmentId);
    });

    it('should return 404 for non-existent game', async () => {
      const request = new Request('http://localhost/api/games/non-existent/attachments');
      const response = await getGameAttachments(request, { params: { gameIdOrSlug: 'non-existent' } });

      expect(response.status).toBe(404);
    });

    it('should include attachment URLs', async () => {
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
        bbox: JSON.stringify([10, 20, 30, 40]),
        caption: 'Test',
        width: 100,
        height: 100,
        description: 'Test description',
        createdAt: Date.now(),
      });

      const request = new Request(`http://localhost/api/games/${testGameSlug}/attachments`);
      const response = await getGameAttachments(request, { params: { gameIdOrSlug: testGameSlug } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data[0].url).toBeDefined();
      expect(data[0].url).toContain('/uploads/');
      expect(data[0].bbox).toEqual([10, 20, 30, 40]);
    });

    it('should order by page number and creation time', async () => {
      const attachment1Id = nanoid();
      const attachment2Id = nanoid();
      const attachment3Id = nanoid();

      await db.insert(attachments).values([
        {
          id: attachment3Id,
          gameId: testGameId,
          resourceId: testResourceId,
          type: 'image',
          mimeType: 'image/png',
          blobKey: `resources/${testResourceId}/attachments/${attachment3Id}.png`,
          originalFilename: 'page2.png',
          pageNumber: 2,
          bbox: null,
          caption: 'Page 2',
          width: 100,
          height: 100,
          description: null,
          createdAt: Date.now() + 2000,
        },
        {
          id: attachment1Id,
          gameId: testGameId,
          resourceId: testResourceId,
          type: 'image',
          mimeType: 'image/png',
          blobKey: `resources/${testResourceId}/attachments/${attachment1Id}.png`,
          originalFilename: 'page1-first.png',
          pageNumber: 1,
          bbox: null,
          caption: 'Page 1 First',
          width: 100,
          height: 100,
          description: null,
          createdAt: Date.now(),
        },
        {
          id: attachment2Id,
          gameId: testGameId,
          resourceId: testResourceId,
          type: 'image',
          mimeType: 'image/png',
          blobKey: `resources/${testResourceId}/attachments/${attachment2Id}.png`,
          originalFilename: 'page1-second.png',
          pageNumber: 1,
          bbox: null,
          caption: 'Page 1 Second',
          width: 100,
          height: 100,
          description: null,
          createdAt: Date.now() + 1000,
        },
      ]);

      const request = new Request(`http://localhost/api/games/${testGameSlug}/attachments`);
      const response = await getGameAttachments(request, { params: { gameIdOrSlug: testGameSlug } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.length).toBe(3);
      expect(data[0].caption).toBe('Page 1 First');
      expect(data[1].caption).toBe('Page 1 Second');
      expect(data[2].caption).toBe('Page 2');
    });
  });
});
