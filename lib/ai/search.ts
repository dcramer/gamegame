import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { db } from "../db";
import { innerProduct, sql } from "drizzle-orm";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { fragments, resources } from "../db/schema";
import type { StructuredPDFContent, PDFChunk } from "../types/pdf";
import { chunkStructuredPDF } from "../services/chunking";
import { withRetry } from "../retry";

const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
  chunkSize: 1000,
  chunkOverlap: 100, // Match structured chunking for consistency
});

const embeddingModel = openai.embedding("text-embedding-3-small");

export const CURRENT_INDEX_VERSION: number = 3; // Bumped for new metadata

/**
 * Generate chunks from plain text (fallback for non-structured content)
 */
const generateChunks = async (input: string): Promise<[string[], number]> => {
  const output = await splitter.createDocuments([input]);
  return [output.map((i) => i.pageContent), CURRENT_INDEX_VERSION];
};

/**
 * Generate embeddings with metadata preservation
 * @param value Plain text content
 * @param structured Optional structured PDF content with metadata
 * @returns Array of embeddings with metadata and version number
 */
export const generateEmbeddings = async (
  value: string,
  structured?: StructuredPDFContent
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
> => {
  let chunks: PDFChunk[];
  let version: number;

  if (structured) {
    // Use smart chunking with metadata preservation
    chunks = await chunkStructuredPDF(structured);
    version = CURRENT_INDEX_VERSION;
  } else {
    // Fallback to simple text chunking
    const [textChunks, v] = await generateChunks(value);
    version = v;
    chunks = textChunks.map((content): PDFChunk => ({
      content,
      pageNumber: 1, // Default to page 1 for unstructured content
      images: [],
    }));
  }

  // Filter out empty chunks before embedding
  const validChunks = chunks.filter((c) => c.content.trim().length > 0);

  if (validChunks.length === 0) {
    throw new Error("No valid content to embed after filtering empty chunks");
  }

  // Generate embeddings for all chunks
  const { embeddings } = await withRetry(
    () =>
      embedMany({
        model: embeddingModel,
        values: validChunks.map((c) => c.content),
      }),
    {
      operationName: "openai-embedMany",
      maxRetries: 3,
      initialDelay: 1000,
    }
  );

  // Verify embeddings match chunks (defensive check)
  if (embeddings.length !== validChunks.length) {
    throw new Error(
      `Embedding count mismatch: expected ${validChunks.length} embeddings, got ${embeddings.length}`
    );
  }

  // Validate embedding dimensions (must be 1536 for text-embedding-3-small)
  const expectedDimensions = 1536;
  embeddings.forEach((embedding, index) => {
    if (embedding.length !== expectedDimensions) {
      throw new Error(
        `Embedding dimension mismatch at index ${index}: expected ${expectedDimensions} dimensions, got ${embedding.length}`
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
    version,
  ];
};

export const generateEmbedding = async (
  value: string
): Promise<[number[], number]> => {
  const input = value.replaceAll("\n", " ");
  const { embedding } = await withRetry(
    () =>
      embed({
        model: embeddingModel,
        value: input,
      }),
    {
      operationName: "openai-embed",
      maxRetries: 3,
      initialDelay: 1000,
    }
  );

  // Validate embedding dimensions (must be 1536 for text-embedding-3-small)
  const expectedDimensions = 1536;
  if (embedding.length !== expectedDimensions) {
    throw new Error(
      `Embedding dimension mismatch: expected ${expectedDimensions} dimensions, got ${embedding.length}`
    );
  }

  return [embedding, CURRENT_INDEX_VERSION];
};

/**
 * Convert a natural language query into a PostgreSQL tsquery with OR logic
 * This is more forgiving than websearch_to_tsquery which uses strict AND logic
 */
const createSearchQuery = (query: string): string => {
  // Remove common English stop words that don't help with search
  const stopWords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
    "to", "was", "will", "with", "how", "what", "when", "where", "who",
    "why", "can", "do", "does", "did", "i", "you", "me", "my"
  ]);

  // Extract words, convert to lowercase, filter stop words
  const words = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Replace punctuation with spaces
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10); // Limit to 10 keywords to avoid overly complex queries

  if (words.length === 0) {
    // If no keywords found, extract ANY words (even short ones/stop words)
    // as a fallback to avoid empty queries
    const fallbackWords = query
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 0)
      .slice(0, 10);

    if (fallbackWords.length === 0) {
      // If still no words, return a query that matches nothing but won't error
      return "zzzzzzzzz";
    }

    return fallbackWords.join(" | ");
  }

  // Join with OR operator for more flexible matching
  return words.join(" | ");
};

