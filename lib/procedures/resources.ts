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
import {
  updateResourceSchema,
  resourceResponseSchema,
  resourceListResponseSchema,
  successResponseSchema,
} from '@/lib/api/schemas';
import { bulkDelete } from '@/lib/services/blob-storage';
import { reprocessResource } from '@/lib/services/reprocess';

type ResourceRecord = {
  resourceType: string | null;
  author?: string | null;
  attributionUrl?: string | null;
  description?: string | null;
};

function normalizeResourceFields<T extends ResourceRecord>(resource: T) {
  return {
    ...resource,
    resourceType: resource.resourceType ?? 'rulebook',
    author: resource.author ?? null,
    attributionUrl: resource.attributionUrl ?? null,
    description: resource.description ?? null,
  };
}

/**
 * Get resource by ID
 */
export const get = publicProcedure
  .route({
    method: 'GET',
    path: '/resources/{id}',
  })
  .input(
    z.object({
      id: z.string(),
    })
  )
  .output(resourceResponseSchema.extend({ fragmentCount: z.number() }))
  .handler(async ({ input }) => {
    const [resource] = await db
      .select({
        id: resources.id,
        gameId: resources.gameId,
        name: resources.name,
        originalFilename: resources.originalFilename,
        author: resources.author,
        attributionUrl: resources.attributionUrl,
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
      throw new ORPCError('NOT_FOUND', {
        message: 'Resource not found',
      });
    }

    // Get fragment count
    const [{ count: fragmentCount }] = await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(fragments)
      .where(eq(fragments.resourceId, input.id));

    const normalizedResource = normalizeResourceFields(resource);

    return {
      ...normalizedResource,
      fragmentCount,
    };
  });

/**
 * List resources for a game
 */
export const listForGame = publicProcedure
  .route({
    method: 'GET',
    path: '/games/{gameId}/resources',
  })
  .input(
    z.object({
      gameId: z.string(),
    })
  )
  .output(resourceListResponseSchema)
  .handler(async ({ input }) => {
    const resourceList = await db
      .select({
        id: resources.id,
        gameId: resources.gameId,
        name: resources.name,
        originalFilename: resources.originalFilename,
        url: resources.url,
        hasContent: sql<boolean>`${resources.content} != '' AND ${resources.content} is not null`,
        author: resources.author,
        attributionUrl: resources.attributionUrl,
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

    return resourceList.map((resource) => ({
      ...normalizeResourceFields(resource),
      hasContent: Boolean(resource.hasContent),
    }));
  });

/**
 * Update resource metadata (admin only)
 */
export const update = adminProcedure
  .route({
    method: 'PATCH',
    path: '/resources/{id}',
  })
  .input(
    z.object({
      id: z.string(),
      data: updateResourceSchema,
    })
  )
  .output(resourceResponseSchema)
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
    if (input.data.author !== undefined) {
      updateData.author = input.data.author;
    }
    if (input.data.attributionUrl !== undefined) {
      updateData.attributionUrl = input.data.attributionUrl;
    }

    const [updated] = await db
      .update(resources)
      .set(updateData)
      .where(eq(resources.id, input.id))
      .returning();

    if (!updated) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Resource not found',
      });
    }

    return normalizeResourceFields(updated);
  });

/**
 * Delete resource and all associated data (admin only)
 */
export const deleteResource = adminProcedure
  .route({
    method: 'DELETE',
    path: '/resources/{id}',
  })
  .input(
    z.object({
      id: z.string(),
    })
  )
  .output(
    successResponseSchema.extend({
      deletedFragments: z.number(),
      deletedAttachments: z.number(),
      warnings: z.array(z.string()).optional(),
      message: z.string(),
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
      throw new ORPCError('NOT_FOUND', {
        message: 'Resource not found',
      });
    }

    const errors: string[] = [];

    // Try to delete blob storage files
    if (attachmentList.length > 0) {
      try {
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
const reprocessInputSchema = z
  .object({
    id: z.string(),
    fromStage: z.enum(['ingest', 'vision', 'cleanup', 'metadata', 'embed']).optional(),
    onlyStage: z.boolean().optional(),
  })
  .refine(
    (data) => !(data.onlyStage && !data.fromStage),
    {
      message: 'fromStage is required when onlyStage is true',
      path: ['fromStage'],
    }
  );

export const reprocess = adminProcedure
  .route({
    method: 'POST',
    path: '/resources/{id}/reprocess',
  })
  .input(reprocessInputSchema)
  .output(
    z.object({
      id: z.string(),
      status: z.literal('processing'),
      runId: z.string(),
      message: z.string(),
    })
  )
  .handler(async ({ input }) => {
    try {
      return await reprocessResource({
        resourceId: input.id,
        fromStage: input.fromStage,
        onlyStage: input.onlyStage,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Resource not found') {
        throw new ORPCError('NOT_FOUND', {
          message: 'Resource not found',
        });
      }
      if (error instanceof Error && error.message === 'Game not found') {
        throw new ORPCError('NOT_FOUND', {
          message: 'Game not found',
        });
      }
      throw error;
    }
  });
