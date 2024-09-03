"use server";

import { generateEmbeddings } from "../ai/embedding";
import { db } from "../db";
import { embeddings as embeddingsTable } from "../db/schema/embeddings";
import {
  insertResourceSchema,
  NewResourceParams,
  resources,
} from "../db/schema/resources";

export const createResource = async (input: NewResourceParams) => {
  try {
    const { name, content, gameId } = insertResourceSchema.parse(input);

    const [resource] = await db
      .insert(resources)
      .values({ name, content, gameId })
      .returning();

    const embeddings = await generateEmbeddings(content);
    await db.insert(embeddingsTable).values(
      embeddings.map((embedding) => ({
        gameId: resource.gameId,
        resourceId: resource.id,
        ...embedding,
      }))
    );

    return "Resource successfully created and embedded.";
  } catch (error) {
    return error instanceof Error && error.message.length > 0
      ? error.message
      : "Error, please try again.";
  }
};
