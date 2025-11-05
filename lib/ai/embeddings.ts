import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export const CURRENT_INDEX_VERSION = 5; // Incremented for HyDE question embeddings and answer type classification

const getEmbeddingModel = (apiKey: string) => {
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY for embeddings');
  }
  const openai = createOpenAI({ apiKey });
  return openai.embedding('text-embedding-3-small');
};

/**
 * Generate single embedding from text
 * Returns: [embedding vector, version]
 */
export async function generateEmbedding(
  value: string,
  apiKey: string
): Promise<[number[], number]> {
  const input = value.replaceAll('\n', ' ');
  const embeddingModel = getEmbeddingModel(apiKey);

  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });

  // Validate dimensions (must be 1536 for text-embedding-3-small)
  const expectedDimensions = 1536;
  if (embedding.length !== expectedDimensions) {
    throw new Error(
      `Embedding dimension mismatch: expected ${expectedDimensions}, got ${embedding.length}`
    );
  }

  return [embedding, CURRENT_INDEX_VERSION];
}

/**
 * Generate embeddings for multiple text chunks
 * Used during resource processing
 */
export async function generateEmbeddings(
  chunks: Array<{
    content: string;
    pageNumber?: number;
    pageRange?: [number, number];
    section?: string;
    images?: Array<{
      id: string;
      url: string;
      bbox?: number[];
      caption?: string;
    }>;
  }>,
  apiKey: string
): Promise<
  [
    Array<{
      embedding: number[];
      content: string;
      pageNumber?: number;
      pageRange?: [number, number];
      section?: string;
      images?: Array<{
        id: string;
        url: string;
        bbox?: number[];
        caption?: string;
      }>;
    }>,
    number
  ]
> {
  // Filter out empty chunks
  const validChunks = chunks.filter(c => c.content.trim().length > 0);

  if (validChunks.length === 0) {
    throw new Error('No valid content to embed after filtering empty chunks');
  }

  // Generate embeddings for all chunks
  const embeddingModel = getEmbeddingModel(apiKey);

  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: validChunks.map(c => c.content),
  });

  // Verify count matches
  if (embeddings.length !== validChunks.length) {
    throw new Error(
      `Embedding count mismatch: expected ${validChunks.length}, got ${embeddings.length}`
    );
  }

  // Validate dimensions
  const expectedDimensions = 1536;
  embeddings.forEach((embedding, index) => {
    if (embedding.length !== expectedDimensions) {
      throw new Error(
        `Embedding dimension mismatch at index ${index}: expected ${expectedDimensions}, got ${embedding.length}`
      );
    }
  });

  return [
    embeddings.map((e, i) => ({
      content: validChunks[i].content,
      embedding: e,
      pageNumber: validChunks[i].pageNumber,
      pageRange: validChunks[i].pageRange,
      section: validChunks[i].section,
      images: validChunks[i].images,
    })),
    CURRENT_INDEX_VERSION
  ];
}
