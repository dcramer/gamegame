/**
 * Resources Procedures
 * oRPC procedures for resource-related operations
 */

import { z } from 'zod';
import { ORPCError } from '@orpc/server';
import { publicProcedure, adminProcedure } from './base';
import { db } from '@/lib/db';
import { resources, fragments, attachments } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { updateResourceSchema } from '@/lib/api/schemas';

/**
 * Get resource by ID
 */
export const get = publicProcedure
  .input(
    z.object({
      id: z.string(),
    })
  )
  .handler(async ({ input }) => {
    const [resource] = await db
      .select({
        id: resources.id,
        gameId: resources.gameId,
        name: resources.name,
        originalFilename: resources.originalFilename,
        url: resources.url,
        content: resources.content,
        version: resources.version,
        pdfExtractor: resources.pdfExtractor,
        processedAt: resources.processedAt,
        status: resources.status,
        currentRunId: resources.currentRunId,
        processingStage: resources.processingStage,
        pageCount: resources.pageCount,
        imageCount: resources.imageCount,
        wordCount: resources.wordCount,
        description: resources.description,
        resourceType: resources.resourceType,
        edition: resources.edition,
        createdAt: resources.createdAt,
        updatedAt: resources.updatedAt,
      })
      .from(resources)
      .where(eq(resources.id, input.id))
      .limit(1);

    if (!resource) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    }

    // Get fragment count
    const [{ count: fragmentCount }] = await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(fragments)
      .where(eq(fragments.resourceId, input.id));

    return {
      ...resource,
      fragmentCount,
    };
  });

/**
 * List resources for a game
 */
export const listForGame = publicProcedure
  .input(
    z.object({
      gameId: z.string(),
    })
  )
  .handler(async ({ input }) => {
    const resourceList = await db
      .select({
        id: resources.id,
        gameId: resources.gameId,
        name: resources.name,
        originalFilename: resources.originalFilename,
        url: resources.url,
        hasContent: sql<boolean>`${resources.content} != '' AND ${resources.content} is not null`,
        version: resources.version,
        pdfExtractor: resources.pdfExtractor,
        processedAt: resources.processedAt,
        status: resources.status,
        currentRunId: resources.currentRunId,
        processingStage: resources.processingStage,
        pageCount: resources.pageCount,
        imageCount: resources.imageCount,
        wordCount: resources.wordCount,
        description: resources.description,
        resourceType: resources.resourceType,
        edition: resources.edition,
        createdAt: resources.createdAt,
        updatedAt: resources.updatedAt,
      })
      .from(resources)
      .where(eq(resources.gameId, input.gameId))
      .orderBy(resources.name);

    return resourceList;
  });

/**
 * Update resource metadata (admin only)
 */
export const update = adminProcedure
  .input(
    z.object({
      id: z.string(),
      data: updateResourceSchema,
    })
  )
  .handler(async ({ input }) => {
    const updateData: any = {
      updatedAt: Date.now(),
    };

    if (input.data.name !== undefined) {
      updateData.name = input.data.name;
    }
    if (input.data.description !== undefined) {
      updateData.description = input.data.description;
    }

    const [updated] = await db
      .update(resources)
      .set(updateData)
      .where(eq(resources.id, input.id))
      .returning();

    if (!updated) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    }

    return updated;
  });

/**
 * Delete resource and all associated data (admin only)
 */
export const deleteResource = adminProcedure
  .input(
    z.object({
      id: z.string(),
    })
  )
  .handler(async ({ input }) => {
    // Collect data for cleanup before deletion
    const fragmentList = await db
      .select({ id: fragments.id })
      .from(fragments)
      .where(eq(fragments.resourceId, input.id));

    const attachmentList = await db
      .select({ id: attachments.id, blobKey: attachments.blobKey })
      .from(attachments)
      .where(eq(attachments.resourceId, input.id));

    // Delete from database (cascades to fragments and attachments)
    const result = await db
      .delete(resources)
      .where(eq(resources.id, input.id))
      .returning();

    if (result.length === 0) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    }

    const errors: string[] = [];

    // Try to delete blob storage files
    if (attachmentList.length > 0) {
      try {
        const { bulkDelete } = await import('@/lib/services/blob-storage');
        const keys = attachmentList
          .map((a) => a.blobKey)
          .filter((key): key is string => typeof key === 'string' && key.length > 0);

        if (keys.length > 0) {
          await bulkDelete(keys);
        }
      } catch (error) {
        const errorMsg = `Failed to delete blob files: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[DELETE resource] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log(
      `[DELETE resource] Deleted resource ${input.id}: ${fragmentList.length} fragments, ${attachmentList.length} attachments`
    );

    return {
      success: errors.length === 0,
      deletedFragments: fragmentList.length,
      deletedAttachments: attachmentList.length,
      warnings: errors.length > 0 ? errors : undefined,
      message:
        errors.length > 0
          ? 'Resource deleted from database, but some cleanup operations failed'
          : 'Resource and all associated data deleted successfully',
    };
  });

/**
 * Reprocess resource (admin only)
 * Triggers a new workflow run to reprocess the resource from a specific stage
 */
export const reprocess = adminProcedure
  .input(
    z.object({
      id: z.string(),
      fromStage: z.enum(['ingest', 'vision', 'cleanup', 'metadata', 'embed']).optional(),
    })
  )
  .handler(async ({ input }) => {
    const { nanoid } = await import('nanoid');
    const { processResourceWorkflow } = await import('@/workflows/process-resource/index');

    // Get resource details
    const [resource] = await db
      .select({
        id: resources.id,
        gameId: resources.gameId,
        name: resources.name,
        url: resources.url,
        status: resources.status,
      })
      .from(resources)
      .where(eq(resources.id, input.id))
      .limit(1);

    if (!resource) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });
    }

    // Check if resource is already processing
    if (resource.status === 'processing' || resource.status === 'queued') {
      throw new ORPCError({
        code: 'BAD_REQUEST',
        message: 'Resource is already being processed',
      });
    }

    // Get game details
    const { games } = await import('@/lib/db/schema');
    const [game] = await db
      .select({ name: games.name })
      .from(games)
      .where(eq(games.id, resource.gameId))
      .limit(1);

    if (!game) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Game not found',
      });
    }

    // Create new run ID
    const runId = nanoid();

    // Determine starting stage and update resource status
    const startingStage = input.fromStage || 'ingest';
    await db
      .update(resources)
      .set({
        status: 'processing',
        processingStage: startingStage,
        currentRunId: runId,
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.id));

    // Trigger workflow asynchronously (don't await)
    const workflowInput = {
      runId,
      resourceId: resource.id,
      gameId: resource.gameId,
      gameName: game.name,
      name: resource.name,
      url: resource.url,
      fromStage: input.fromStage,
    };

    processResourceWorkflow(workflowInput).catch((error) => {
      console.error('[Reprocess Resource] Workflow error:', error);
      // Mark resource as failed
      db.update(resources)
        .set({
          status: 'failed',
          processingStage: 'failed',
          processingMetadata: null,
          currentRunId: null,
          updatedAt: Date.now(),
        })
        .where(eq(resources.id, input.id))
        .catch((err) => console.error('[Reprocess Resource] Failed to update resource:', err));
    });

    return {
      id: resource.id,
      status: 'processing' as const,
      runId,
      message: 'Resource queued for reprocessing',
    };
  });
