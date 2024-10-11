import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { db } from "../db";
import { innerProduct, sql } from "drizzle-orm";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { fragments, resources } from "../db/schema";

const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
  chunkSize: 1000,
  chunkOverlap: 0,
});

const embeddingModel = openai.embedding("text-embedding-3-small");

export const CURRENT_INDEX_VERSION: number = 2;

const generateChunks = async (input: string): Promise<[string[], number]> => {
  const output = await splitter.createDocuments([input]);
  return [output.map((i) => i.pageContent), CURRENT_INDEX_VERSION];
  // return input
  //   .trim()
  //   .split("\n")
  //   .filter((i) => i !== "");
};

export const generateEmbeddings = async (
  value: string
): Promise<[{ embedding: number[]; content: string }[], number]> => {
  const [chunks, version] = await generateChunks(value);
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: chunks,
  });
  return [
    embeddings.map((e, i) => ({
      content: chunks[i],
      embedding: e,
    })),
    version,
  ];
};

export const generateEmbedding = async (
  value: string
): Promise<[number[], number]> => {
  const input = value.replaceAll("\\n", " ");
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });
  return [embedding, CURRENT_INDEX_VERSION];
};

export const findRelevantContent = async (
  gameId: string,
  userQuery: string
): Promise<{ resourceId: string; resourceName: string; content: string }[]> => {
  const [userQueryEmbedding] = await generateEmbedding(userQuery);

  const matchCount = 10;
  const rrfK = 50; // we might put this into schema later, so just placeholder
  const fullTextWeight = 1;
  const semanticWeight = 1;

  const matchingContent = await db.execute<{
    resource_id: string;
    resource_name: string;
    content: string;
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
      limit ${matchCount} * 2
    ),
    semantic as (
      select
        ${fragments.id},
        row_number() over (order by ${innerProduct(
          fragments.embedding,
          userQueryEmbedding
        )}) as rank_ix
      from
        ${fragments}
      where
        ${fragments.gameId} = ${gameId}
      order by rank_ix
      limit ${matchCount} * 2
    )
    select
      ${resources.id} as resource_id,
      ${resources.name} as resource_name,
      ${fragments.content}
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
    limit ${matchCount}
  `);

  return matchingContent.rows.map((i) => ({
    resourceId: i.resource_id,
    resourceName: i.resource_name,
    content: i.content,
  }));
};
