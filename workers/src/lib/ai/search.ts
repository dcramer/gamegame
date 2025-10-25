import { eq, inArray } from 'drizzle-orm';
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
 * FTS5 special chars: " (phrase), - (NOT), * (wildcard), () (grouping), : (column)
 *
 * Strategy:
 * 1. If query has intentional FTS5 syntax (quotes, operators), sanitize it carefully
 * 2. Otherwise, escape special chars and build OR query from keywords
 */
function prepareSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return '';
  }

  // Check if user is using intentional FTS5 syntax (has quotes or looks like FTS5 query)
  const hasQuotes = trimmed.includes('"');
  const hasOperators = /\b(AND|OR|NOT)\b/.test(trimmed);

  if (hasQuotes || hasOperators) {
    // User is using FTS5 syntax - sanitize carefully while preserving intent
    let sanitized = trimmed;

    // 1. Balance quotes - escape unmatched quotes
    const quoteCount = (sanitized.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      // Odd number of quotes - escape all to prevent syntax error
      sanitized = sanitized.replace(/"/g, '""');
    }

    // 2. Balance parentheses - remove unmatched ones
    let depth = 0;
    const chars = sanitized.split('');
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === '(') depth++;
      if (chars[i] === ')') {
        depth--;
        if (depth < 0) {
          chars[i] = ' '; // Remove unmatched closing paren
          depth = 0;
        }
      }
    }
    // Remove remaining unmatched opening parens by converting to spaces
    // Safety: only scan once to avoid infinite loop
    if (depth > 0) {
      for (let i = chars.length - 1; i >= 0 && depth > 0; i--) {
        if (chars[i] === '(') {
          chars[i] = ' ';
          depth--;
        }
      }
    }
    sanitized = chars.join('');

    // 3. Remove column prefixes (e.g., "content:") that aren't supported
    sanitized = sanitized.replace(/\w+:/g, '');

    // 4. Escape FTS5 special operators: ^ (prefix), + (must include)
    // These can cause syntax errors or unexpected behavior
    sanitized = sanitized.replace(/[\^+]/g, ' ');

    // 5. Safety check: if sanitization resulted in empty query, fall back to safe search
    const finalSanitized = sanitized.trim();
    if (!finalSanitized) {
      // Fall back to extracting keywords from original query
      const keywords = trimmed
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2)
        .slice(0, 5);
      return keywords.join(' OR ') || 'game';
    }

    return finalSanitized;
  }

  // Natural language query - extract keywords and build OR query
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'how', 'what', 'when', 'where'
  ]);

  // Extract words, removing special FTS5 characters
  const words = trimmed
    .toLowerCase()
    // Remove FTS5 special chars: - * " ( ) : ^ +
    .replace(/[-*"():^+]/g, ' ')
    // Remove other punctuation
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 10); // Limit to 10 terms for performance

  if (words.length === 0) {
    // No valid keywords - use original query with special chars escaped
    return trimmed.replace(/[^\w\s]/g, ' ').trim();
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

  // Early return for empty queries
  if (!userQuery || !userQuery.trim()) {
    return [];
  }

  // Step 1: Generate embedding for user query
  const [queryEmbedding] = await generateEmbedding(userQuery, openaiApiKey);

  // Step 2: Execute vector and full-text search in parallel with graceful degradation
  const [vectorResults, ftsResults] = await Promise.allSettled([
    // Vector search via Vectorize
    searchVectorize(vectorIndex, queryEmbedding, gameId, { limit: candidateCount }),

    // Full-text search via D1 FTS5
    db
      .prepare(`
        SELECT
          fts.id,
          fts.rank
        FROM fragments_fts fts
        JOIN fragments f ON f.id = fts.id
        WHERE fts.content MATCH ? AND f.game_id = ?
        ORDER BY fts.rank
        LIMIT ?
      `)
      .bind(prepareSearchQuery(userQuery), gameId, candidateCount)
      .all<{ id: string; rank: number }>()
  ]);

  // Handle search failures gracefully - use whatever results we got
  const vectorMatches = vectorResults.status === 'fulfilled' ? vectorResults.value : [];
  const ftsMatches = ftsResults.status === 'fulfilled' && ftsResults.value.results
    ? ftsResults.value.results
    : [];

  // Log failures for monitoring
  if (vectorResults.status === 'rejected') {
    console.error('Vector search failed:', vectorResults.reason);
  }
  if (ftsResults.status === 'rejected') {
    console.error('FTS search failed:', ftsResults.reason);
  }

  // Step 3: Reciprocal Rank Fusion (RRF)
  const rrfK = 50;
  const vectorWeight = 1.0;
  const ftsWeight = 1.0;

  // Build rank maps
  const vectorRanks = new Map(
    vectorMatches.map((r, index) => [r.fragmentId, index])
  );
  const ftsRanks = new Map(
    ftsMatches.map((r, index) => [r.id, index])
  );

  // Get all unique fragment IDs
  const allFragmentIds = new Set([
    ...vectorMatches.map(r => r.fragmentId),
    ...ftsMatches.map((r) => r.id)
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
    .where(inArray(fragments.id, topFragmentIds))
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
