import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchBGGGames, getBGGGameDetails, extractBGGId } from './bgg';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Sample BGG API XML responses
const MOCK_SEARCH_BRASS_XML = `<?xml version="1.0" encoding="utf-8"?>
<items total="2">
  <item type="boardgame" id="224517">
    <name type="primary" value="Brass: Birmingham"/>
    <yearpublished value="2018"/>
  </item>
  <item type="boardgame" id="28720">
    <name type="primary" value="Brass"/>
    <yearpublished value="2007"/>
  </item>
</items>`;

const MOCK_GAME_DETAILS_BRASS_BIRMINGHAM_XML = `<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="224517">
    <name type="primary" value="Brass: Birmingham"/>
    <name type="alternate" value="brass birmingham"/>
    <description>Build a network of canals and rails to transport coal, iron, and cotton...</description>
    <yearpublished value="2018"/>
    <minplayers value="2"/>
    <maxplayers value="4"/>
    <playingtime value="120"/>
    <image>//cf.geekdo-images.com/x3zxjr-Vw5iU4yDPg70Jgw__original/img/FpyxH41Y6z-bo44wGGE-s5Pe5v0=/0x0/filters:format(jpeg)/pic3490053.jpg</image>
    <thumbnail>//cf.geekdo-images.com/x3zxjr-Vw5iU4yDPg70Jgw__thumb/img/ju86EWQb8E6jP0WZk56rLDXYt2s=/fit-in/200x150/filters:strip_icc()/pic3490053.jpg</thumbnail>
    <link type="boardgamepublisher" id="30677" value="Roxley"/>
    <link type="boardgamepublisher" id="34490" value="Iron Games"/>
    <link type="boardgamedesigner" id="103" value="Martin Wallace"/>
    <link type="boardgamedesigner" id="12345" value="Gavan Brown"/>
  </item>
</items>`;

const MOCK_EMPTY_SEARCH_XML = `<?xml version="1.0" encoding="utf-8"?>
<items total="0"></items>`;

// Mock database
vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock Vercel KV
vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

describe('BGG Service', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.clearAllMocks();
  });

  describe('searchBGGGames', () => {
    it('should search for games and return results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_SEARCH_BRASS_XML,
      });

      const results = await searchBGGGames('Brass', {
        fetchThumbnails: false,
        useKV: false, // Disable KV for unit tests
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        id: '224517',
        name: 'Brass: Birmingham',
        yearPublished: 2018,
        type: 'boardgame',
      });
      expect(results[1]).toMatchObject({
        id: '28720',
        name: 'Brass',
        yearPublished: 2007,
        type: 'boardgame',
      });
    });

    it('should handle empty search results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_EMPTY_SEARCH_XML,
      });

      const results = await searchBGGGames('NonexistentGame12345', {
        fetchThumbnails: false,
        useKV: false,
      });

      expect(results).toEqual([]);
    });

    it('should respect maxResults parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_SEARCH_BRASS_XML,
      });

      const results = await searchBGGGames('Brass', {
        fetchThumbnails: false,
        maxResults: 1,
        useKV: false,
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('224517');
    });

    it('should fetch thumbnails for top results when enabled', async () => {
      // Mock search
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_SEARCH_BRASS_XML,
      });

      // Mock database lookup (not found)
      const { db } = await import('../db');
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Mock game details for thumbnail
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_GAME_DETAILS_BRASS_BIRMINGHAM_XML,
      });

      const results = await searchBGGGames('Brass', {
        fetchThumbnails: true,
        maxResults: 1,
        useKV: false,
      });

      expect(results).toHaveLength(1);
      expect(results[0].thumbnailUrl).toBeDefined();
      expect(results[0].thumbnailUrl).toContain('https://');
    });
  });

  describe('getBGGGameDetails', () => {
    it('should fetch and parse game details', async () => {
      // Mock database lookup (not found)
      const { db } = await import('../db');
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Mock insert for caching
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => MOCK_GAME_DETAILS_BRASS_BIRMINGHAM_XML,
      });

      const details = await getBGGGameDetails('224517', { useKV: false });

      expect(details).toMatchObject({
        id: '224517',
        name: 'Brass: Birmingham',
        yearPublished: 2018,
        minPlayers: 2,
        maxPlayers: 4,
        playingTime: 120,
      });
      expect(details.description).toContain('Build a network');
      expect(details.imageUrl).toContain('https://');
      expect(details.thumbnailUrl).toContain('https://');
      expect(details.publishers).toContain('Roxley');
      expect(details.designers).toContain('Martin Wallace');
    });

    it('should use cached data when available', async () => {
      const cachedGame = {
        id: '224517',
        name: 'Brass: Birmingham (cached)',
        description: 'Cached description',
        yearPublished: 2018,
        minPlayers: 2,
        maxPlayers: 4,
        playingTime: 120,
        imageUrl: 'https://example.com/image.jpg',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        publishers: JSON.stringify(['Roxley']),
        designers: JSON.stringify(['Martin Wallace']),
      };

      const { db } = await import('../db');
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([cachedGame]),
          }),
        }),
      });

      const details = await getBGGGameDetails('224517', { useKV: false });

      expect(details.name).toBe('Brass: Birmingham (cached)');
      expect(details.description).toBe('Cached description');
      // Should not have called fetch (would fail since we didn't mock it)
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('extractBGGId', () => {
    it('should extract ID from boardgame URL', () => {
      const url = 'https://boardgamegeek.com/boardgame/224517/brass-birmingham';
      expect(extractBGGId(url)).toBe('224517');
    });

    it('should extract ID from boardgameexpansion URL', () => {
      const url = 'https://boardgamegeek.com/boardgameexpansion/12345/some-expansion';
      expect(extractBGGId(url)).toBe('12345');
    });

    it('should handle URLs without trailing path', () => {
      const url = 'https://boardgamegeek.com/boardgame/224517';
      expect(extractBGGId(url)).toBe('224517');
    });

    it('should return null for invalid URLs', () => {
      expect(extractBGGId('https://example.com')).toBeNull();
      expect(extractBGGId('not a url')).toBeNull();
      expect(extractBGGId('')).toBeNull();
    });

    it('should handle URLs with query parameters', () => {
      const url = 'https://boardgamegeek.com/boardgame/224517/brass-birmingham?version=123';
      expect(extractBGGId(url)).toBe('224517');
    });
  });
});
