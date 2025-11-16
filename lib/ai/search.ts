import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { fragments, resources, embeddings, type Fragment, type Embedding } from '../db/schema';
import { generateEmbedding } from './embeddings';
import { getModel } from '../config/models';
import { ANSWER_TYPES, type AnswerType } from '../services/answer-type-classification';

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
    description?: string;
    detectedType?: string;
    ocrText?: string | null;
    isRelevant?: boolean;
  }>;
  searchableContent?: string | null;
}

/**
 * Detect question types from user query using LLM classification
 * Returns array of answer types that match the query intent
 *
 * Uses same classification approach as fragment classification for consistency
 */
async function detectQueryAnswerTypes(
  query: string,
  openaiApiKey: string,
  environment?: string
): Promise<AnswerType[]> {
  const model = getModel('classification', environment);

  const prompt = `Analyze this board game question and classify what types of answers it needs.

Question: ${query}

Available answer type categories:

**Metadata:**
- player_count: Number of players supported
- play_time: How long the game takes
- age_rating: Recommended age
- game_overview: High-level game description
- publisher_info: Publisher, designer, edition info

**Rules:**
- setup_instructions: How to set up the game
- turn_structure: How turns work
- win_conditions: How to win
- end_game: When/how the game ends
- scoring: How points are calculated

**Components:**
- component_list: What pieces are included
- card_types: Types of cards in the game
- resource_types: Types of resources/tokens
- board_layout: Board setup and areas
- token_types: Types of tokens/markers

**Gameplay:**
- action_options: Actions players can take
- combat_rules: How combat/conflict works
- movement_rules: How to move pieces
- trading_rules: How trading/exchange works
- special_abilities: Special powers or abilities

**Clarifications:**
- edge_case: Unusual situations
- example: Example of gameplay
- faq: Frequently asked question
- timing: When something happens
- rule_clarification: Clarifying a specific rule

Select 1-3 answer types that best match what this question is asking for.
Be specific and conservative - only select types that clearly match the question intent.

Return ONLY a JSON object with an "answerTypes" array, nothing else.
Format: { "answerTypes": ["type1", "type2", ...] }`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 1, // GPT-5 requires temperature 1
        max_completion_tokens: 100,
      }),
    });

    if (!response.ok) {
      console.error('Query type detection API error:', response.status, response.statusText);
      return []; // Fail gracefully
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content;

    if (!content || content.trim() === '') {
      console.warn('Empty response from query type detection');
      return [];
    }

    const result = JSON.parse(content);

    if (!Array.isArray(result.answerTypes)) {
      return [];
    }

    // Filter to only valid answer types
    const detectedTypes = result.answerTypes.filter((type: unknown): type is AnswerType =>
      typeof type === 'string' && ANSWER_TYPES.includes(type as AnswerType)
    );

    console.log(`[Search] Detected query types for "${query.slice(0, 50)}...": ${detectedTypes.join(', ')}`);

    return detectedTypes;
  } catch (error) {
    console.error('Error detecting query type:', error);
    return []; // Fail gracefully
  }
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
            temperature: 1,
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
 * Convert natural language query to PostgreSQL tsquery syntax
 * Similar to FTS5 but using PostgreSQL websearch_to_tsquery
 */
function prepareSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return '';
  }

  // PostgreSQL websearch_to_tsquery is more forgiving than FTS5
  // It handles quotes, AND, OR, and - (NOT) operators naturally
  return trimmed;
}

/**
 * Search embeddings table for similar vectors (content or question embeddings)
 */
