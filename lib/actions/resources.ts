"use server";

import { auth } from "@/auth";
import { generateEmbeddings } from "../ai/search";
import { db } from "../db";
import { fragments as fragmentsTable } from "../db/schema/fragments";
import { insertResourceSchema, resources } from "../db/schema/resources";
import mime from "mime";
import { asc, eq, sql } from "drizzle-orm";
import { extractTextFromPdf_Marker, extractTextFromPdf_Pdfjs } from "../pdf";
import { env } from "@/lib/env.mjs";

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

  const parsedInput = insertResourceSchema.parse({
    ...input,
    version: 0,
    content: newContent,
  });

  const resource = await db.transaction(async (tx) => {
    const [embeddings, version] = await generateEmbeddings(newContent);
    if (!embeddings.length) {
      throw new Error("Failed to generate embeddings");
    }

    const [resource] = await tx
      .insert(resources)
      .values({
        ...parsedInput,
        version,
      })
      .returning();

    // dont batch this to avoid timeouts
    for (const embedding of embeddings) {
      await tx.insert(fragmentsTable).values({
        gameId: resource.gameId,
        resourceId: resource.id,
        ...embedding,
        version,
      });
    }
    // await tx.insert(fragmentsTable).values(
    //   embeddings.map((embedding) => ({
    //     gameId: resource.gameId,
    //     resourceId: resource.id,
    //     ...embedding,
    //   }))
    // );

    return resource;
  });

  return {
    id: resource.id,
    name: resource.name,
    url: resource.url,
    version: resource.version,
    hasContent: true,
  };
};

export async function getResource(
  resourceId: string,
  withContent: true
): Promise<{
  id: string;
  name: string;
  url: string;
  version: number;
  content: string;
  embeddingCount: number;
}>;
export async function getResource(
  resourceId: string,
  withContent?: false | undefined
): Promise<{
  id: string;
  name: string;
  url: string;
  version: number;
  embeddingCount: number;
}>;
export async function getResource(resourceId: string, withContent = false) {
  const [resource] = await db
    .select({
      id: resources.id,
      name: resources.name,
      url: resources.url,
      version: resources.version,
      ...(withContent ? { content: resources.content } : {}),
    })
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);

  if (!resource) {
    throw new Error("Resource not found");
  }

  const [{ count: embeddingCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(fragmentsTable)
    .where(eq(fragmentsTable.resourceId, resource.id))
    .limit(1);

  return {
    ...resource,
    embeddingCount,
  };
}

export const getAllResourcesForGame = async (gameId: string) => {
  return await db
    .select({
      id: resources.id,
      name: resources.name,
      url: resources.url,
      version: resources.version,
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
    content?: string;
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
      gameId: resources.gameId,
      content: resources.content,
    })
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);
  if (!resource) {
    throw new Error("Resource not found");
  }

  const parsedInput = insertResourceSchema.partial().parse(input);

  const newResource = await db.transaction(async (tx) => {
    if (input.content && input.content !== resource.content) {
      const [embeddings, version] = await generateEmbeddings(input.content);
      if (!embeddings.length) {
        throw new Error("Failed to generate embeddings");
      }

      const [newResource] = await tx
        .update(resources)
        .set({ ...parsedInput, version: version })
        .where(eq(resources.id, resourceId))
        .returning({
          id: resources.id,
          name: resources.name,
          url: resources.url,
          content: resources.content,
          version: resources.version,
          hasContent: sql<boolean>`${resources.content} != '' AND ${resources.content} is not null`,
        });

      await tx
        .delete(fragmentsTable)
        .where(eq(fragmentsTable.resourceId, resource.id));
      await tx.insert(fragmentsTable).values(
        embeddings.map((embedding) => ({
          gameId: resource.gameId,
          resourceId: resource.id,
          ...embedding,
          version,
        }))
      );

      return newResource;
    }
  });

  return newResource;
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

  const [newResource, embeddingCount] = await db.transaction(async (tx) => {
    const [embeddings, version] = await generateEmbeddings(newContent);
    if (!embeddings.length) {
      throw new Error("Failed to generate embeddings");
    }

    await tx
      .delete(fragmentsTable)
      .where(eq(fragmentsTable.resourceId, resource.id));
    await tx.insert(fragmentsTable).values(
      embeddings.map((embedding) => ({
        gameId: resource.gameId,
        resourceId: resource.id,
        ...embedding,
      }))
    );

    const [newResource] = await tx
      .update(resources)
      // TODO: not the most correct to set version
      .set({ content: newContent, version })
      .where(eq(resources.id, resourceId))
      .returning({
        id: resources.id,
        name: resources.name,
        url: resources.url,
        version: resources.version,
      });

    return [newResource, embeddings.length];
  });

  return {
    id: newResource.id,
    name: newResource.name,
    url: newResource.url,
    version: newResource.version,
    hasContent: true,
    embeddingCount,
  };
};
