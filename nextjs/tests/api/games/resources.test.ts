/**
 * Tests for Game Resources API Route
 * GET /api/games/:gameIdOrSlug/resources - Get resources for a game
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GET as getGameResources } from '@/app/api/games/[gameIdOrSlug]/resources/route';
import { db } from '@/lib/db';
import { games, resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

describe.sequential('Game Resources API', () => {
  let testGameId: string;
  let testGameSlug: string;

  beforeEach(async () => {
    // Clean up test data
    await db.delete(games).where(eq(games.slug, 'test-game-resources'));

    // Create test game
    testGameId = nanoid();
    testGameSlug = 'test-game-resources';
    await db.insert(games).values({
      id: testGameId,
      name: 'Test Game Resources',
      slug: testGameSlug,
      year: null,
      imageUrl: null,
      bggId: null,
      bggUrl: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  describe('GET /api/games/:gameIdOrSlug/resources', () => {
    it('should return empty array when no resources exist', async () => {
      const request = new Request(`http://localhost/api/games/${testGameSlug}/resources`);
      const response = await getGameResources(request, { params: { gameIdOrSlug: testGameSlug } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toEqual([]);
    });

    it('should return list of resources for game by slug', async () => {
      // Create resources
      const resource1Id = nanoid();
      const resource2Id = nanoid();
      await db.insert(resources).values([
        {
          id: resource1Id,
          gameId: testGameId,
          name: 'Rulebook',
          description: 'Main rulebook',
          url: 'https://example.com/rulebook.pdf',
          originalFilename: null,
          status: 'ready',
          processingStage: 'ready',
          currentJobId: null,
          processingMetadata: null,
          content: 'Test content 1',
          version: 1,
          pdfExtractor: 'mistral',
          processedAt: Date.now(),
          pageCount: 10,
          imageCount: 2,
          wordCount: 500,
          resourceType: 'rulebook',
          edition: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: resource2Id,
          gameId: testGameId,
          name: 'Quick Start',
          description: null,
          url: 'https://example.com/quickstart.pdf',
          originalFilename: null,
          status: 'ready',
          processingStage: 'ready',
          currentJobId: null,
          processingMetadata: null,
          content: 'Test content 2',
          version: 1,
          pdfExtractor: 'mistral',
          processedAt: Date.now(),
          pageCount: 5,
          imageCount: 1,
          wordCount: 250,
          resourceType: 'reference',
          edition: null,
          createdAt: Date.now() + 1000,
          updatedAt: Date.now() + 1000,
        },
      ]);

      const request = new Request(`http://localhost/api/games/${testGameSlug}/resources`);
      const response = await getGameResources(request, { params: { gameIdOrSlug: testGameSlug } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
      expect(data[0].name).toBe('Rulebook');
      expect(data[1].name).toBe('Quick Start');
    });

    it('should return resources for game by ID', async () => {
      const resourceId = nanoid();
      await db.insert(resources).values({
        id: resourceId,
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
        pageCount: 3,
        imageCount: 0,
        wordCount: 100,
        resourceType: 'rulebook',
        edition: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const request = new Request(`http://localhost/api/games/${testGameId}/resources`);
      const response = await getGameResources(request, { params: { gameIdOrSlug: testGameId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.length).toBe(1);
      expect(data[0].id).toBe(resourceId);
    });

    it('should return 404 for non-existent game', async () => {
      const request = new Request('http://localhost/api/games/non-existent/resources');
      const response = await getGameResources(request, { params: { gameIdOrSlug: 'non-existent' } });

      expect(response.status).toBe(404);
    });

    it('should include resource metadata', async () => {
      const resourceId = nanoid();
      await db.insert(resources).values({
        id: resourceId,
        gameId: testGameId,
        name: 'Test Resource',
        description: 'A test description',
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
        pageCount: 15,
        imageCount: 5,
        wordCount: 1000,
        resourceType: 'rulebook',
        edition: '2nd Edition',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const request = new Request(`http://localhost/api/games/${testGameSlug}/resources`);
      const response = await getGameResources(request, { params: { gameIdOrSlug: testGameSlug } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data[0]).toMatchObject({
        id: resourceId,
        name: 'Test Resource',
        description: 'A test description',
        pageCount: 15,
        imageCount: 5,
        wordCount: 1000,
        resourceType: 'rulebook',
        edition: '2nd Edition',
      });
    });
  });
});