async function searchVectorEmbeddings(
  queryVector: number[],
  gameId: string,
  options: {
    limit?: number;
    type?: 'content' | 'question';     // Filter by embedding type
    fragmentType?: 'text' | 'image';   // Filter by fragment type
    resourceId?: string;                // Filter by resource
  } = {}
): Promise<Array<{ fragmentId: string; score: number }>> {
  const limit = options.limit ?? 20;

  // Build WHERE conditions
  const conditions = [eq(embeddings.gameId, gameId)];

  if (options.type) {
    conditions.push(eq(embeddings.type, options.type));
  }

  if (options.fragmentType) {
    conditions.push(eq(embeddings.fragmentType, options.fragmentType));
  }

  if (options.resourceId) {
    conditions.push(eq(embeddings.resourceId, options.resourceId));
  }

  // Perform vector similarity search using inner product (<#>)
  // OpenAI embeddings are normalized, so inner product = cosine similarity
  const results = await db
    .select({
      fragmentId: embeddings.fragmentId,
      score: sql<number>`1 - (${embeddings.embedding} <#> ${JSON.stringify(queryVector)}::vector)`,
    })
    .from(embeddings)
    .where(sql.join(conditions, sql` AND `))
    .orderBy(sql`${embeddings.embedding} <#> ${JSON.stringify(queryVector)}::vector`)
    .limit(limit);

  return results;
}

/**
 * Perform advanced hybrid search with cross-encoder reranking:
 * 1. Content vector search (embeddings table with type='content')
 * 2. Question vector search (embeddings table with type='question' - HyDE)
 * 3. Full-text search (PostgreSQL tsvector)
 * 4. Reciprocal Rank Fusion (RRF) to merge results
 * 5. Cross-encoder reranking with LLM (optional, enabled by default)
 * 6. Result diversification to avoid redundancy
 */