export const findRelevantContent = async (
  gameId: string,
  userQuery: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<
  Array<{
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
  }>
> => {
  const searchStartTime = performance.now();

  // Generate embedding for user query
  const embeddingStartTime = performance.now();
  const [userQueryEmbedding] = await generateEmbedding(userQuery);
  const embeddingDuration = performance.now() - embeddingStartTime;
  console.log(`[PERF] Embedding generation took ${embeddingDuration.toFixed(2)}ms`);

  const limit = options?.limit ?? 10;
  const offset = options?.offset ?? 0;
  // Fetch enough candidates for RRF fusion (need more than limit+offset since fusion reduces results)
  const candidateCount = (limit + offset) * 2;
  const rrfK = 50; // we might put this into schema later, so just placeholder
  const fullTextWeight = 1;
  const semanticWeight = 1;

  // Create search query with OR logic for better recall
  const searchQuery = createSearchQuery(userQuery);
  console.log(`[DEBUG] Search query: "${userQuery}" -> tsquery: "${searchQuery}"`);

  // Execute hybrid search query
  const queryStartTime = performance.now();
  const matchingContent = await db.execute<{
    resource_id: string;
    resource_name: string;
    content: string;
    page_number: number | null;
    section: string | null;
    images: Array<{
      id: string;
      url: string;
      bbox?: number[];
      caption?: string;
    }> | null;
  }>(sql`
    with full_text as (
      select
        ${fragments.id},
        -- Note: ts_rank_cd is not indexable but will only rank matches of the where clause
        -- which shouldn't be too big
        row_number() over(order by ts_rank_cd(${
          fragments.searchVector
        }, to_tsquery('english', ${searchQuery})) desc) as rank_ix
      from
      ${fragments}
      where
        ${fragments.searchVector} @@ to_tsquery('english', ${searchQuery})
        and ${fragments.gameId} = ${gameId}
      order by rank_ix
      limit ${candidateCount}
    ),
    semantic as (
      select
        ${fragments.id},
        row_number() over (order by ${innerProduct(
          fragments.embedding,
          userQueryEmbedding
        )} desc) as rank_ix
      from
        ${fragments}
      where
        ${fragments.gameId} = ${gameId}
      order by rank_ix
      limit ${candidateCount}
    )
    select
      ${resources.id} as resource_id,
      ${resources.name} as resource_name,
      ${fragments.content},
      ${fragments.pageNumber} as page_number,
      ${fragments.section},
      ${fragments.images}
    from
      full_text
      full outer join semantic
        on full_text.id = semantic.id
      join ${fragments}
        on coalesce(full_text.id, semantic.id) = ${fragments.id}
      join ${resources}
        on ${fragments.resourceId} = ${resources.id}
    order by
      coalesce(1.0 / (${rrfK} + full_text.rank_ix), 0.0) * ${fullTextWeight} +
      coalesce(1.0 / (${rrfK} + semantic.rank_ix), 0.0) * ${semanticWeight}
      desc
    limit ${limit}
    offset ${offset}
  `);
  const queryDuration = performance.now() - queryStartTime;
  console.log(`[PERF] Database query took ${queryDuration.toFixed(2)}ms`);

  const totalDuration = performance.now() - searchStartTime;
  console.log(`[PERF] Total search took ${totalDuration.toFixed(2)}ms (embedding: ${embeddingDuration.toFixed(2)}ms, query: ${queryDuration.toFixed(2)}ms)`);

  return matchingContent.rows.map((i) => ({
    resourceId: i.resource_id,
    resourceName: i.resource_name,
    content: i.content,
    pageNumber: i.page_number ?? undefined,
    section: i.section ?? undefined,
    images: i.images ?? undefined,
  }));
};
