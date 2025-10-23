import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { setupTestDb, cleanupTestDb, createTestGame, createTestResource } from '@/test-utils/setup';

describe('Games API Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  describe('GET /api/games', () => {
    it('should return empty array when no games exist', async () => {
      const response = await SELF.fetch('http://localhost/api/games');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toEqual([]);
    });

    it('should list all games with resource counts', async () => {
      const game1 = await createTestGame({ name: 'Arcs' });
      const game2 = await createTestGame({ name: 'Root' });
      await createTestResource(game1.id);
      await createTestResource(game1.id);
      await createTestResource(game2.id);

      const response = await SELF.fetch('http://localhost/api/games');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveLength(2);

      const arcs = data.find((g: any) => g.name === 'Arcs');
      const root = data.find((g: any) => g.name === 'Root');

      expect(arcs.resourceCount).toBe(2);
      expect(root.resourceCount).toBe(1);
    });

    it('should include game metadata', async () => {
      await createTestGame({
        name: 'Arcs',
        year: 2023,
        slug: 'arcs-2023',
        imageUrl: '/images/arcs.webp',
        bggUrl: 'https://boardgamegeek.com/boardgame/arcs',
      });

      const response = await SELF.fetch('http://localhost/api/games');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data[0]).toMatchObject({
        name: 'Arcs',
        year: 2023,
        slug: 'arcs-2023',
        imageUrl: '/images/arcs.webp',
        bggUrl: 'https://boardgamegeek.com/boardgame/arcs',
      });
    });
  });

  describe('GET /api/games/:gameIdOrSlug', () => {
    it('should get game by ID', async () => {
      const game = await createTestGame({ name: 'Arcs' });

      const response = await SELF.fetch(`http://localhost/api/games/${game.id}`);

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.id).toBe(game.id);
      expect(data.name).toBe('Arcs');
    });

    it('should get game by slug', async () => {
      const game = await createTestGame({ name: 'Arcs', slug: 'arcs-2023' });

      const response = await SELF.fetch('http://localhost/api/games/arcs-2023');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.id).toBe(game.id);
      expect(data.name).toBe('Arcs');
    });

    it('should return 404 for non-existent game', async () => {
      const response = await SELF.fetch('http://localhost/api/games/nonexistent');

      expect(response.status).toBe(404);
      const data = await response.json() as any;
      expect(data.error).toBe('Game not found');
    });

    it('should include resource count', async () => {
      const game = await createTestGame({ name: 'Arcs' });
      await createTestResource(game.id);
      await createTestResource(game.id);

      const response = await SELF.fetch(`http://localhost/api/games/${game.id}`);

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.resourceCount).toBe(2);
    });
  });

  describe('POST /api/games (admin only)', () => {
    it('should return 401 without authentication', async () => {
      const response = await SELF.fetch('http://localhost/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Arcs' }),
      });

      expect(response.status).toBe(401);
    });

    // Note: Testing authenticated requests requires auth middleware setup
    // These tests verify the endpoint structure and validation
  });

  describe('PATCH /api/games/:gameId (admin only)', () => {
    it('should return 401 without authentication', async () => {
      const game = await createTestGame({ name: 'Arcs' });

      const response = await SELF.fetch(`http://localhost/api/games/${game.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Arcs Updated' }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/games/:gameId (admin only)', () => {
    it('should return 401 without authentication', async () => {
      const game = await createTestGame({ name: 'Arcs' });

      const response = await SELF.fetch(`http://localhost/api/games/${game.id}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/games/:gameIdOrSlug/resources', () => {
    it('should list resources for a game by ID', async () => {
      const game = await createTestGame({ name: 'Arcs' });
      await createTestResource(game.id, { name: 'Core Rulebook' });
      await createTestResource(game.id, { name: 'Reference Guide' });

      const response = await SELF.fetch(`http://localhost/api/games/${game.id}/resources`);

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe('Core Rulebook');
      expect(data[1].name).toBe('Reference Guide');
    });

    it('should list resources for a game by slug', async () => {
      const game = await createTestGame({ name: 'Arcs', slug: 'arcs-2023' });
      await createTestResource(game.id);

      const response = await SELF.fetch('http://localhost/api/games/arcs-2023/resources');

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toHaveLength(1);
    });

    it('should return 404 for non-existent game', async () => {
      const response = await SELF.fetch('http://localhost/api/games/nonexistent/resources');

      expect(response.status).toBe(404);
      const data = await response.json() as any;
      expect(data.error).toBe('Game not found');
    });

    it('should return empty array for game with no resources', async () => {
      const game = await createTestGame({ name: 'Arcs' });

      const response = await SELF.fetch(`http://localhost/api/games/${game.id}/resources`);

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data).toEqual([]);
    });

    it('should include resource metadata', async () => {
      const game = await createTestGame({ name: 'Arcs' });
      await createTestResource(game.id, {
        name: 'Core Rulebook',
        pageCount: 24,
        imageCount: 15,
        wordCount: 5000,
      });

      const response = await SELF.fetch(`http://localhost/api/games/${game.id}/resources`);

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data[0]).toMatchObject({
        name: 'Core Rulebook',
        pageCount: 24,
        imageCount: 15,
        wordCount: 5000,
      });
    });
  });

});
