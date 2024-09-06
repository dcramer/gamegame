"use server";

import { auth } from "@/auth";
import { db } from "../db";
import { games, resources } from "../db/schema";
import { del, list, ListBlobResult, ListBlobResultBlob } from "@vercel/blob";

export const findOrphanBlobs = async () => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  const activeBlobUrls = new Set([
    ...(await db.select({ url: resources.url }).from(resources)).map(
      (r) => r.url
    ),
    ...(await db.select({ imageUrl: games.imageUrl }).from(games)).map(
      (r) => r.imageUrl
    ),
  ]);

  let hasMore = true;
  let cursor;

  const orphanBlobs: ListBlobResultBlob[] = [];

  while (hasMore) {
    const listResult: ListBlobResult = await list({
      cursor,
    });

    for (const blob of listResult.blobs) {
      if (!activeBlobUrls.has(blob.url)) {
        orphanBlobs.push(blob);
      }
    }

    hasMore = listResult.hasMore;
    cursor = listResult.cursor;
  }

  return orphanBlobs;
};

export const deleteBlob = async (blobUrl: string) => {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }

  await del(blobUrl);

  return {};
};
