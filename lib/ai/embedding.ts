import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { db } from "../db";
import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import { embeddings } from "../db/schema/embeddings";
import { resources } from "../db/schema";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
  chunkSize: 1000,
  chunkOverlap: 0,
});

const embeddingModel = openai.embedding("text-embedding-3-small");

const generateChunks = async (input: string): Promise<string[]> => {
  const output = await splitter.createDocuments([input]);
  return output.map((i) => i.pageContent);
  // return input
  //   .trim()
  //   .split("\n")
  //   .filter((i) => i !== "");
};

export const generateEmbeddings = async (
  value: string
): Promise<Array<{ embedding: number[]; content: string }>> => {
  const chunks = await generateChunks(value);
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: chunks,
  });
  return embeddings.map((e, i) => ({ content: chunks[i], embedding: e }));
};

export const generateEmbedding = async (value: string): Promise<number[]> => {
  const input = value.replaceAll("\\n", " ");
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });
  return embedding;
};

export const findRelevantContent = async (
  gameId: string,
  userQuery: string
) => {
  const userQueryEmbedded = await generateEmbedding(userQuery);
  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    userQueryEmbedded
  )})`;
  const similarGuides = await db
    .select({
      content: embeddings.content,
      similarity,
      resourceName: resources.name,
      resourceId: resources.id,
    })
    .from(embeddings)
    .innerJoin(resources, eq(embeddings.resourceId, resources.id))
    .where(and(gt(similarity, 0.5), eq(resources.gameId, gameId)))
    .orderBy((t) => desc(t.similarity))
    .limit(6);
  return similarGuides;
};
