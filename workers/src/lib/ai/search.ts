import { eq, inArray } from 'drizzle-orm';
import type { D1Database, VectorizeIndex } from '@cloudflare/workers-types';
import { getDb, fragments, resources } from '../db';
import { generateEmbedding } from './embeddings';
import { searchVectorize } from './vectorize';
import { getModel } from '../config/models';

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
 * Diversify search results to avoid redundancy
 * Limits results per page and per resource to provide broader coverage
 */
function diversifyResults<T extends { pageNumber?: number | null; resourceId: string }>(
  results: T[],
  options: {
    maxPerPage?: number;
    maxPerResource?: number;
  }
): T[] {
  const { maxPerPage = 2, maxPerResource = 6 } = options;

  const diversified: T[] = [];
  const pageCount = new Map<string, number>(); // key: "resourceId:pageNumber"
  const resourceCount = new Map<string, number>();

  for (const result of results) {
    const pageKey = `${result.resourceId}:${result.pageNumber ?? 'none'}`;
    const resourceKey = result.resourceId;

    // Check constraints
    const currentPageCount = pageCount.get(pageKey) || 0;
    const currentResourceCount = resourceCount.get(resourceKey) || 0;

    if (currentPageCount >= maxPerPage) continue;
    if (currentResourceCount >= maxPerResource) continue;

    // Add result and update counts
    diversified.push(result);
    pageCount.set(pageKey, currentPageCount + 1);
    resourceCount.set(resourceKey, currentResourceCount + 1);
  }

  return diversified;
}

/**
 * Rerank search results using cross-encoder LLM scoring
 * Scores each candidate's relevance to the query (0-100)
 *
 * Uses gpt-5-mini for reranking (fast and cost-effective for scoring tasks)
 *
 * @param query User's search query
 * @param candidates Candidate results with searchable content
 * @param openaiApiKey OpenAI API key
 * @param environment Environment for model selection
 * @returns Candidates sorted by relevance score (highest first)
 */
async function rerankWithCrossEncoder<T extends { searchableContent?: string | null; content: string }>(
  query: string,
  candidates: T[],
  openaiApiKey: string,
  environment?: string
): Promise<T[]> {
  if (candidates.length === 0) {
    return candidates;
  }

  // gpt-5-mini is used for reranking (defined in config/models.ts)
  const model = getModel('reranking', environment);

  // Score all candidates in parallel
  const scoredResults = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        // Use searchableContent if available (has more context), fallback to content
        const documentText = (candidate.searchableContent || candidate.content).slice(0, 2000);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{
              role: 'user',
              content: `Rate how well this content answers the query on a scale of 0-100.

Query: "${query}"

Content:
${documentText}

Return ONLY a number between 0-100, nothing else.`
            }],
            temperature: 0,
            max_completion_tokens: 10,
          }),
        });

        if (!response.ok) {
          console.error('Reranking API error:', response.status, response.statusText);
          return { candidate, score: 0 };
        }

        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        const scoreText = data.choices[0]?.message?.content?.trim() || '0';
        const score = parseInt(scoreText, 10);

        // Validate score is in range, default to 0 if invalid
        const validScore = !isNaN(score) && score >= 0 && score <= 100 ? score : 0;

        return { candidate, score: validScore };
      } catch (error) {
        console.error('Error scoring candidate:', error);
        return { candidate, score: 0 };
      }
    })
  );

  // Sort by score (highest first) and return candidates
  return scoredResults
    .sort((a, b) => b.score - a.score)
    .map(r => r.candidate);
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
 * Perform advanced hybrid search with cross-encoder reranking:
 * 1. Content vector search (Vectorize with type='content')
 * 2. Question vector search (Vectorize with type='question' - HyDE)
 * 3. Full-text search (D1 FTS5)
 * 4. Reciprocal Rank Fusion (RRF) to merge results
 * 5. Cross-encoder reranking with LLM (optional, enabled by default)
 * 6. Result diversification to avoid redundancy
 */
