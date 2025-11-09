/**
 * Tests for Games API Routes
 * GET /api/games - List games
 * POST /api/games - Create game
 * GET /api/games/:id - Get game
 * PATCH /api/games/:id - Update game
 * DELETE /api/games/:id - Delete game
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GET as listGames, POST as createGame } from '@/app/api/games/route';
import {
  GET as getGame,
  PATCH as updateGame,
  DELETE as deleteGame,
} from '@/app/api/games/[gameIdOrSlug]/route';
import { db } from '@/lib/db';
import { games, resources, fragments, embeddings, attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createNextRequest, createRouteContext } from '@/tests/utils/next-request';

describe('Games API', () => {
  let testGameId: string;

  beforeEach(async () => {
    // Clean up any test games
    await db.delete(games).where(eq(games.name, 'Test Game'));
    await db.delete(games).where(eq(games.name, 'Updated Game'));
  });

  describe('GET /api/games', () => {
    it('should return empty array when no games exist', async () => {
      // Delete all games first
      await db.delete(games);

      const response = await listGames();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toEqual([]);
    });

    it('should return list of games with resource counts', async () => {
      // Create test game
      const gameId = nanoid();
      await db.insert(games).values({
        id: gameId,
        name: 'Test Game',
        slug: 'test-game',
        year: 2024,
        imageUrl: null,
        bggId: null,
        bggUrl: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const response = await listGames();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      const testGame = data.find((g: any) => g.id === gameId);
      expect(testGame).toBeDefined();
      expect(testGame).toMatchObject({
        id: gameId,
        name: 'Test Game',
        slug: 'test-game',
        year: 2024,
        resourceCount: 0,
      });
    });

    it('should include resource count in game list', async () => {
      // Create game with resource
      const gameId = nanoid();
      await db.insert(games).values({
        id: gameId,
        name: 'Test Game',
        slug: 'test-game',
        year: null,
        imageUrl: null,
        bggId: null,
        bggUrl: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const resourceId = nanoid();
      await db.insert(resources).values({
        id: resourceId,
        gameId,
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
        pageCount: 1,
        imageCount: 0,
        wordCount: 2,
        resourceType: 'rulebook',
        edition: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const response = await listGames();
      const data = await response.json();

      const testGame = data.find((g: any) => g.id === gameId);
      expect(testGame.resourceCount).toBe(1);

      // Cleanup
      await db.delete(resources).where(eq(resources.id, resourceId));
      await db.delete(games).where(eq(games.id, gameId));
    });
  });

  describe('POST /api/games', () => {
    it('should create a new game with minimal data', async () => {
      const request = createNextRequest('http://localhost/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Game',
        }),
      });

      const response = await createGame(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toMatchObject({
        name: 'Test Game',
        slug: 'test-game',
        year: null,
      });
      expect(data.id).toBeDefined();

      testGameId = data.id;
    });

    it('should create a new game with full data', async () => {
      const request = createNextRequest('http://localhost/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Arcs',
          year: 2024,
          imageUrl: 'https://example.com/arcs.jpg',
          bggUrl: 'https://boardgamegeek.com/boardgame/356298/arcs',
        }),
      });

      const response = await createGame(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toMatchObject({
        name: 'Arcs',
        year: 2024,
        slug: 'arcs',
        imageUrl: 'https://example.com/arcs.jpg',
        bggUrl: 'https://boardgamegeek.com/boardgame/356298/arcs',
        bggId: '356298',
      });

      // Cleanup
      await db.delete(games).where(eq(games.id, data.id));
    });

    it('should extract BGG ID from URL', async () => {
      const request = createNextRequest('http://localhost/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test BGG Game',
          bggUrl: 'https://boardgamegeek.com/boardgame/12345/test-game',
        }),
      });

      const response = await createGame(request);
      const data = await response.json();

      expect(data.bggId).toBe('12345');

      // Cleanup
      await db.delete(games).where(eq(games.id, data.id));
    });

    it('should generate slug from name', async () => {
      const request = createNextRequest('http://localhost/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Star Wars: The Clone Wars',
        }),
      });

      const response = await createGame(request);
      const data = await response.json();

      expect(data.slug).toBe('star-wars-the-clone-wars');

      // Cleanup
      await db.delete(games).where(eq(games.id, data.id));
    });

    it('should reject invalid year', async () => {
      const request = createNextRequest('http://localhost/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Game',
          year: 1800, // Too old
        }),
      });

      const response = await createGame(request);

      expect(response.status).toBe(400);
    });

    it('should reject missing name', async () => {
      const request = createNextRequest('http://localhost/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: 2024,
        }),
      });

      const response = await createGame(request);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/games/:gameIdOrSlug', () => {
    beforeEach(async () => {
      // Create test game
      testGameId = nanoid();
      await db.insert(games).values({
        id: testGameId,
        name: 'Test Game',
        slug: 'test-game',
        year: 2024,
        imageUrl: null,
        bggId: null,
        bggUrl: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    it('should get game by ID', async () => {
      const request = createNextRequest(`http://localhost/api/games/${testGameId}`);
      const response = await getGame(
        request,
        createRouteContext({ gameIdOrSlug: testGameId })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        id: testGameId,
        name: 'Test Game',
        slug: 'test-game',
      });
    });

    it('should get game by slug', async () => {
      const request = createNextRequest('http://localhost/api/games/test-game');
      const response = await getGame(
        request,
        createRouteContext({ gameIdOrSlug: 'test-game' })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        id: testGameId,
        name: 'Test Game',
        slug: 'test-game',
      });
    });

    it('should return 404 for non-existent game', async () => {
      const request = createNextRequest('http://localhost/api/games/non-existent');
      const response = await getGame(
        request,
        createRouteContext({ gameIdOrSlug: 'non-existent' })
      );

      expect(response.status).toBe(404);
    });

    it('should include resource count', async () => {
      const request = createNextRequest(`http://localhost/api/games/${testGameId}`);
      const response = await getGame(
        request,
        createRouteContext({ gameIdOrSlug: testGameId })
      );
      const data = await response.json();

      expect(data.resourceCount).toBeDefined();
      expect(typeof data.resourceCount).toBe('number');
    });
  });

  describe('PATCH /api/games/:gameId', () => {
    beforeEach(async () => {
      testGameId = nanoid();
      await db.insert(games).values({
        id: testGameId,
        name: 'Test Game',
        slug: 'test-game',
        year: 2024,
        imageUrl: null,
        bggId: null,
        bggUrl: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    it('should update game name and regenerate slug', async () => {
      const request = createNextRequest(`http://localhost/api/games/${testGameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Game',
        }),
      });

      const response = await updateGame(
        request,
        createRouteContext({ gameIdOrSlug: testGameId })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        id: testGameId,
        name: 'Updated Game',
        slug: 'updated-game',
      });
    });

    it('should update year', async () => {
      const request = createNextRequest(`http://localhost/api/games/${testGameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: 2025,
        }),
      });

      const response = await updateGame(
        request,
        createRouteContext({ gameIdOrSlug: testGameId })
      );
      const data = await response.json();

      expect(data.year).toBe(2025);
    });

    it('should update BGG URL and extract ID', async () => {
      const request = createNextRequest(`http://localhost/api/games/${testGameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bggUrl: 'https://boardgamegeek.com/boardgame/99999/test',
        }),
      });

      const response = await updateGame(
        request,
        createRouteContext({ gameIdOrSlug: testGameId })
      );
      const data = await response.json();

      expect(data.bggUrl).toBe('https://boardgamegeek.com/boardgame/99999/test');
      expect(data.bggId).toBe('99999');
    });

    it('should return 404 for non-existent game', async () => {
      const request = createNextRequest('http://localhost/api/games/non-existent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });

      const response = await updateGame(
        request,
        createRouteContext({ gameIdOrSlug: 'non-existent' })
      );

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/games/:gameId', () => {
    beforeEach(async () => {
      testGameId = nanoid();
      await db.insert(games).values({
        id: testGameId,
        name: 'Test Game',
        slug: 'test-game',
        year: null,
        imageUrl: null,
        bggId: null,
        bggUrl: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    it('should delete game without resources', async () => {
      const request = createNextRequest(`http://localhost/api/games/${testGameId}`, {
        method: 'DELETE',
      });

      const response = await deleteGame(
        request,
        createRouteContext({ gameIdOrSlug: testGameId })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        success: true,
        deletedResources: 0,
      });

      // Verify game is deleted
      const [deletedGame] = await db
        .select()
        .from(games)
        .where(eq(games.id, testGameId))
        .limit(1);

      expect(deletedGame).toBeUndefined();
    });

    it('should delete game with resources and cascade to fragments/embeddings', async () => {
      // Create resource
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
        currentRunId: null,
        processingMetadata: null,
        content: 'Test content',
        version: 1,
        pdfExtractor: 'mistral',
        processedAt: Date.now(),
        pageCount: 1,
        imageCount: 0,
        wordCount: 2,
        resourceType: 'rulebook',
        edition: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Create fragment
      const fragmentId = nanoid();
      await db.insert(fragments).values({
        id: fragmentId,
        gameId: testGameId,
        resourceId,
        type: 'text',
        attachmentId: null,
        content: 'Test fragment',
        embedding: new Array(1536).fill(0).map(() => Math.random()),
        searchableContent: 'Test fragment',
        syntheticQuestions: null,
        resourceName: 'Test Resource',
        resourceDescription: null,
        resourceType: 'rulebook',
        version: 1,
        pageNumber: 1,
        pageRange: null,
        section: null,
        images: null,
      });

      // Create embedding
      await db.insert(embeddings).values({
        id: fragmentId,
        fragmentId,
        gameId: testGameId,
        resourceId,
        type: 'content',
        embedding: new Array(1536).fill(0),
        questionIndex: null,
        questionText: null,
        createdAt: Date.now(),
      });

      const request = createNextRequest(`http://localhost/api/games/${testGameId}`, {
        method: 'DELETE',
      });

      const response = await deleteGame(
        request,
        createRouteContext({ gameIdOrSlug: testGameId })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        success: true,
        deletedResources: 1,
      });

      // Verify cascade deletion
      const [deletedGame] = await db.select().from(games).where(eq(games.id, testGameId)).limit(1);
      const [deletedResource] = await db.select().from(resources).where(eq(resources.id, resourceId)).limit(1);
      const [deletedFragment] = await db.select().from(fragments).where(eq(fragments.id, fragmentId)).limit(1);
      const [deletedEmbedding] = await db.select().from(embeddings).where(eq(embeddings.id, fragmentId)).limit(1);

      expect(deletedGame).toBeUndefined();
      expect(deletedResource).toBeUndefined();
      expect(deletedFragment).toBeUndefined();
      expect(deletedEmbedding).toBeUndefined();
    });

    it('should return 404 for non-existent game', async () => {
      const request = createNextRequest('http://localhost/api/games/non-existent', {
        method: 'DELETE',
      });

      const response = await deleteGame(
        request,
        createRouteContext({ gameIdOrSlug: 'non-existent' })
      );

      expect(response.status).toBe(404);
    });
  });
});
