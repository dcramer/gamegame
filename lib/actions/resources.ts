"use server";

import { auth } from "@/auth";
import { generateEmbeddings } from "../ai/embedding";
import { db } from "../db";
import {
  embeddings,
  embeddings as embeddingsTable,
} from "../db/schema/embeddings";
import { insertResourceSchema, resources } from "../db/schema/resources";
import mime from "mime";
import { asc, eq, sql } from "drizzle-orm";
import { extractTextFromPdf_Marker, extractTextFromPdf_Pdfjs } from "../pdf";
import { env } from "../env.mjs";

const extractTextFromPdf = async (
  buf: Buffer,
  pdfExtractor = env.DEFAULT_PDF_EXTRACTOR
) => {
  switch (pdfExtractor) {
    case "pdfjs":
      return await extractTextFromPdf_Pdfjs(buf);
    case "marker":
      return await extractTextFromPdf_Marker(buf);
    default:
      throw new Error("Unsupported pdf extractor");
  }
};

export const createResource = async (input: {
  id?: string;
  gameId: string;
  name: string;
  url: string;
}) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const mimeType = mime.getType(input.name);

  const response = await fetch(input.url);
  const content = Buffer.from(await response.arrayBuffer());

  let newContent: string;
  switch (mimeType) {
    case "application/pdf":
      newContent = await extractTextFromPdf(content);
      break;
    default:
      throw new Error("Unsupported mime type");
  }

  const { id, name, url, gameId } = insertResourceSchema.parse({
    ...input,
    content: newContent,
  });

  const resource = await db.transaction(async (tx) => {
    const [resource] = await tx
      .insert(resources)
      .values({ id, name, url, gameId, content: newContent })
      .returning();

    const embeddings = await generateEmbeddings(newContent);
    if (!embeddings.length) {
      throw new Error("Failed to generate embeddings");
    }

    await tx.insert(embeddingsTable).values(
      embeddings.map((embedding) => ({
        gameId: resource.gameId,
        resourceId: resource.id,
        ...embedding,
      }))
    );

    return resource;
  });

  return {
    id: resource.id,
    name: resource.name,
    url: resource.url,
    hasContent: true,
  };
};

export const getResource = async (resourceId: string) => {
  const [resource] = await db
    .select({
      id: resources.id,
      name: resources.name,
      url: resources.url,
      content: resources.content,
    })
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);

  if (!resource) {
    throw new Error("Resource not found");
  }

  const [{ count: embeddingCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(embeddings)
    .where(eq(embeddings.resourceId, resource.id))
    .limit(1);

  return {
    ...resource,
    embeddingCount,
  };
};

export const getAllResourcesForGame = async (gameId: string) => {
  return await db
    .select({
      id: resources.id,
      name: resources.name,
      url: resources.url,
      hasContent: sql<boolean>`${resources.content} != '' AND ${resources.content} is not null`,
    })
    .from(resources)
    .where(eq(resources.gameId, gameId))
    .orderBy(asc(resources.name));
};

export const updateResource = async (
  resourceId: string,
  input: {
    name?: string;
    // url?: string;
  }
) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const [resource] = await db
    .select({
      id: resources.id,
      name: resources.name,
      url: resources.url,
      hasContent: sql<boolean>`${resources.content} != '' AND ${resources.content} is not null`,
    })
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);
  if (!resource) {
    throw new Error("Resource not found");
  }

  await db.update(resources).set(input).where(eq(resources.id, resourceId));

  return resource;
};

export const deleteResource = async (resourceId: string) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  await db.delete(resources).where(eq(resources.id, resourceId));

  return {};
};

export const reprocessResource = async (
  resourceId: string,
  pdfExtractor = env.DEFAULT_PDF_EXTRACTOR
) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const [resource] = await db
    .select()
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);
  if (!resource) {
    throw new Error("Resource not found");
  }

  const mimeType = mime.getType(resource.name);

  const response = await fetch(resource.url);
  const content = Buffer.from(await response.arrayBuffer());

  let newContent: string;
  switch (mimeType) {
    case "application/pdf":
      newContent = await extractTextFromPdf(content, pdfExtractor);
      break;
    default:
      throw new Error("Unsupported mime type");
  }

  const newResource = await db.transaction(async (tx) => {
    const [newResource] = await tx
      .update(resources)
      .set({ content: newContent })
      .where(eq(resources.id, resourceId))
      .returning();

    const embeddings = await generateEmbeddings(newContent);
    if (!embeddings.length) {
      throw new Error("Failed to generate embeddings");
    }
    await tx
      .delete(embeddingsTable)
      .where(eq(embeddingsTable.resourceId, resource.id));
    await tx.insert(embeddingsTable).values(
      embeddings.map((embedding) => ({
        gameId: resource.gameId,
        resourceId: resource.id,
        ...embedding,
      }))
    );

    return newResource;
  });

  return {
    id: newResource.id,
    name: newResource.name,
    url: newResource.url,
    hasContent: true,
  };
};
