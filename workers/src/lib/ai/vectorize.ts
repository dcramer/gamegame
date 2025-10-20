import type { VectorizeIndex } from '@cloudflare/workers-types';
import type { VectorMetadata } from '@/types';

export interface VectorEmbedding {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

/**
 * Insert embeddings into Vectorize index
 * Batches automatically (max 100 vectors per request)
 */
export async function insertEmbeddings(
  index: VectorizeIndex,
  embeddings: VectorEmbedding[]
): Promise<void> {
  const BATCH_SIZE = 100;

  for (let i = 0; i < embeddings.length; i += BATCH_SIZE) {
    const batch = embeddings.slice(i, i + BATCH_SIZE);
    await index.upsert(batch);
  }
}

/**
 * Search Vectorize for similar vectors
 * Returns fragment IDs with similarity scores
 */
export async function searchVectorize(
  index: VectorizeIndex,
  queryVector: number[],
  gameId: string,
  options: { limit?: number } = {}
): Promise<Array<{ fragmentId: string; score: number }>> {
  const limit = options.limit ?? 20;

  const results = await index.query(queryVector, {
    topK: limit,
    filter: { gameId }, // Filter by game using metadata
    returnValues: false,
    returnMetadata: true,
  });

  return results.matches.map((match) => ({
    fragmentId: match.id,
    score: match.score,
  }));
}

/**
 * Delete embeddings by fragment IDs
 */
export async function deleteFragmentEmbeddings(
  index: VectorizeIndex,
  fragmentIds: string[]
): Promise<void> {
  if (fragmentIds.length === 0) return;
  await index.deleteByIds(fragmentIds);
}

/**
 * Delete all embeddings for a resource
 * Note: Vectorize doesn't support bulk metadata filtering for deletes,
 * so we need to provide specific IDs
 */
export async function deleteResourceEmbeddings(
  index: VectorizeIndex,
  fragmentIds: string[]
): Promise<void> {
  await deleteFragmentEmbeddings(index, fragmentIds);
}
