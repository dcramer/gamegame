import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
  chunkSize: 1000,
  chunkOverlap: 0,
});

const embeddingModel = openai.embedding("text-embedding-3-small");

export const CURRENT_EMBEDDING_VERSION: number = 1;

const generateChunks = async (input: string): Promise<[string[], number]> => {
  const output = await splitter.createDocuments([input]);
  return [output.map((i) => i.pageContent), CURRENT_EMBEDDING_VERSION];
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
  return [embedding, CURRENT_EMBEDDING_VERSION];
};

export const findRelevantContent = async (
  gameId: string,
  userQuery: string
) => {
  const userQueryEmbedded = await generateEmbedding(userQuery);

  const matchingContent = await db.execute(sql`
    SELECT * FROM hybrid_search(
      ${gameId},
      ${userQuery},
      ${userQueryEmbedded[0]},
      10
    )
  `);

  // const similarity = sql<number>`1 - (${cosineDistance(
  //   embeddings.embedding,
  //   userQueryEmbedded[0]
  // )})`;
  // const matchingContent = await db
  //   .select({
  //     content: embeddings.content,
  //     similarity,
  //     resourceName: resources.name,
  //     resourceId: resources.id,
  //   })
  //   .from(embeddings)
  //   .innerJoin(resources, eq(embeddings.resourceId, resources.id))
  //   .where(and(gt(similarity, 0.5), eq(resources.gameId, gameId)))
  //   .orderBy((t) => desc(t.similarity))
  //   .limit(4);
  console.log({ userQuery, matchingContent });

  return matchingContent;
};
