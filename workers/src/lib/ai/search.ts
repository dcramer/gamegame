import { eq } from 'drizzle-orm';
import type { D1Database, VectorizeIndex } from '@cloudflare/workers-types';
import { getDb, fragments, resources } from '../db';
import { generateEmbedding } from './embeddings';
import { searchVectorize } from './vectorize';

export interface SearchResult {
  resourceId: string;
  resourceName: string;
  content: string;
  pageNumber?: number;
  section?: string;
  images?: Array<{
    id: string;
    url: string;
    bbox?: number[];
    caption?: string;
  }>;
}

/**
 * Convert natural language query to FTS5 query syntax
 * FTS5 uses: word1 OR word2, "exact phrase", word*, -exclude
 */
function prepareSearchQuery(query: string): string {
  // Remove stop words
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'how', 'what', 'when', 'where'
  ]);

  const words = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 10);

  if (words.length === 0) {
    // Fallback to original query if no keywords
    return query.replace(/[^\w\s]/g, ' ').trim();
  }

  // Join with OR for flexible matching
  return words.join(' OR ');
}

/**
 * Perform hybrid search combining:
 * 1. Vector similarity search (Vectorize)
 * 2. Full-text search (D1 FTS5)
 * 3. Reciprocal Rank Fusion (RRF) to merge results
 */
export async function findRelevantContent(
  db: D1Database,
  vectorIndex: VectorizeIndex,
  gameId: string,
  userQuery: string,
  openaiApiKey: string,
  options: { limit?: number; offset?: number } = {}
): Promise<SearchResult[]> {
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;
  const candidateCount = (limit + offset) * 2; // Fetch more for fusion

  // Step 1: Generate embedding for user query
  const [queryEmbedding] = await generateEmbedding(userQuery, openaiApiKey);

  // Step 2: Execute vector and full-text search in parallel
  const [vectorResults, ftsResults] = await Promise.all([
    // Vector search via Vectorize
    searchVectorize(vectorIndex, queryEmbedding, gameId, { limit: candidateCount }),

    // Full-text search via D1 FTS5
    db
      .prepare(`
        SELECT
          fts.fragment_id,
          fts.rank
        FROM fragments_fts fts
        JOIN fragments f ON f.id = fts.fragment_id
        WHERE fts.content MATCH ? AND f.game_id = ?
        ORDER BY fts.rank
        LIMIT ?
      `)
      .bind(prepareSearchQuery(userQuery), gameId, candidateCount)
      .all<{ fragment_id: string; rank: number }>()
  ]);

  // Step 3: Reciprocal Rank Fusion (RRF)
  const rrfK = 50;
  const vectorWeight = 1.0;
  const ftsWeight = 1.0;

  // Build rank maps
  const vectorRanks = new Map(
    vectorResults.map((r, index) => [r.fragmentId, index])
  );
  const ftsRanks = new Map(
    ftsResults.results?.map((r, index) => [r.fragment_id, index]) ?? []
  );

  // Get all unique fragment IDs
  const allFragmentIds = new Set([
    ...vectorResults.map(r => r.fragmentId),
    ...(ftsResults.results?.map(r => r.fragment_id) ?? [])
  ]);

  // Calculate RRF scores
  const rrfScores: Array<{ fragmentId: string; score: number }> = [];
  for (const fragmentId of allFragmentIds) {
    const vectorRank = vectorRanks.get(fragmentId);
    const ftsRank = ftsRanks.get(fragmentId);

    const vectorScore = vectorRank !== undefined
      ? vectorWeight / (rrfK + vectorRank)
      : 0;
    const ftsScore = ftsRank !== undefined
      ? ftsWeight / (rrfK + ftsRank)
      : 0;

    rrfScores.push({
      fragmentId,
      score: vectorScore + ftsScore
    });
  }

  // Sort by RRF score and apply pagination
  rrfScores.sort((a, b) => b.score - a.score);
  const topFragmentIds = rrfScores
    .slice(offset, offset + limit)
    .map(r => r.fragmentId);

  if (topFragmentIds.length === 0) {
    return [];
  }

  // Step 4: Fetch full fragment data with resource info using Drizzle
  const orm = getDb(db);

  const fragmentData = await orm
    .select({
      fragmentId: fragments.id,
      resourceId: resources.id,
      resourceName: resources.name,
      content: fragments.content,
      pageNumber: fragments.pageNumber,
      section: fragments.section,
      images: fragments.images,
    })
    .from(fragments)
    .innerJoin(resources, eq(fragments.resourceId, resources.id))
    .where(eq(fragments.gameId, gameId))
    .all();

  // Filter to only top fragment IDs and re-sort by RRF score
  const fragmentMap = new Map(fragmentData.map(f => [f.fragmentId, f]));
  const sorted = topFragmentIds
    .map(id => fragmentMap.get(id))
    .filter((f): f is NonNullable<typeof f> => f !== undefined);

  // Parse images JSON and return results
  return sorted.map(f => {
    let images: SearchResult['images'] = undefined;

    if (f.images) {
      try {
        images = JSON.parse(f.images as string);
      } catch (error) {
        console.error('Failed to parse fragment images JSON:', error, { fragmentId: f.fragmentId });
        // Continue with undefined images rather than crashing
      }
    }

    return {
      resourceId: f.resourceId,
      resourceName: f.resourceName,
      content: f.content,
      pageNumber: f.pageNumber ?? undefined,
      section: f.section ?? undefined,
      images,
    };
  });
}
