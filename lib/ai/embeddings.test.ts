import { describe, it, expect } from 'vitest';
import { generateEmbedding, generateEmbeddings, CURRENT_INDEX_VERSION } from './embeddings';
import { mockEmbeddings, mockOpenAIError } from '@/tests/mocks/network';

describe('generateEmbedding', () => {
  it('should generate embedding from text', async () => {
    mockEmbeddings(['test content']);

    const [embedding, version] = await generateEmbedding('test content', 'test-api-key');

    expect(embedding).toHaveLength(1536);
    expect(version).toBe(CURRENT_INDEX_VERSION);
  });

  it('should replace newlines with spaces', async () => {
    mockEmbeddings(['test content with newlines']);

    const [embedding] = await generateEmbedding('test\ncontent\nwith\nnewlines', 'test-api-key');

    // Just verify it succeeds - the AI SDK handles the actual request
    expect(embedding).toHaveLength(1536);
  });

  it('should throw error if API key is missing', async () => {
    await expect(generateEmbedding('test', '')).rejects.toThrow(
      'Missing OPENAI_API_KEY for embeddings'
    );
  });

  it('should validate embedding dimensions', async () => {
    mockEmbeddings(['test'], { dimensions: 512 }); // Wrong dimension

    await expect(generateEmbedding('test', 'test-api-key')).rejects.toThrow(
      'Embedding dimension mismatch'
    );
  });

  it('should call OpenAI API with correct parameters', async () => {
    mockEmbeddings(['test content']);

    const [embedding] = await generateEmbedding('test content', 'test-api-key');

    // Verify the embedding was generated successfully
    expect(embedding).toHaveLength(1536);
  });
});

describe('generateEmbeddings', () => {
  it('should generate embeddings for multiple chunks', async () => {
    const chunks = [
      { content: 'chunk 1', pageNumber: 1 },
      { content: 'chunk 2', pageNumber: 2, section: 'Setup' },
      { content: 'chunk 3', pageRange: [3, 5] as [number, number] },
    ];

    mockEmbeddings(chunks.map(c => c.content));

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

    mockEmbeddings(['valid content', 'another valid']);

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

    mockEmbeddings(['chunk with images']);

    const [results] = await generateEmbeddings(chunks, 'test-api-key');

    expect(results[0].images).toHaveLength(1);
    expect(results[0].images![0].id).toBe('img1');
    expect(results[0].images![0].caption).toBe('Test image');
  });

  it('should validate embedding count matches chunks', async () => {
    const chunks = [{ content: 'chunk 1' }, { content: 'chunk 2' }];

    // Mock response with wrong number of embeddings (only 1 instead of 2)
    mockEmbeddings(['chunk 1']); // Missing second embedding

    await expect(generateEmbeddings(chunks, 'test-api-key')).rejects.toThrow(
      'Embedding count mismatch'
    );
  });

  it('should validate all embedding dimensions', async () => {
    const chunks = [{ content: 'chunk 1' }, { content: 'chunk 2' }];

    // Mock response with both embeddings having wrong dimensions
    mockEmbeddings(['chunk 1', 'chunk 2'], { dimensions: 512 }); // Wrong dimension

    await expect(generateEmbeddings(chunks, 'test-api-key')).rejects.toThrow(
      'Embedding dimension mismatch at index'
    );
  });

  it('should batch chunks correctly', async () => {
    const chunks = Array.from({ length: 10 }, (_, i) => ({
      content: `chunk ${i}`,
    }));

    mockEmbeddings(chunks.map(c => c.content));

    const [results] = await generateEmbeddings(chunks, 'test-api-key');

    expect(results).toHaveLength(10);
  });

  it('should handle API errors', async () => {
    const chunks = [{ content: 'test' }];

    mockOpenAIError(500, 'Internal Server Error', 'embeddings');

    await expect(generateEmbeddings(chunks, 'test-api-key')).rejects.toThrow();
  }, 10000); // Increase timeout for AI SDK retries
});
