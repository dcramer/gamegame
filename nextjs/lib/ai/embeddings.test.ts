import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateEmbedding, generateEmbeddings, CURRENT_INDEX_VERSION } from './embeddings';
import { createMockFetch, openAI } from '@/tests/api-mocks';

const mockFetch = createMockFetch();

describe('generateEmbedding', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should generate embedding from text', async () => {
    const mockEmbedding = Array(1536)
      .fill(0)
      .map(() => Math.random());

    mockFetch.mockResolvedValueOnce(openAI.embeddings(['test content']));

    const [embedding, version] = await generateEmbedding('test content', 'test-api-key');

    expect(embedding).toHaveLength(1536);
    expect(version).toBe(CURRENT_INDEX_VERSION);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('should replace newlines with spaces', async () => {
    mockFetch.mockResolvedValueOnce(openAI.embeddings(['test']));

    await generateEmbedding('test\ncontent\nwith\nnewlines', 'test-api-key');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.input[0]).not.toContain('\n');
  });

  it('should throw error if API key is missing', async () => {
    await expect(generateEmbedding('test', '')).rejects.toThrow(
      'Missing OPENAI_API_KEY for embeddings'
    );
  });

  it('should validate embedding dimensions', async () => {
    // Mock response with wrong dimensions
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'list',
        data: [
          {
            object: 'embedding',
            index: 0,
            embedding: Array(512).fill(0), // Wrong dimension
          },
        ],
      }),
    });

    await expect(generateEmbedding('test', 'test-api-key')).rejects.toThrow(
      'Embedding dimension mismatch'
    );
  });

  it('should call OpenAI API with correct parameters', async () => {
    mockFetch.mockResolvedValueOnce(openAI.embeddings(['test']));

    await generateEmbedding('test content', 'test-api-key');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        }),
      })
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.model).toBe('text-embedding-3-small');
    expect(callBody.input).toEqual(['test content']);
  });
});

describe('generateEmbeddings', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should generate embeddings for multiple chunks', async () => {
    const chunks = [
      { content: 'chunk 1', pageNumber: 1 },
      { content: 'chunk 2', pageNumber: 2, section: 'Setup' },
      { content: 'chunk 3', pageRange: [3, 5] as [number, number] },
    ];

    mockFetch.mockResolvedValueOnce(openAI.embeddings(chunks.map(c => c.content)));

    const [results, version] = await generateEmbeddings(chunks, 'test-api-key');

    expect(results).toHaveLength(3);
    expect(version).toBe(CURRENT_INDEX_VERSION);

    // Verify metadata is preserved
    expect(results[0].pageNumber).toBe(1);
    expect(results[1].pageNumber).toBe(2);
    expect(results[1].section).toBe('Setup');
    expect(results[2].pageRange).toEqual([3, 5]);

    // Verify embeddings are present
    results.forEach(r => {
      expect(r.embedding).toHaveLength(1536);
      expect(r.content).toBeDefined();
    });
  });

  it('should filter out empty chunks', async () => {
    const chunks = [
      { content: 'valid content' },
      { content: '   ' }, // Only whitespace
      { content: '' }, // Empty
      { content: 'another valid' },
    ];

    mockFetch.mockResolvedValueOnce(openAI.embeddings(['valid content', 'another valid']));

    const [results] = await generateEmbeddings(chunks, 'test-api-key');

    expect(results).toHaveLength(2);
    expect(results[0].content).toBe('valid content');
    expect(results[1].content).toBe('another valid');
  });

  it('should throw error if all chunks are empty', async () => {
    const chunks = [{ content: '' }, { content: '   ' }, { content: '\n\n' }];

    await expect(generateEmbeddings(chunks, 'test-api-key')).rejects.toThrow(
      'No valid content to embed'
    );
  });

  it('should preserve image metadata', async () => {
    const chunks = [
      {
        content: 'chunk with images',
        images: [
          {
            id: 'img1',
            url: 'https://example.com/img1.png',
            caption: 'Test image',
            bbox: [0, 0, 100, 100],
          },
        ],
      },
    ];

    mockFetch.mockResolvedValueOnce(openAI.embeddings(['chunk with images']));

    const [results] = await generateEmbeddings(chunks, 'test-api-key');

    expect(results[0].images).toHaveLength(1);
    expect(results[0].images![0].id).toBe('img1');
    expect(results[0].images![0].caption).toBe('Test image');
  });

  it('should validate embedding count matches chunks', async () => {
    const chunks = [{ content: 'chunk 1' }, { content: 'chunk 2' }];

    // Mock response with wrong number of embeddings
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'list',
        data: [
          {
            object: 'embedding',
            index: 0,
            embedding: Array(1536).fill(0),
          },
          // Missing second embedding
        ],
      }),
    });

    await expect(generateEmbeddings(chunks, 'test-api-key')).rejects.toThrow(
      'Embedding count mismatch'
    );
  });

  it('should validate all embedding dimensions', async () => {
    const chunks = [{ content: 'chunk 1' }, { content: 'chunk 2' }];

    // Mock response with one valid, one invalid dimension
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'list',
        data: [
          {
            object: 'embedding',
            index: 0,
            embedding: Array(1536).fill(0),
          },
          {
            object: 'embedding',
            index: 1,
            embedding: Array(512).fill(0), // Wrong dimension
          },
        ],
      }),
    });

    await expect(generateEmbeddings(chunks, 'test-api-key')).rejects.toThrow(
      'Embedding dimension mismatch at index 1'
    );
  });

  it('should batch chunks correctly', async () => {
    const chunks = Array.from({ length: 10 }, (_, i) => ({
      content: `chunk ${i}`,
    }));

    mockFetch.mockResolvedValueOnce(openAI.embeddings(chunks.map(c => c.content)));

    const [results] = await generateEmbeddings(chunks, 'test-api-key');

    expect(results).toHaveLength(10);
    expect(mockFetch).toHaveBeenCalledOnce(); // Should batch all in one call

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.input).toHaveLength(10);
  });

  it('should handle API errors', async () => {
    const chunks = [{ content: 'test' }];

    mockFetch.mockResolvedValueOnce(openAI.error(500, 'Internal Server Error'));

    await expect(generateEmbeddings(chunks, 'test-api-key')).rejects.toThrow();
  });
});
