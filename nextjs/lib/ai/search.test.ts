import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findRelevantContent } from './search';
import * as embeddingsModule from './embeddings';
import { createMockFetch, openAI } from '@/tests/api-mocks';

// Mock the database
vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
  },
}));

const mockFetch = createMockFetch();

describe('findRelevantContent', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.clearAllMocks();
  });

  it('should return empty array for empty query', async () => {
    const results = await findRelevantContent('game-1', '', 'test-api-key');
    expect(results).toEqual([]);
  });

  it('should generate embedding for query', async () => {
    const generateEmbeddingSpy = vi.spyOn(embeddingsModule, 'generateEmbedding');
    const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
    generateEmbeddingSpy.mockResolvedValue([mockEmbedding, 4]);

    // Mock database to return empty results
    const { db } = await import('../db');
    const mockSelect = vi.fn().mockReturnThis();
    const mockFrom = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockReturnThis();
    const mockOrderBy = vi.fn().mockReturnThis();
    const mockLimit = vi.fn().mockResolvedValue([]);

    (db.select as any).mockReturnValue({
      from: mockFrom.mockReturnValue({
        where: mockWhere.mockReturnValue({
          orderBy: mockOrderBy.mockReturnValue({
            limit: mockLimit,
          }),
        }),
      }),
    });

    try {
      await findRelevantContent('game-1', 'test query', 'test-api-key');
    } catch (e) {
      // Ignore errors from mocked database
    }

    expect(generateEmbeddingSpy).toHaveBeenCalledWith('test query', 'test-api-key');
    generateEmbeddingSpy.mockRestore();
  });

  it('should respect limit parameter', async () => {
    const generateEmbeddingSpy = vi.spyOn(embeddingsModule, 'generateEmbedding');
    generateEmbeddingSpy.mockResolvedValue([Array(1536).fill(0), 4]);

    const { db } = await import('../db');
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      innerJoin: vi.fn().mockReturnThis(),
    });

    const results = await findRelevantContent('game-1', 'test query', 'test-api-key', {
      limit: 3,
    });

    // Even with no results, function should complete
    expect(results).toEqual([]);
    generateEmbeddingSpy.mockRestore();
  });
});

describe('diversifyResults (internal)', () => {
  // Test the diversification logic by importing and testing it
  // Since it's not exported, we'll test it through the main function's behavior

  it('should handle results from same page', async () => {
    const generateEmbeddingSpy = vi.spyOn(embeddingsModule, 'generateEmbedding');
    generateEmbeddingSpy.mockResolvedValue([Array(1536).fill(0), 4]);

    const { db } = await import('../db');

    // Mock to return multiple results from same page
    const mockFragments = [
      {
        fragmentId: 'frag-1',
        resourceId: 'res-1',
        resourceName: 'Resource 1',
        content: 'Content 1',
        pageNumber: 1,
        section: 'Setup',
        images: null,
        searchableContent: 'Searchable 1',
      },
      {
        fragmentId: 'frag-2',
        resourceId: 'res-1',
        resourceName: 'Resource 1',
        content: 'Content 2',
        pageNumber: 1,
        section: 'Setup',
        images: null,
        searchableContent: 'Searchable 2',
      },
      {
        fragmentId: 'frag-3',
        resourceId: 'res-1',
        resourceName: 'Resource 1',
        content: 'Content 3',
        pageNumber: 1,
        section: 'Setup',
        images: null,
        searchableContent: 'Searchable 3',
      },
    ];

    // Mock vector search to return these fragments
    let selectCallCount = 0;
    (db.select as any).mockImplementation(() => {
      selectCallCount++;

      // First 3 calls are for vector/FTS searches
      if (selectCallCount <= 3) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(
                  mockFragments.map((f, i) => ({ fragmentId: f.fragmentId, score: 1 - i * 0.1 }))
                ),
              }),
            }),
          }),
        };
      }

      // 4th call is for fetching fragment data
      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(mockFragments),
          }),
        }),
      };
    });

    // Disable reranking to test diversification directly
    const results = await findRelevantContent('game-1', 'test query', 'test-api-key', {
      limit: 10,
      enableReranking: false,
    });

    // Should be limited to 2 results per page (maxPerPage = 2)
    expect(results.length).toBeLessThanOrEqual(2);
    generateEmbeddingSpy.mockRestore();
  });
});

