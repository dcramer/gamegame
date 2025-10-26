import type { VectorizeIndex } from '@cloudflare/workers-types';
import type { VectorMetadata } from '@/types';

export interface VectorEmbedding {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

/**
 * Validate and sanitize metadata to fit within Vectorize's 10KB limit
 * Vectorize has a 10KB limit per vector's metadata
 */
function validateMetadata(embedding: VectorEmbedding): VectorEmbedding {
  const MAX_METADATA_SIZE = 10 * 1024; // 10KB in bytes
  const MAX_SECTION_LENGTH = 500; // Truncate sections longer than this

  // Estimate metadata size (rough approximation)
  const metadataString = JSON.stringify(embedding.metadata);
  const estimatedSize = new Blob([metadataString]).size;

  if (estimatedSize <= MAX_METADATA_SIZE) {
    return embedding;
  }

  // Metadata too large - try to reduce it
  const sanitizedMetadata = { ...embedding.metadata };

  // Truncate section if present and long
  if (sanitizedMetadata.section && typeof sanitizedMetadata.section === 'string') {
    if (sanitizedMetadata.section.length > MAX_SECTION_LENGTH) {
      sanitizedMetadata.section = sanitizedMetadata.section.substring(0, MAX_SECTION_LENGTH) + '...';
      console.warn(`[Vectorize] Truncated long section for fragment ${embedding.id}: ${sanitizedMetadata.section.length} → ${MAX_SECTION_LENGTH} chars`);
    }
  }

  // Verify new size
  const newMetadataString = JSON.stringify(sanitizedMetadata);
  const newSize = new Blob([newMetadataString]).size;

  if (newSize > MAX_METADATA_SIZE) {
    // Still too large - remove section entirely
    delete sanitizedMetadata.section;
    console.warn(`[Vectorize] Removed section metadata for fragment ${embedding.id} (size: ${newSize} bytes)`);
  }

  return {
    ...embedding,
    metadata: sanitizedMetadata,
  };
}

/**
 * Insert embeddings into Vectorize index
 * Batches automatically (max 100 vectors per request)
 * Validates metadata size to prevent silent failures
 */
export async function insertEmbeddings(
  index: VectorizeIndex,
  embeddings: VectorEmbedding[]
): Promise<void> {
  const BATCH_SIZE = 100;

  // Validate and sanitize all embeddings first
  const sanitizedEmbeddings = embeddings.map(validateMetadata);

  for (let i = 0; i < sanitizedEmbeddings.length; i += BATCH_SIZE) {
    const batch = sanitizedEmbeddings.slice(i, i + BATCH_SIZE);
    await index.upsert(batch);
  }
}

/**
 * Delete embeddings from Vectorize index in safe batches
 */
export async function deleteEmbeddings(
  index: VectorizeIndex,
  embeddingIds: string[]
): Promise<void> {
  if (embeddingIds.length === 0) {
    return;
  }

  const BATCH_SIZE = 100;
  for (let i = 0; i < embeddingIds.length; i += BATCH_SIZE) {
    const batch = embeddingIds.slice(i, i + BATCH_SIZE);
    await index.deleteByIds(batch);
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
  options: {
    limit?: number;
    type?: 'content' | 'question';     // Filter by vector type
    fragmentType?: 'text' | 'image';   // Filter by fragment type (only for content vectors)
    resourceId?: string;                // Filter by resource
  } = {}
): Promise<Array<{ fragmentId: string; score: number; metadata?: any }>> {
  const limit = options.limit ?? 20;

  // Build filter object
  const filter: Record<string, any> = { gameId };

  if (options.type) {
    filter.type = options.type;
  }

  if (options.fragmentType) {
    filter.fragmentType = options.fragmentType;
  }

  if (options.resourceId) {
    filter.resourceId = options.resourceId;
  }

  const results = await index.query(queryVector, {
    topK: limit,
    filter,
    returnValues: false,
    returnMetadata: true,
  });

  return results.matches.map((match) => ({
    fragmentId: match.metadata?.fragmentId || match.id,
    score: match.score,
    metadata: match.metadata,
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
