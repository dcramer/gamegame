import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { env, fetchMock } from 'cloudflare:test';
import { setupTestDb, cleanupTestDb } from '@/test-utils/setup';
import { searchBGGGames, getBGGGameDetails, extractBGGId } from './bgg';
import { getDb, bggGames } from '@/lib/db';
import { eq } from 'drizzle-orm';

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

const MOCK_MINIMAL_GAME_XML = `<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgame" id="12345">
    <name type="primary" value="Minimal Game"/>
  </item>
</items>`;

describe('BGG Service Integration Tests (with Cloudflare fetchMock)', () => {
  beforeAll(async () => {
    await setupTestDb();
    // Activate fetchMock for all tests
    fetchMock.activate();
    // Disable real network connections to catch unmocked requests
    fetchMock.disableNetConnect();
  });

  afterEach(async () => {
    await cleanupTestDb();
    // Verify all mocks were used
    fetchMock.assertNoPendingInterceptors();
  });

  describe('searchBGGGames', () => {
    it('should search for games and return results', async () => {
      // Mock BGG search API
      fetchMock
        .get('https://boardgamegeek.com')
        .intercept({ path: /\/xmlapi2\/search\?.*query=Brass.*/ })
        .reply(200, MOCK_SEARCH_BRASS_XML, {
          headers: { 'Content-Type': 'text/xml' },
        });

      const results = await searchBGGGames('Brass', env.DB, null, {
        fetchThumbnails: false,
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
      fetchMock
        .get('https://boardgamegeek.com')
        .intercept({ path: /\/xmlapi2\/search/ })
        .reply(200, MOCK_EMPTY_SEARCH_XML, {
          headers: { 'Content-Type': 'text/xml' },
        });

      const results = await searchBGGGames('NonexistentGame12345', env.DB, null, {
        fetchThumbnails: false,
      });

      expect(results).toEqual([]);
    });

    it('should respect maxResults parameter', async () => {
      fetchMock
        .get('https://boardgamegeek.com')
        .intercept({ path: /\/xmlapi2\/search/ })
        .reply(200, MOCK_SEARCH_BRASS_XML, {
          headers: { 'Content-Type': 'text/xml' },
        });

      const results = await searchBGGGames('Brass', env.DB, null, {
        fetchThumbnails: false,
        maxResults: 1,
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('224517');
    });

    it('should fetch thumbnails for top results when enabled', async () => {
      // Mock search
      fetchMock
        .get('https://boardgamegeek.com')
        .intercept({ path: /\/xmlapi2\/search/ })
        .reply(200, MOCK_SEARCH_BRASS_XML, {
          headers: { 'Content-Type': 'text/xml' },
        });

      // Mock game details for thumbnail
      fetchMock
        .get('https://boardgamegeek.com')
        .intercept({ path: /\/xmlapi2\/thing\?.*id=224517.*/ })
        .reply(200, MOCK_GAME_DETAILS_BRASS_BIRMINGHAM_XML, {
          headers: { 'Content-Type': 'text/xml' },
        });

      const results = await searchBGGGames('Brass', env.DB, null, {
        fetchThumbnails: true,
        maxResults: 1,
      });

      expect(results).toHaveLength(1);
      expect(results[0].thumbnailUrl).toBeDefined();
      expect(results[0].thumbnailUrl).toContain('https://');
    });
  });

  describe('getBGGGameDetails', () => {
    it('should fetch and parse game details', async () => {
      fetchMock
        .get('https://boardgamegeek.com')
        .intercept({ path: /\/xmlapi2\/thing\?.*id=224517.*/ })
        .reply(200, MOCK_GAME_DETAILS_BRASS_BIRMINGHAM_XML, {
          headers: { 'Content-Type': 'text/xml' },
        });

      const details = await getBGGGameDetails('224517', env.DB, null);

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