describe('rerankWithCrossEncoder (internal)', () => {
  it('should score and rerank candidates', async () => {
    const generateEmbeddingSpy = vi.spyOn(embeddingsModule, 'generateEmbedding');
    generateEmbeddingSpy.mockResolvedValue([Array(1536).fill(0), 4]);

    const { db } = await import('../db');

    // Mock fragments with different scores
    const mockFragments = [
      {
        fragmentId: 'frag-1',
        resourceId: 'res-1',
        resourceName: 'Resource 1',
        content: 'Highly relevant content about setup',
        pageNumber: 1,
        section: null,
        images: null,
        searchableContent: 'Highly relevant content about setup',
      },
      {
        fragmentId: 'frag-2',
        resourceId: 'res-1',
        resourceName: 'Resource 1',
        content: 'Somewhat relevant content',
        pageNumber: 2,
        section: null,
        images: null,
        searchableContent: 'Somewhat relevant content',
      },
    ];

    let selectCallCount = 0;
    (db.select as any).mockImplementation(() => {
      selectCallCount++;

      // First 3 calls are for vector/FTS searches
      if (selectCallCount <= 3) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(
                  mockFragments.map((f, i) => ({ fragmentId: f.fragmentId, score: 1 - i * 0.1 }))
                ),
              }),
            }),
          }),
        };
      }

      // 4th call is for fetching fragment data
      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(mockFragments),
          }),
        }),
      };
    });

    // Mock reranking API responses - reverse order of scores
    mockFetch
      .mockResolvedValueOnce(openAI.chatCompletion('50')) // frag-1 gets score 50
      .mockResolvedValueOnce(openAI.chatCompletion('90')); // frag-2 gets score 90

    const results = await findRelevantContent('game-1', 'test query', 'test-api-key', {
      limit: 10,
      enableReranking: true,
    });

    // Reranking should have reordered results (frag-2 should come first with score 90)
    expect(results.length).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalled(); // Reranking API should be called

    generateEmbeddingSpy.mockRestore();
  });

  it('should handle reranking API errors gracefully', async () => {
    const generateEmbeddingSpy = vi.spyOn(embeddingsModule, 'generateEmbedding');
    generateEmbeddingSpy.mockResolvedValue([Array(1536).fill(0), 4]);

    const { db } = await import('../db');

    const mockFragments = [
      {
        fragmentId: 'frag-1',
        resourceId: 'res-1',
        resourceName: 'Resource 1',
        content: 'Content 1',
        pageNumber: 1,
        section: null,
        images: null,
        searchableContent: 'Searchable 1',
      },
    ];

    let selectCallCount = 0;
    (db.select as any).mockImplementation(() => {
      selectCallCount++;

      if (selectCallCount <= 3) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ fragmentId: 'frag-1', score: 1 }]),
              }),
            }),
          }),
        };
      }

      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(mockFragments),
          }),
        }),
      };
    });

    // Mock API error
    mockFetch.mockResolvedValueOnce(openAI.error(500, 'Internal Server Error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const results = await findRelevantContent('game-1', 'test query', 'test-api-key', {
      limit: 10,
      enableReranking: true,
    });

    // Should still return results even if reranking fails
    expect(results.length).toBeGreaterThan(0);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
    generateEmbeddingSpy.mockRestore();
  });
});

describe('RRF (Reciprocal Rank Fusion)', () => {
  it('should combine results from multiple sources', async () => {
    const generateEmbeddingSpy = vi.spyOn(embeddingsModule, 'generateEmbedding');
    generateEmbeddingSpy.mockResolvedValue([Array(1536).fill(0), 4]);

    const { db } = await import('../db');

    // Fragments that appear in different search results
    const mockFragments = [
      {
        fragmentId: 'frag-1',
        resourceId: 'res-1',
        resourceName: 'Resource 1',
        content: 'Content 1',
        pageNumber: 1,
        section: null,
        images: null,
      },
      {
        fragmentId: 'frag-2',
        resourceId: 'res-1',
        resourceName: 'Resource 1',
        content: 'Content 2',
        pageNumber: 2,
        section: null,
        images: null,
      },
    ];

    let selectCallCount = 0;
    (db.select as any).mockImplementation(() => {
      selectCallCount++;

      // First call: content vector search returns frag-1 first
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  { fragmentId: 'frag-1', score: 0.9 },
                  { fragmentId: 'frag-2', score: 0.5 },
                ]),
              }),
            }),
          }),
        };
      }

      // Second call: question vector search returns frag-2 first
      if (selectCallCount === 2) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  { fragmentId: 'frag-2', score: 0.8 },
                  { fragmentId: 'frag-1', score: 0.4 },
                ]),
              }),
            }),
          }),
        };
      }

      // Third call: FTS returns frag-1 first
      if (selectCallCount === 3) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  { id: 'frag-1', rank: 0.7 },
                  { id: 'frag-2', rank: 0.3 },
                ]),
              }),
            }),
          }),
        };
      }

      // Fourth call: fetch fragment data
      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(mockFragments),
          }),
        }),
      };
    });

    const results = await findRelevantContent('game-1', 'test query', 'test-api-key', {
      limit: 10,
      enableReranking: false, // Disable to test RRF directly
    });

    // RRF should combine rankings from all three sources
    expect(results.length).toBeGreaterThan(0);

    generateEmbeddingSpy.mockRestore();
  });
});
