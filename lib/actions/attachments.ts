"use server";

import { db } from "../db";
import { attachments } from "../db/schema/attachments";
import { resources } from "../db/schema/resources";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../auth/helpers";

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
    resourceId: attachment.resourceId,
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

/**
 * Update attachment metadata (admin only)
 * @param attachmentId The attachment ID
 * @param data The fields to update
 * @returns Updated attachment
 */
export async function updateAttachment(
  attachmentId: string,
  data: {
    description?: string | null;
    originalFilename?: string | null;
  }
) {
  await requireAdmin();

  const updateData: Partial<typeof attachments.$inferInsert> = {};

  if (data.description !== undefined) {
    updateData.description = data.description;
  }
  if (data.originalFilename !== undefined) {
    updateData.originalFilename = data.originalFilename;
  }

  const [updated] = await db
    .update(attachments)
    .set(updateData)
    .where(eq(attachments.id, attachmentId))
    .returning();

  if (!updated) {
    throw new Error("Attachment not found");
  }

  return {
    id: updated.id,
    type: updated.type,
    url: updated.url,
    mimeType: updated.mimeType,
    originalFilename: updated.originalFilename,
    pageNumber: updated.pageNumber,
    bbox: updated.bbox as number[] | undefined,
    caption: updated.caption,
    width: updated.width,
    height: updated.height,
    description: updated.description,
    isGoodQuality: updated.isGoodQuality,
  };
}

/**
 * Reanalyze attachment with vision API (admin only)
 * Triggers a workflow to re-run vision analysis
 * @param attachmentId The attachment ID
 * @param gameId The game ID
 */
export async function reanalyzeAttachment(attachmentId: string, gameId: string) {
  await requireAdmin();

  // Get attachment to verify it exists
  const [attachment] = await db
    .select({ id: attachments.id, gameId: attachments.gameId })
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .limit(1);

  if (!attachment) {
    throw new Error("Attachment not found");
  }

  // Trigger workflow
  const { reanalyzeAttachmentWorkflow } = await import("@/workflows/reanalyze-attachment");

  // Start workflow in background (don't await)
  reanalyzeAttachmentWorkflow({
    attachmentId,
    gameId,
  }).catch((error) => {
    console.error("Reanalyze attachment workflow failed:", error);
  });

  return { success: true };
}
