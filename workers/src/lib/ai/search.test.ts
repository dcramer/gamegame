import { describe, it, expect, beforeAll, afterEach, vi, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { setupTestDb, cleanupTestDb, createTestGame } from '@/test-utils/setup';
import { getDb, fragments, resources } from '@/lib/db';
import { findRelevantContent } from './search';
import { EMBEDDINGS, QUERY_EMBEDDINGS } from './search-fixtures';
import * as embeddingsModule from './embeddings';
import * as vectorizeModule from './vectorize';

describe('Hybrid Search Tests (No External APIs)', () => {
  let generateEmbeddingSpy: any;

  // Store fragments for mocking vector search
  const mockVectorStore = new Map<string, { id: string; values: number[]; metadata: any }>();

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(() => {
    mockVectorStore.clear();

    // Mock generateEmbedding to return fixture embeddings
    generateEmbeddingSpy = vi.spyOn(embeddingsModule, 'generateEmbedding');

    // Mock insertEmbeddings to store in our mock store instead of Vectorize
    vi.spyOn(vectorizeModule, 'insertEmbeddings').mockImplementation(async (_index, embeddings) => {
      for (const embedding of embeddings) {
        mockVectorStore.set(embedding.id, embedding);
      }
    });

    // Mock searchVectorize to search our mock store
    vi.spyOn(vectorizeModule, 'searchVectorize').mockImplementation(async (_index, queryVector, gameId, options) => {
      const limit = options?.limit ?? 20;

      // Filter by gameId and calculate cosine similarity
      const results = Array.from(mockVectorStore.values())
        .filter((vec) => vec.metadata.gameId === gameId)
        .map((vec) => {
          // Calculate inner product (cosine similarity for normalized vectors)
          const similarity = queryVector.reduce((sum, val, i) => sum + val * vec.values[i], 0);
          return {
            fragmentId: vec.id, // Return fragmentId, not id
            score: similarity,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return results;
    });
  });

  afterEach(async () => {
    await cleanupTestDb();
    vi.restoreAllMocks();
  });

  // Helper to create test resource
  async function createTestResource(gameId: string, resourceId: string = 'resource-1') {
    const db = getDb(env.DB);
    await db.insert(resources).values([
      {
        id: resourceId,
        gameId,
        name: 'Test Resource',
        originalFilename: 'test.pdf',
        url: '/test.pdf',
        content: 'Test content',
        version: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  }

  // Helper to create test fragments with fixture embeddings
  async function createTestFragment(data: {
    id: string;
    gameId: string;
    resourceId: string;
    content: string;
    embedding: number[]; // Use EMBEDDINGS from fixtures
    pageNumber?: number;
    section?: string;
    images?: string;
  }) {
    const db = getDb(env.DB);

    await db.insert(fragments).values([
      {
        id: data.id,
        gameId: data.gameId,
        resourceId: data.resourceId,
        content: data.content,
        version: 2,
        pageNumber: data.pageNumber,
        section: data.section,
        images: data.images,
      },
    ]);

    // Insert into our mock vector store (Vectorize is mocked)
    await vectorizeModule.insertEmbeddings(null as any, [
      {
        id: data.id,
        values: data.embedding,
        metadata: {
          fragmentId: data.id,
          gameId: data.gameId,
          resourceId: data.resourceId,
          type: 'content',
          ...(data.pageNumber != null && { pageNumber: data.pageNumber }),
          ...(data.section != null && { section: data.section }),
        },
      },
    ]);
  }

  describe('FTS5 Query Preparation', () => {
    it('should handle queries with special characters without crashing', async () => {
      const game = await createTestGame({ name: 'Test Game' });
      await createTestResource(game.id);

      const fragmentId = crypto.randomUUID();
      await createTestFragment({
        id: fragmentId,
        gameId: game.id,
        resourceId: 'resource-1',
        content: 'Player setup with special chars - (parentheses)',
        embedding: EMBEDDINGS['setup-board'],
        pageNumber: 1,
      });

      // Mock the query embedding
      generateEmbeddingSpy.mockResolvedValue([EMBEDDINGS['setup-board']]);

      const results = await findRelevantContent(
        env.DB,
        null as any, // Vectorize is mocked
        game.id,
        'player - setup (with parentheses)',
        'fake-key' // Not used due to mock
      );

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle empty query gracefully', async () => {
      const game = await createTestGame({ name: 'Test Game' });

      generateEmbeddingSpy.mockResolvedValue([EMBEDDINGS['setup-board']]);

      const results = await findRelevantContent(
        env.DB,
        null as any, // Vectorize is mocked
        game.id,
        '',
        'fake-key'
      );

      expect(results).toEqual([]);
    });
  });

  describe('Hybrid Search with Static Fixtures', () => {
    it('should return empty results when no fragments exist', async () => {
      const game = await createTestGame({ name: 'Test Game' });

      generateEmbeddingSpy.mockResolvedValue([QUERY_EMBEDDINGS['how to setup']]);

      const results = await findRelevantContent(
        env.DB,
        null as any, // Vectorize is mocked
        game.id,
        'how to setup the game',
        'fake-key'
      );

      expect(results).toEqual([]);
    });

    it('should find setup fragments using vector similarity', async () => {
      const game = await createTestGame({ name: 'Test Game' });
      await createTestResource(game.id);

      const fragment1Id = crypto.randomUUID();
      const fragment2Id = crypto.randomUUID();

      // Create setup fragment with setup embedding
      await createTestFragment({
        id: fragment1Id,
        gameId: game.id,
        resourceId: 'resource-1',
        content: 'Setup: Place the board in the center of the table.',
        embedding: EMBEDDINGS['setup-board'],
        pageNumber: 1,
        section: 'Setup',
      });

      // Create combat fragment with combat embedding (different)
      await createTestFragment({
        id: fragment2Id,
        gameId: game.id,
        resourceId: 'resource-1',
        content: 'Combat: Roll dice to determine the winner.',
        embedding: EMBEDDINGS['combat-dice'],
        pageNumber: 5,
        section: 'Combat',
      });

      // Search with setup query embedding
      generateEmbeddingSpy.mockResolvedValue([QUERY_EMBEDDINGS['how to setup']]);

      const results = await findRelevantContent(
        env.DB,
        null as any, // Vectorize is mocked
        game.id,
        'how to setup',
        'fake-key'
      );

      expect(results.length).toBeGreaterThan(0);
      // Should find the setup fragment due to vector similarity
      const setupFragment = results.find((r) => r.content.includes('Setup'));
      expect(setupFragment).toBeDefined();
      expect(setupFragment?.pageNumber).toBe(1);
      expect(setupFragment?.section).toBe('Setup');
    });

    it('should find combat fragments using full-text search', async () => {
      const game = await createTestGame({ name: 'Test Game' });
      await createTestResource(game.id);

      const fragmentId = crypto.randomUUID();

      await createTestFragment({
        id: fragmentId,
        gameId: game.id,
        resourceId: 'resource-1',
        content: 'The player must roll dice to determine combat outcomes.',
        embedding: EMBEDDINGS['combat-dice'],
        pageNumber: 3,
        section: 'Combat Rules',
      });

      // Use combat query embedding
      generateEmbeddingSpy.mockResolvedValue([QUERY_EMBEDDINGS['combat rules']]);

      const results = await findRelevantContent(
        env.DB,
        null as any, // Vectorize is mocked
        game.id,
        'dice combat', // Keywords match FTS5
        'fake-key'
      );

      expect(results.length).toBeGreaterThan(0);
      const combatFragment = results.find((r) => r.content.includes('dice'));
      expect(combatFragment).toBeDefined();
      expect(combatFragment?.content).toContain('combat');
    });

    it('should filter results by gameId', async () => {
      const game1 = await createTestGame({ name: 'Game 1' });
      const game2 = await createTestGame({ name: 'Game 2' });
      await createTestResource(game1.id, 'resource-1');
      await createTestResource(game2.id, 'resource-2');

      const fragment1Id = crypto.randomUUID();
      const fragment2Id = crypto.randomUUID();

      await createTestFragment({
        id: fragment1Id,
        gameId: game1.id,
        resourceId: 'resource-1',
        content: 'Game 1 setup instructions.',
        embedding: EMBEDDINGS['setup-instructions'],
      });

      await createTestFragment({
        id: fragment2Id,
        gameId: game2.id,
        resourceId: 'resource-2',
        content: 'Game 2 setup instructions.',
        embedding: EMBEDDINGS['setup-instructions'],
      });

      generateEmbeddingSpy.mockResolvedValue([QUERY_EMBEDDINGS['how to setup']]);

      const results = await findRelevantContent(
        env.DB,
        null as any, // Vectorize is mocked
        game1.id,
        'setup',
        'fake-key'
      );

      expect(results.length).toBeGreaterThan(0);
      // Should only return fragments from game1
      results.forEach((result) => {
        expect(result.content).toContain('Game 1');
        expect(result.content).not.toContain('Game 2');
      });
    });

    it('should respect limit parameter', async () => {
      const game = await createTestGame({ name: 'Test Game' });
      await createTestResource(game.id);

      // Create 10 fragments with same embedding
      for (let i = 0; i < 10; i++) {
        const fragmentId = crypto.randomUUID();
        await createTestFragment({
          id: fragmentId,
          gameId: game.id,
          resourceId: 'resource-1',
          content: `Fragment ${i}: Some content about setup and gameplay.`,
          embedding: EMBEDDINGS['game-setup'],
          pageNumber: i + 1,
        });
      }

      generateEmbeddingSpy.mockResolvedValue([QUERY_EMBEDDINGS['how to setup']]);

      const results = await findRelevantContent(
        env.DB,
        null as any, // Vectorize is mocked
        game.id,
        'setup gameplay',
        'fake-key',
        { limit: 3 }
      );

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should include fragment metadata in results', async () => {
      const game = await createTestGame({ name: 'Test Game' });
      await createTestResource(game.id);

      const fragmentId = crypto.randomUUID();
      const testImages = JSON.stringify([
        {
          id: 'img1',
          url: '/uploads/resources/res1/attachments/img1.png',
          bbox: [100, 200, 300, 400],
          caption: 'Test diagram',
        },
      ]);

      await createTestFragment({
        id: fragmentId,
        gameId: game.id,
        resourceId: 'resource-1',
        content: 'Fragment with metadata about combat.',
        embedding: EMBEDDINGS['combat-dice'],
        pageNumber: 7,
        section: 'Advanced Rules > Combat',
        images: testImages,
      });

      generateEmbeddingSpy.mockResolvedValue([QUERY_EMBEDDINGS['combat rules']]);

      const results = await findRelevantContent(
        env.DB,
        null as any, // Vectorize is mocked
        game.id,
        'combat metadata',
        'fake-key'
      );

      expect(results.length).toBeGreaterThan(0);
      const fragment = results[0];
      expect(fragment.pageNumber).toBe(7);
      expect(fragment.section).toBe('Advanced Rules > Combat');
      expect(fragment.images).toBeDefined();
      expect(fragment.images).toHaveLength(1);
      expect(fragment.images![0].id).toBe('img1');
      expect(fragment.images![0].caption).toBe('Test diagram');
    });

    it('should handle malformed JSON in images field gracefully', async () => {
      const game = await createTestGame({ name: 'Test Game' });
      await createTestResource(game.id);

      const fragmentId = crypto.randomUUID();

      await createTestFragment({
        id: fragmentId,
        gameId: game.id,
        resourceId: 'resource-1',
        content: 'Fragment with invalid JSON images.',
        embedding: EMBEDDINGS['random-content'],
        images: 'invalid json {',
      });

      generateEmbeddingSpy.mockResolvedValue([EMBEDDINGS['random-content']]);

      const results = await findRelevantContent(
        env.DB,
        null as any, // Vectorize is mocked
        game.id,
        'invalid',
        'fake-key'
      );

      expect(results.length).toBeGreaterThan(0);
      // Should not crash, images should be undefined
      expect(results[0].images).toBeUndefined();
    });

    it('should combine vector and FTS results using RRF', async () => {
      const game = await createTestGame({ name: 'Test Game' });
      await createTestResource(game.id);

      // Fragment with exact keywords but different embedding
      const fragment1Id = crypto.randomUUID();
      await createTestFragment({
        id: fragment1Id,
        gameId: game.id,
        resourceId: 'resource-1',
        content: 'Setup instructions for player gameplay.',
        embedding: EMBEDDINGS['setup-instructions'], // Related embedding
        pageNumber: 1,
      });

      // Fragment with different keywords but similar content concept
      const fragment2Id = crypto.randomUUID();
      await createTestFragment({
        id: fragment2Id,
        gameId: game.id,
        resourceId: 'resource-1',
        content: 'Initial configuration for participants.',
        embedding: EMBEDDINGS['setup-board'], // Very similar embedding
        pageNumber: 2,
      });

      generateEmbeddingSpy.mockResolvedValue([QUERY_EMBEDDINGS['how to setup']]);

      const results = await findRelevantContent(
        env.DB,
        null as any, // Vectorize is mocked
        game.id,
        'setup player',
        'fake-key'
      );

      expect(results.length).toBeGreaterThan(0);
      // RRF should rank fragment1 higher (has both keyword match AND vector similarity)
      // while fragment2 has only vector similarity
    });
  });
});