export async function findRelevantContent(
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
    enableFullTextSearch?: boolean;    // Enable FTS component of hybrid search (default: true)
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

  const enableFTS = options.enableFullTextSearch ?? true;
  console.log(`[Search] Starting search for "${userQuery.slice(0, 50)}..." (limit=${limit}, enableReranking=${options.enableReranking ?? true}, enableFTS=${enableFTS})`);

  // Step 1: Generate embedding for user query and detect query types in parallel
  const embeddingStart = Date.now();
  const [[queryEmbedding], queryTypes] = await Promise.all([
    generateEmbedding(userQuery, openaiApiKey),
    detectQueryAnswerTypes(userQuery, openaiApiKey, options.environment)
  ]);
  console.log(`[Search] Embedding generated in ${Date.now() - embeddingStart}ms`);

  // Step 2: Execute searches in parallel with graceful degradation
  const searchStart = Date.now();

  const searches: Promise<any>[] = [
    // A. Content vector search (search fragment content embeddings)
    searchVectorEmbeddings(queryEmbedding, gameId, {
      limit: candidateCount,
      type: 'content',
      fragmentType: options.fragmentType,
    }),

    // B. Question vector search (search synthetic question embeddings - HyDE)
    searchVectorEmbeddings(queryEmbedding, gameId, {
      limit: Math.floor(candidateCount / 2), // Fewer questions
      type: 'question',
    }),
  ];

  // C. Full-text search via PostgreSQL tsvector (optional)
  if (enableFTS) {
    const ftsQuery = prepareSearchQuery(userQuery);

    // Build FTS where conditions
    const ftsConditions = [
      sql`${fragments.gameId} = ${gameId}`,
      sql`${fragments.searchVector} @@ websearch_to_tsquery('english', ${ftsQuery})`
    ];

    if (options.fragmentType) {
      ftsConditions.push(eq(fragments.type, options.fragmentType));
    }

    searches.push(
      db
        .select({
          id: fragments.id,
          rank: sql<number>`ts_rank_cd(${fragments.searchVector}, websearch_to_tsquery('english', ${ftsQuery}))`,
        })
        .from(fragments)
        .where(sql.join(ftsConditions, sql` AND `))
        .orderBy(sql`ts_rank_cd(${fragments.searchVector}, websearch_to_tsquery('english', ${ftsQuery})) DESC`)
        .limit(candidateCount)
    );
  }

  const results = await Promise.allSettled(searches);
  const [contentResults, questionResults, ftsResults] = [
    results[0],
    results[1],
    enableFTS ? results[2] : { status: 'fulfilled' as const, value: [] }
  ];

  console.log(`[Search] Parallel searches completed in ${Date.now() - searchStart}ms`);

  // Handle search failures gracefully - use whatever results we got
  const contentMatches = contentResults.status === 'fulfilled' ? contentResults.value : [];
  const questionMatches = questionResults.status === 'fulfilled' ? questionResults.value : [];
  const ftsMatches = ftsResults.status === 'fulfilled' ? ftsResults.value : [];

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
  const contentRanks = new Map<string, number>(
    contentMatches.map((r: any, index: number) => [r.fragmentId, index])
  );
  const questionRanks = new Map<string, number>(
    questionMatches.map((r: any, index: number) => [r.fragmentId, index])
  );
  const ftsRanks = new Map<string, number>(
    ftsMatches.map((r: any, index: number) => [r.id, index])
  );

  // Get all unique fragment IDs
  const allFragmentIds = new Set([
    ...contentMatches.map((r: any) => r.fragmentId),
    ...questionMatches.map((r: any) => r.fragmentId),
    ...ftsMatches.map((r: any) => r.id)
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

  // Determine if we need searchableContent (only for reranking)
  const enableReranking = options.enableReranking ?? true;

  type FragmentData = {
    fragmentId: string;
    resourceId: string;
    resourceName: string;
    content: string;
    pageNumber: number | null;
    section: string | null;
    images: any;
    answerTypes: any;
    searchableContent?: string | null;
  };

  const selectFields: Record<string, any> = {
    fragmentId: fragments.id,
    resourceId: resources.id,
    resourceName: resources.name,
    content: fragments.content,
    pageNumber: fragments.pageNumber,
    section: fragments.section,
    images: fragments.images,
    answerTypes: fragments.answerTypes,
  };

  selectFields.searchableContent = fragments.searchableContent;

  const fragmentData = await db
    .select(selectFields)
    .from(fragments)
    .innerJoin(resources, eq(fragments.resourceId, resources.id))
    .where(inArray(fragments.id, candidateIds)) as FragmentData[];

  console.log(`[Search] Fetched ${fragmentData.length} fragments from DB in ${Date.now() - dbStart}ms`);

  // Apply answer type boosting to RRF scores
  if (queryTypes.length > 0) {
    let boostCount = 0;
    for (const fragment of fragmentData) {
      if (fragment.answerTypes) {
        try {
          const fragmentAnswerTypes: AnswerType[] = JSON.parse(fragment.answerTypes);
          const hasMatch = queryTypes.some(qt => fragmentAnswerTypes.includes(qt));

          if (hasMatch) {
            const currentScore = rrfScores.find(s => s.fragmentId === fragment.fragmentId);
            if (currentScore) {
              currentScore.score *= 1.3; // 30% boost for matching answer types
              boostCount++;
            }
          }
        } catch (error) {
          // Ignore parsing errors, fragment just won't get boost
        }
      }
    }
    console.log(`[Search] Boosted ${boostCount} fragments matching query types: ${queryTypes.join(', ')}`);
  }

  // Re-sort by boosted RRF scores and get top candidates
  rrfScores.sort((a, b) => b.score - a.score);
  const rankedCandidateIds = rrfScores
    .slice(0, (limit + offset) * 3) // Get 3x candidates for diversification
    .map(r => r.fragmentId);

  // Create fragment map and filter to ranked candidates
  const fragmentMap = new Map(fragmentData.map(f => [f.fragmentId, f]));

  const candidatesWithData = rankedCandidateIds
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

  // Return results (images already parsed as JSON from database)
  return sorted.map(f => ({
    resourceId: f.resourceId,
    resourceName: f.resourceName,
    content: f.content,
    pageNumber: f.pageNumber ?? undefined,
    section: f.section ?? undefined,
    images: f.images ?? undefined,
    searchableContent: f.searchableContent ?? undefined,
  }));
}
