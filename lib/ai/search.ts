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
  const [userQueryEmbedding] = await generateEmbedding(userQuery);

  const limit = options?.limit ?? 10;
  const offset = options?.offset ?? 0;
  // Fetch enough candidates for RRF fusion (need more than limit+offset since fusion reduces results)
  const candidateCount = (limit + offset) * 2;
  const rrfK = 50; // we might put this into schema later, so just placeholder
  const fullTextWeight = 1;
  const semanticWeight = 1;

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
        }, websearch_to_tsquery(${userQuery})) desc) as rank_ix
      from
      ${fragments}
      where
        ${fragments.searchVector} @@ websearch_to_tsquery(${userQuery})
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

  return matchingContent.rows.map((i) => ({
    resourceId: i.resource_id,
    resourceName: i.resource_name,
    content: i.content,
    pageNumber: i.page_number ?? undefined,
    section: i.section ?? undefined,
    images: i.images ?? undefined,
  }));
};
