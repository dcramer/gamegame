"use server";

import { db } from "../db";
import { attachments } from "../db/schema/attachments";
import { resources } from "../db/schema/resources";
import { eq, asc } from "drizzle-orm";

/**
 * Get an attachment by ID
 * @param attachmentId The attachment ID
 * @returns Attachment with all metadata
 */
export async function getAttachment(attachmentId: string) {
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .limit(1);

  if (!attachment) {
    throw new Error(`Attachment not found: ${attachmentId}`);
  }

  return {
    id: attachment.id,
    type: attachment.type,
    url: attachment.url,
    mimeType: attachment.mimeType,
    originalFilename: attachment.originalFilename,
    pageNumber: attachment.pageNumber,
    bbox: attachment.bbox as number[] | undefined,
    caption: attachment.caption,
    width: attachment.width,
    height: attachment.height,
    description: attachment.description,
    isGoodQuality: attachment.isGoodQuality,
  };
}

/**
 * Get all attachments for a resource
 * @param resourceId The resource ID
 * @returns Array of attachments with metadata, ordered by page number
 */
export async function getResourceAttachments(resourceId: string) {
  const results = await db
    .select()
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId))
    .orderBy(asc(attachments.pageNumber), asc(attachments.createdAt));

  return results.map((attachment) => ({
    id: attachment.id,
    type: attachment.type,
    url: attachment.url,
    mimeType: attachment.mimeType,
    originalFilename: attachment.originalFilename,
    pageNumber: attachment.pageNumber,
    bbox: attachment.bbox as number[] | undefined,
    caption: attachment.caption,
    width: attachment.width,
    height: attachment.height,
    description: attachment.description,
    isGoodQuality: attachment.isGoodQuality,
  }));
}

/**
 * Get all attachments for a game
 * @param gameId The game ID
 * @returns Array of attachments with metadata, ordered by page number
 */
export async function getGameAttachments(gameId: string) {
  const results = await db
    .select({
      id: attachments.id,
      type: attachments.type,
      url: attachments.url,
      mimeType: attachments.mimeType,
      originalFilename: attachments.originalFilename,
      pageNumber: attachments.pageNumber,
      bbox: attachments.bbox,
      caption: attachments.caption,
      width: attachments.width,
      height: attachments.height,
      description: attachments.description,
      isGoodQuality: attachments.isGoodQuality,
      resourceId: attachments.resourceId,
      resourceName: resources.name,
    })
    .from(attachments)
    .innerJoin(resources, eq(attachments.resourceId, resources.id))
    .where(eq(resources.gameId, gameId))
    .orderBy(asc(attachments.pageNumber), asc(attachments.createdAt));

  return results.map((attachment) => ({
    id: attachment.id,
    type: attachment.type,
    url: attachment.url,
    mimeType: attachment.mimeType,
    originalFilename: attachment.originalFilename,
    pageNumber: attachment.pageNumber,
    bbox: attachment.bbox as number[] | undefined,
    caption: attachment.caption,
    width: attachment.width,
    height: attachment.height,
    description: attachment.description,
    isGoodQuality: attachment.isGoodQuality,
    resourceId: attachment.resourceId,
    resourceName: attachment.resourceName,
  }));
}
