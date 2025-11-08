/**
 * Attachments Procedures
 * oRPC procedures for attachment-related operations
 */

import { z } from 'zod';
import { ORPCError } from '@orpc/server';
import { start } from 'workflow/api';
import { publicProcedure, adminProcedure } from './base';
import { db } from '@/lib/db';
import { attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  updateAttachmentSchema,
  attachmentResponseSchema,
  attachmentListResponseSchema,
} from '@/lib/api/schemas';
import { blobKeyToUrl } from '@/lib/services/blob-storage';
import { nanoid } from 'nanoid';
import { analyzeImagesWorkflow } from '@/workflows/analyze-images';

/**
 * Helper to safely parse bbox JSON
 */
function parseBbox(bboxValue: any): number[] | undefined {
  if (!bboxValue) return undefined;

  // If it's already an array, return it
  if (Array.isArray(bboxValue)) {
    if (bboxValue.every((v) => typeof v === 'number')) {
      return bboxValue;
    }
    return undefined;
  }

  // If it's a string, try to parse it
  if (typeof bboxValue === 'string') {
    try {
      const parsed = JSON.parse(bboxValue);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'number')) {
        return parsed;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Get attachment by ID
 */
export const get = publicProcedure
  .route({
    method: 'GET',
    path: '/attachments/{id}',
  })
  .input(
    z.object({
      id: z.string(),
    })
  )
  .output(attachmentResponseSchema)
  .handler(async ({ input }) => {
    const [attachment] = await db
      .select({
        id: attachments.id,
        gameId: attachments.gameId,
        resourceId: attachments.resourceId,
        type: attachments.type,
        blobKey: attachments.blobKey,
        mimeType: attachments.mimeType,
        originalFilename: attachments.originalFilename,
        pageNumber: attachments.pageNumber,
        bbox: attachments.bbox,
        caption: attachments.caption,
        width: attachments.width,
        height: attachments.height,
        description: attachments.description,
      })
      .from(attachments)
      .where(eq(attachments.id, input.id))
      .limit(1);

    if (!attachment) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Attachment not found',
      });
    }

    const result = {
      ...attachment,
      url: attachment.blobKey ? blobKeyToUrl(attachment.blobKey) : null,
      bbox: parseBbox(attachment.bbox),
    };

    return result;
  });

/**
 * List attachments for a resource
 */
export const listForResource = publicProcedure
  .route({
    method: 'GET',
    path: '/resources/{resourceId}/attachments',
  })
  .input(
    z.object({
      resourceId: z.string(),
    })
  )
  .output(attachmentListResponseSchema)
  .handler(async ({ input }) => {
    const attachmentsList = await db
      .select({
        id: attachments.id,
        gameId: attachments.gameId,
        resourceId: attachments.resourceId,
        type: attachments.type,
        blobKey: attachments.blobKey,
        mimeType: attachments.mimeType,
        originalFilename: attachments.originalFilename,
        pageNumber: attachments.pageNumber,
        bbox: attachments.bbox,
        caption: attachments.caption,
        width: attachments.width,
        height: attachments.height,
        description: attachments.description,
        isGoodQuality: attachments.isGoodQuality,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(eq(attachments.resourceId, input.resourceId))
      .orderBy(attachments.pageNumber, attachments.createdAt);

    return attachmentsList.map((attachment) => ({
      ...attachment,
      url: attachment.blobKey ? blobKeyToUrl(attachment.blobKey) : null,
      bbox: parseBbox(attachment.bbox),
    }));
  });

/**
 * List attachments for a game
 */
export const listForGame = publicProcedure
  .route({
    method: 'GET',
    path: '/games/{gameId}/attachments',
  })
  .input(
    z.object({
      gameId: z.string(),
    })
  )
  .output(attachmentListResponseSchema)
  .handler(async ({ input }) => {
    const attachmentsList = await db
      .select({
        id: attachments.id,
        resourceId: attachments.resourceId,
        gameId: attachments.gameId,
        type: attachments.type,
        blobKey: attachments.blobKey,
        mimeType: attachments.mimeType,
        originalFilename: attachments.originalFilename,
        pageNumber: attachments.pageNumber,
        bbox: attachments.bbox,
        caption: attachments.caption,
        width: attachments.width,
        height: attachments.height,
        description: attachments.description,
        isGoodQuality: attachments.isGoodQuality,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(eq(attachments.gameId, input.gameId))
      .orderBy(attachments.pageNumber, attachments.createdAt);

    return attachmentsList.map((attachment) => ({
      ...attachment,
      url: attachment.blobKey ? blobKeyToUrl(attachment.blobKey) : null,
      bbox: parseBbox(attachment.bbox),
    }));
  });

/**
 * Update attachment metadata (admin only)
 */
export const update = adminProcedure
  .route({
    method: 'PATCH',
    path: '/attachments/{id}',
  })
  .input(
    z.object({
      id: z.string(),
      description: z.string().nullable().optional(),
      originalFilename: z.string().nullable().optional(),
    })
  )
  .output(attachmentResponseSchema)
  .handler(async ({ input }) => {
    const updateData: any = {};

    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.originalFilename !== undefined) {
      updateData.originalFilename = input.originalFilename;
    }

    const [updated] = await db
      .update(attachments)
      .set(updateData)
      .where(eq(attachments.id, input.id))
      .returning();

    if (!updated) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Attachment not found',
      });
    }

    const result = {
      ...updated,
      url: updated.blobKey ? blobKeyToUrl(updated.blobKey) : null,
      bbox: parseBbox(updated.bbox),
    };

    return result;
  });

/**
 * Reprocess attachment with vision analysis (admin only)
 */
export const reprocess = adminProcedure
  .route({
    method: 'POST',
    path: '/attachments/{id}/reprocess',
  })
  .input(
    z.object({
      id: z.string(),
    })
  )
  .output(
    z.object({
      id: z.string(),
      status: z.literal('processing'),
      runId: z.string(),
      message: z.string(),
    })
  )
  .handler(async ({ input }) => {
    // Get attachment from database
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, input.id))
      .limit(1);

    if (!attachment) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Attachment not found',
      });
    }

    // Only process images
    if (attachment.type !== 'image' || !attachment.mimeType?.startsWith('image/')) {
      throw new ORPCError({
        code: 'BAD_REQUEST',
        message: 'Only image attachments can be reprocessed with vision',
      });
    }

    // Generate run ID for tracking
    const runId = nanoid();

    // Call unified workflow in single-attachment mode
    start(analyzeImagesWorkflow, [{
      runId,
      mode: 'single-attachment',
      attachmentId: input.id,
      gameId: attachment.gameId,
    }]).catch((error) => {
      console.error('[reprocess attachment] Workflow start error:', error);
    });

    return {
      id: attachment.id,
      status: 'processing' as const,
      runId,
      message: 'Image reanalysis started',
    };
  });
