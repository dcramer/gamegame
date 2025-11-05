/**
 * Tests for BGG API Routes
 * GET /api/bgg/search - Search BoardGameGeek
 * GET /api/bgg/games/:bggId - Get game details
 * POST /api/bgg/games/:bggId/import - Import game from BGG
 * GET /api/bgg/extract-id - Extract BGG ID from URL
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET as searchBGG } from '@/app/api/bgg/search/route';
import { GET as getBGGGame } from '@/app/api/bgg/games/[bggId]/route';
import { POST as importBGGGame } from '@/app/api/bgg/games/[bggId]/import/route';
import { GET as extractId } from '@/app/api/bgg/extract-id/route';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Mock the BGG service
vi.mock('@/lib/services/bgg', () => ({
  searchBGGGames: vi.fn(),
  getBGGGameDetails: vi.fn(),
  downloadImage: vi.fn(),
  extractBGGId: vi.fn((url: string) => {
    const match = url.match(/\/boardgame\/(\d+)/);
    return match ? match[1] : null;
  }),
}));

describe.sequential('BGG API', () => {
  beforeEach(async () => {
    // Clean up test data
    await db.delete(games).where(eq(games.bggId, '224517'));
    await db.delete(games).where(eq(games.bggId, '12345'));
    // Also clean up by slug to avoid conflicts
    await db.delete(games).where(eq(games.slug, 'test-game-2020'));
    await db.delete(games).where(eq(games.slug, 'brass-birmingham'));
  });

  describe('GET /api/bgg/extract-id', () => {
    it('should extract BGG ID from valid URL', async () => {
      const request = new Request('http://localhost/api/bgg/extract-id?url=https://boardgamegeek.com/boardgame/224517/brass-birmingham');
      const response = await extractId(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ bggId: '224517' });
    });

    it('should reject invalid BGG URL', async () => {
      const request = new Request('http://localhost/api/bgg/extract-id?url=https://example.com/not-a-bgg-url');
      const response = await extractId(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid BGG URL');
    });

    it('should reject missing URL parameter', async () => {
      const request = new Request('http://localhost/api/bgg/extract-id');
      const response = await extractId(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('URL parameter is required');
    });

    it('should reject invalid URL format', async () => {
      const request = new Request('http://localhost/api/bgg/extract-id?url=not-a-url');
      const response = await extractId(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid URL format');
    });
  });

  describe('GET /api/bgg/search', () => {
    it('should require BGG_API_KEY', async () => {
      const originalKey = process.env.BGG_API_KEY;
      delete process.env.BGG_API_KEY;

      const request = new Request('http://localhost/api/bgg/search?q=brass');
      const response = await searchBGG(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('BGG_API_KEY_MISSING');

      process.env.BGG_API_KEY = originalKey;
    });

    it('should reject short queries', async () => {
      const request = new Request('http://localhost/api/bgg/search?q=a');
      const response = await searchBGG(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query must be at least 2 characters');
    });

    it('should search BGG and return results with import status', async () => {
      // Set up mock
      const { searchBGGGames } = await import('@/lib/services/bgg');
      vi.mocked(searchBGGGames).mockResolvedValueOnce([
        {
          id: '224517',
          name: 'Brass: Birmingham',
          yearPublished: 2018,
          type: 'boardgame' as const,
          thumbnailUrl: null,
        },
      ]);

      const request = new Request('http://localhost/api/bgg/search?q=brass');
      const response = await searchBGG(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data[0]).toMatchObject({
        id: '224517',
        name: 'Brass: Birmingham',
        isImported: false,
        gameId: null,
      });
    });
  });

  describe('GET /api/bgg/games/:bggId', () => {
    it('should require BGG_API_KEY', async () => {
      const originalKey = process.env.BGG_API_KEY;
      delete process.env.BGG_API_KEY;

      const request = new Request('http://localhost/api/bgg/games/224517');
      const response = await getBGGGame(request, { params: { bggId: '224517' } });
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('BGG_API_KEY_MISSING');

      process.env.BGG_API_KEY = originalKey;
    });

    it('should fetch game details from BGG', async () => {
      // Set up mock
      const { getBGGGameDetails } = await import('@/lib/services/bgg');
      vi.mocked(getBGGGameDetails).mockResolvedValueOnce({
        id: '224517',
        name: 'Brass: Birmingham',
        yearPublished: 2018,
        minPlayers: 2,
        maxPlayers: 4,
        playingTime: 120,
        description: 'Test description',
        imageUrl: 'https://cf.geekdo-images.com/test.jpg',
        thumbnailUrl: null,
        publishers: ['Roxley Games'],
        designers: ['Martin Wallace'],
        bggUrl: 'https://boardgamegeek.com/boardgame/224517',
      });

      const request = new Request('http://localhost/api/bgg/games/224517');
      const response = await getBGGGame(request, { params: { bggId: '224517' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        id: '224517',
        name: 'Brass: Birmingham',
        yearPublished: 2018,
      });
    });
  });

  describe('POST /api/bgg/games/:bggId/import', () => {
    it('should require BGG_API_KEY', async () => {
      const originalKey = process.env.BGG_API_KEY;
      delete process.env.BGG_API_KEY;

      const request = new Request('http://localhost/api/bgg/games/224517/import', {
        method: 'POST',
      });
      const response = await importBGGGame(request, { params: { bggId: '224517' } });
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('BGG_API_KEY_MISSING');

      process.env.BGG_API_KEY = originalKey;
    });

    it('should import game from BGG without image', async () => {
      // Set up mocks
      const { getBGGGameDetails } = await import('@/lib/services/bgg');
      vi.mocked(getBGGGameDetails).mockResolvedValueOnce({
        id: '12345',
        name: 'Test Game',
        yearPublished: 2020,
        minPlayers: 2,
        maxPlayers: 4,
        playingTime: 60,
        description: null,
        imageUrl: null, // No image
        thumbnailUrl: null,
        publishers: ['Test Publisher'],
        designers: ['Test Designer'],
        bggUrl: 'https://boardgamegeek.com/boardgame/12345',
      });

      const request = new Request('http://localhost/api/bgg/games/12345/import', {
        method: 'POST',
      });
      const response = await importBGGGame(request, { params: { bggId: '12345' } });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toMatchObject({
        name: 'Test Game',
        year: 2020,
        bggId: '12345',
        bggUrl: 'https://boardgamegeek.com/boardgame/12345',
      });

      // Cleanup
      if (data.id) {
        await db.delete(games).where(eq(games.id, data.id));
      }
    });

    it('should reject duplicate imports', async () => {
      // Set up mock
      const { getBGGGameDetails } = await import('@/lib/services/bgg');
      vi.mocked(getBGGGameDetails).mockResolvedValue({
        id: '12345',
        name: 'Test Game',
        yearPublished: 2020,
        minPlayers: 2,
        maxPlayers: 4,
        playingTime: 60,
        description: null,
        imageUrl: null,
        thumbnailUrl: null,
        publishers: ['Test Publisher'],
        designers: ['Test Designer'],
        bggUrl: 'https://boardgamegeek.com/boardgame/12345',
      });

      // First import
      const request1 = new Request('http://localhost/api/bgg/games/12345/import', {
        method: 'POST',
      });
      const response1 = await importBGGGame(request1, { params: { bggId: '12345' } });
      const data1 = await response1.json();
      expect(response1.status).toBe(201);

      // Second import should fail
      const request2 = new Request('http://localhost/api/bgg/games/12345/import', {
        method: 'POST',
      });
      const response2 = await importBGGGame(request2, { params: { bggId: '12345' } });
      const data2 = await response2.json();

      expect(response2.status).toBe(409);
      expect(data2.error).toContain('already');

      // Cleanup
      if (data1.id) {
        await db.delete(games).where(eq(games.id, data1.id));
      }
    });
  });
});