export async function findRelevantContent(
  db: D1Database,
  vectorIndex: VectorizeIndex,
  gameId: string,
  userQuery: string,
  openaiApiKey: string,
  options: {
    limit?: number;
    offset?: number;
    fragmentType?: 'text' | 'image'; // Filter by fragment type
    resourceType?: string;            // Filter by resource type
    environment?: string;              // Environment for model selection
    enableReranking?: boolean;         // Enable cross-encoder reranking (default: true)
  } = {}
): Promise<SearchResult[]> {
  const startTime = Date.now();
  const limit = options.limit ?? 5;  // Reduced from 10 to decrease token usage
  const offset = options.offset ?? 0;
  const candidateCount = (limit + offset) * 2; // Fetch more for fusion

  // Early return for empty queries
  if (!userQuery || !userQuery.trim()) {
    return [];
  }

  console.log(`[Search] Starting search for "${userQuery.slice(0, 50)}..." (limit=${limit}, enableReranking=${options.enableReranking ?? true})`);

  // Step 1: Generate embedding for user query
  const embeddingStart = Date.now();
  const [queryEmbedding] = await generateEmbedding(userQuery, openaiApiKey);
  console.log(`[Search] Embedding generated in ${Date.now() - embeddingStart}ms`);

  // Step 2: Execute 3 searches in parallel with graceful degradation
  const searchStart = Date.now();
  const [contentResults, questionResults, ftsResults] = await Promise.allSettled([
    // A. Content vector search (search fragment content)
    searchVectorize(vectorIndex, queryEmbedding, gameId, {
      limit: candidateCount,
      type: 'content',
      fragmentType: options.fragmentType,
    }),

    // B. Question vector search (search synthetic questions - HyDE)
    searchVectorize(vectorIndex, queryEmbedding, gameId, {
      limit: Math.floor(candidateCount / 2), // Fewer questions
      type: 'question',
    }),

    // C. Full-text search via D1 FTS5
    db
      .prepare(`
        SELECT
          fts.id,
          fts.rank
        FROM fragments_fts fts
        JOIN fragments f ON f.id = fts.id
        WHERE fts.content MATCH ? AND f.game_id = ?
        ${options.fragmentType ? `AND f.type = ?` : ''}
        ORDER BY fts.rank
        LIMIT ?
      `)
      .bind(
        prepareSearchQuery(userQuery),
        gameId,
        ...(options.fragmentType ? [options.fragmentType] : []),
        candidateCount
      )
      .all<{ id: string; rank: number }>()
  ]);

  console.log(`[Search] Parallel searches completed in ${Date.now() - searchStart}ms`);

  // Handle search failures gracefully - use whatever results we got
  const contentMatches = contentResults.status === 'fulfilled' ? contentResults.value : [];
  const questionMatches = questionResults.status === 'fulfilled' ? questionResults.value : [];
  const ftsMatches = ftsResults.status === 'fulfilled' && ftsResults.value.results
    ? ftsResults.value.results
    : [];

  console.log(`[Search] Found ${contentMatches.length} content, ${questionMatches.length} question, ${ftsMatches.length} FTS matches`);

  // Log failures for monitoring
  if (contentResults.status === 'rejected') {
    console.error('Content vector search failed:', contentResults.reason);
  }
  if (questionResults.status === 'rejected') {
    console.error('Question vector search failed:', questionResults.reason);
  }
  if (ftsResults.status === 'rejected') {
    console.error('FTS search failed:', ftsResults.reason);
  }

  // Step 3: Reciprocal Rank Fusion (RRF)
  const rrfK = 50;
  const contentWeight = 1.0;
  const questionWeight = 0.7; // Questions slightly less weight (they're indirect matches)
  const ftsWeight = 1.0;

  // Build rank maps
  const contentRanks = new Map(
    contentMatches.map((r, index) => [r.fragmentId, index])
  );
  const questionRanks = new Map(
    questionMatches.map((r, index) => [r.fragmentId, index])
  );
  const ftsRanks = new Map(
    ftsMatches.map((r, index) => [r.id, index])
  );

  // Get all unique fragment IDs
  const allFragmentIds = new Set([
    ...contentMatches.map(r => r.fragmentId),
    ...questionMatches.map(r => r.fragmentId),
    ...ftsMatches.map((r) => r.id)
  ]);

  // Calculate RRF scores
  const rrfScores: Array<{ fragmentId: string; score: number }> = [];
  for (const fragmentId of allFragmentIds) {
    const contentRank = contentRanks.get(fragmentId);
    const questionRank = questionRanks.get(fragmentId);
    const ftsRank = ftsRanks.get(fragmentId);

    const contentScore = contentRank !== undefined
      ? contentWeight / (rrfK + contentRank)
      : 0;
    const questionScore = questionRank !== undefined
      ? questionWeight / (rrfK + questionRank)
      : 0;
    const ftsScore = ftsRank !== undefined
      ? ftsWeight / (rrfK + ftsRank)
      : 0;

    rrfScores.push({
      fragmentId,
      score: contentScore + questionScore + ftsScore
    });
  }

  // Sort by RRF score and take top candidates for diversification
  rrfScores.sort((a, b) => b.score - a.score);
  const candidateIds = rrfScores
    .slice(0, (limit + offset) * 3) // Get 3x candidates for diversification
    .map(r => r.fragmentId);

  if (candidateIds.length === 0) {
    return [];
  }

  // Step 4: Fetch fragment data for candidates
  const dbStart = Date.now();
  const orm = getDb(db);

  // Determine if we need searchableContent (only for reranking)
  const enableReranking = options.enableReranking ?? true;

  const selectFields: any = {
    fragmentId: fragments.id,
    resourceId: resources.id,
    resourceName: resources.name,
    content: fragments.content,
    pageNumber: fragments.pageNumber,
    section: fragments.section,
    images: fragments.images,
  };

  // Only fetch searchableContent if reranking is enabled
  if (enableReranking) {
    selectFields.searchableContent = fragments.searchableContent;
  }

  type FragmentData = {
    fragmentId: string;
    resourceId: string;
    resourceName: string;
    content: string;
    pageNumber: number | null;
    section: string | null;
    images: string | null;
    searchableContent?: string | null;
  };

  const fragmentData = await orm
    .select(selectFields)
    .from(fragments)
    .innerJoin(resources, eq(fragments.resourceId, resources.id))
    .where(inArray(fragments.id, candidateIds))
    .all() as unknown as FragmentData[];

  console.log(`[Search] Fetched ${fragmentData.length} fragments from DB in ${Date.now() - dbStart}ms`);

  // Create fragment map and re-sort by RRF score
  const fragmentMap = new Map(fragmentData.map(f => [f.fragmentId, f]));

  const candidatesWithData = candidateIds
    .map(id => fragmentMap.get(id))
    .filter((f): f is NonNullable<typeof f> => f !== undefined);

  // Step 5: Cross-encoder reranking (optional, enabled by default)
  let rerankedCandidates;
  if (enableReranking) {
    const rerankStart = Date.now();
    console.log(`[Search] Reranking ${candidatesWithData.length} candidates...`);
    rerankedCandidates = await rerankWithCrossEncoder(userQuery, candidatesWithData, openaiApiKey, options.environment);
    console.log(`[Search] Reranking completed in ${Date.now() - rerankStart}ms`);
  } else {
    console.log(`[Search] Reranking disabled, using RRF scores`);
    rerankedCandidates = candidatesWithData;
  }

  // Step 6: Diversify to avoid redundancy
  const diversified = diversifyResults(rerankedCandidates, {
    maxPerPage: 2,
    maxPerResource: Math.ceil(limit * 0.6),
  });

  // Apply pagination
  const sorted = diversified.slice(offset, offset + limit);

  console.log(`[Search] Total search time: ${Date.now() - startTime}ms, returning ${sorted.length} results`);

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
