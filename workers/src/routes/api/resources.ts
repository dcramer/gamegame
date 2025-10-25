import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '@/types';
import { getDb, resources, fragments, attachments, games } from '@/lib/db';
import { eq, sql, asc } from 'drizzle-orm';
import { requireAdmin } from '@/middleware/auth';
import { createJob, deleteJob, getJob } from '@/lib/jobs/status';
import { extractR2KeyFromUrl, normalizeResourceSourceUrl, r2KeyToUrl } from '@/lib/services/r2-storage';
import { deleteEmbeddings } from '@/lib/ai/vectorize';
import {
  jobStatusSchema,
  resourceSchema,
  attachmentsListSchema,
  uploadResponseSchema,
  deleteResourceResponseSchema,
  validateResponse,
} from './schemas';

const resourcesRouter = new Hono<{ Bindings: Env }>();

/**
 * Get job status for a resource (admin only)
 *
 * Security: Requires admin authentication to prevent information disclosure.
 * Job IDs can leak processing status, error messages, and resource information.
 */
resourcesRouter.get('/jobs/:jobId', requireAdmin, async (c) => {
  const { jobId } = c.req.param();

  const job = await getJob(c.env.JOB_STATUS_KV, jobId);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json(validateResponse(job, jobStatusSchema));
});

// Note: Resource listing by game moved to /api/games/:gameIdOrSlug/resources
// This avoids duplicate endpoints and keeps game-related routes together

/**
 * Get single resource
 */
resourcesRouter.get('/:resourceId', async (c) => {
  const { resourceId } = c.req.param();
  const db = getDb(c.env.DB);

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
      currentJobId: resources.currentJobId,
      processingStage: resources.processingStage,
      pageCount: resources.pageCount,
      imageCount: resources.imageCount,
      wordCount: resources.wordCount,
      description: resources.description,
      createdAt: resources.createdAt,
      updatedAt: resources.updatedAt,
    })
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);

  if (!resource) {
    return c.json({ error: 'Resource not found' }, 404);
  }

  // Get fragment count
  const [{ count: fragmentCount }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(fragments)
    .where(eq(fragments.resourceId, resourceId));

  const response = {
    ...resource,
    url: normalizeResourceSourceUrl(resource.id, resource.url) ?? resource.url,
    fragmentCount: Number(fragmentCount),
  };

  return c.json(validateResponse(response, resourceSchema));
});

/**
 * Reprocess a resource (admin only)
 * Deletes existing fragments and attachments, then re-queues for processing
 */
resourcesRouter.post('/:resourceId/reprocess', requireAdmin, async (c) => {
  const { resourceId } = c.req.param();
  const db = getDb(c.env.DB);

  // Get resource details
  const [resource] = await db
    .select({
      id: resources.id,
      gameId: resources.gameId,
      name: resources.name,
      url: resources.url,
      currentJobId: resources.currentJobId,
    })
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);

  if (!resource) {
    return c.json({ error: 'Resource not found' }, 404);
  }

  // Fetch game name for vision analysis context
  const [game] = await db
    .select({ name: games.name })
    .from(games)
    .where(eq(games.id, resource.gameId))
    .limit(1);

  const normalizedUrl = normalizeResourceSourceUrl(resource.id, resource.url) ?? resource.url;
  const sourceKey = normalizedUrl ? extractR2KeyFromUrl(normalizedUrl) : null;

  // Clean up old job if exists
  if (resource.currentJobId) {
    await deleteJob(c.env.JOB_STATUS_KV, resource.currentJobId);
  }

  // Clean up old fragments and their embeddings before reprocessing
  const oldFragments = await db
    .select({ id: fragments.id })
    .from(fragments)
    .where(eq(fragments.resourceId, resourceId))
    .all();

  if (oldFragments.length > 0) {
    // Delete from D1 (cascade will handle fragment deletion)
    await db.delete(fragments).where(eq(fragments.resourceId, resourceId));

    // Delete embeddings from Vectorize
    try {
      const fragmentIds = oldFragments.map(f => f.id);
      await deleteEmbeddings(c.env.VECTORIZE, fragmentIds);
    } catch (error) {
      console.error('Failed to delete old embeddings during reprocess:', error);
      // Continue - embeddings will be orphaned but won't affect functionality
    }
  }

  // Clean up old attachments and their R2 files
  const oldAttachments = await db
    .select({ id: attachments.id, r2Key: attachments.r2Key })
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId))
    .all();

  if (oldAttachments.length > 0) {
    // Delete from D1
    await db.delete(attachments).where(eq(attachments.resourceId, resourceId));

    // Delete R2 files
    try {
      for (const attachment of oldAttachments) {
        await c.env.FILES.delete(attachment.r2Key);
      }
    } catch (error) {
      console.error('Failed to delete old attachment files during reprocess:', error);
      // Continue - orphaned files aren't critical
    }
  }

  // Create new job and enqueue for processing
  const jobId = await createJob(c.env.JOB_STATUS_KV, resourceId, resource.gameId);

  // Reset resource to empty state and mark as processing
  await db
    .update(resources)
    .set({
      status: 'processing',
      currentJobId: jobId,
      processingStage: 'ingest',
      processingMetadata: null,
      url: normalizedUrl,
      updatedAt: new Date(),
    })
    .where(eq(resources.id, resourceId));

  await c.env.RESOURCE_QUEUE.send({
    jobId,
    resourceId,
    gameId: resource.gameId,
    name: resource.name,
    type: 'INGEST',
    url: normalizedUrl,
    gameName: game?.name, // Include game name for vision analysis
    sourceKey: sourceKey || undefined,
  });

  const response = {
    resourceId,
    jobId,
    status: 'queued',
    message: 'Resource queued for reprocessing',
  };

  return c.json(validateResponse(response, uploadResponseSchema), 202);
});

/**
 * Update resource (admin only)
 */
resourcesRouter.patch(
  '/:resourceId',
  requireAdmin,
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).optional(),
      content: z.string().optional(),
      description: z.string().optional().nullable(),
      author: z.string().optional().nullable(),
      attributionUrl: z.string().url().optional().nullable(),
    })
  ),
  async (c) => {
    const { resourceId } = c.req.param();
    const data = c.req.valid('json');
    const db = getDb(c.env.DB);

    if (data.content !== undefined) {
      return c.json(
        {
          error: 'Resource content is managed by the processing pipeline. Use the reprocess endpoint to regenerate content.',
        },
        400
      );
    }

    const updateData: Partial<typeof resources.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    // Note: content updates are blocked by the check above (line 226)
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.author !== undefined) {
      updateData.author = data.author ?? null;
    }
    if (data.attributionUrl !== undefined) {
      updateData.attributionUrl = data.attributionUrl ?? null;
    }

    const [updated] = await db
      .update(resources)
      .set(updateData)
      .where(eq(resources.id, resourceId))
      .returning();

    if (!updated) {
      return c.json({ error: 'Resource not found' }, 404);
    }

    return c.json(updated);
  }
);

/**
 * Get attachments for a resource
 */
resourcesRouter.get('/:resourceId/attachments', async (c) => {
  const { resourceId } = c.req.param();
  const db = getDb(c.env.DB);

  const attachmentList = await db
    .select({
      id: attachments.id,
      type: attachments.type,
      r2Key: attachments.r2Key,
      mimeType: attachments.mimeType,
      originalFilename: attachments.originalFilename,
      pageNumber: attachments.pageNumber,
      bbox: attachments.bbox,
      caption: attachments.caption,
      width: attachments.width,
      height: attachments.height,
      description: attachments.description,
      isGoodQuality: attachments.isGoodQuality,
    })
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId))
    .orderBy(asc(attachments.pageNumber), asc(attachments.createdAt))
    .all();

  // Helper to safely parse bbox JSON
  const parseBbox = (bboxValue: string | null | undefined): number[] | undefined => {
    if (!bboxValue) return undefined;
    try {
      const parsed = JSON.parse(typeof bboxValue === 'string' ? bboxValue : String(bboxValue));
      if (Array.isArray(parsed) && parsed.every(v => typeof v === 'number')) {
        return parsed;
      }
      return undefined;
    } catch {
      return undefined;
    }
  };

  const parsed = attachmentList.map((attachment) => ({
    ...attachment,
    url: r2KeyToUrl(attachment.r2Key),
    bbox: parseBbox(attachment.bbox),
  }));

  return c.json(validateResponse(parsed, attachmentsListSchema));
});

/**
 * Delete resource (admin only)
 * Note: D1 CASCADE handles database deletions (fragments, attachments)
 * We collect data before deletion to clean up external resources (Vectorize, R2)
 */
resourcesRouter.delete('/:resourceId', requireAdmin, async (c) => {
  const { resourceId } = c.req.param();
  const db = getDb(c.env.DB);

  // Step 1: Collect all data needed for cleanup BEFORE any deletions
  const fragmentList = await db
    .select({ id: fragments.id })
    .from(fragments)
    .where(eq(fragments.resourceId, resourceId))
    .all();

  const attachmentList = await db
    .select({ r2Key: attachments.r2Key })
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId))
    .all();

  // Step 2: Delete from D1 (source of truth, cascades to fragments and attachments)
  const result = await db.delete(resources).where(eq(resources.id, resourceId)).returning();

  if (result.length === 0) {
    return c.json({ error: 'Resource not found' }, 404);
  }

  const errors: string[] = [];

  // Step 3: Try to delete from Vectorize (log errors but don't fail)
  if (fragmentList.length > 0) {
    try {
      const fragmentIds = fragmentList.map((f) => f.id);
      await deleteEmbeddings(c.env.VECTORIZE, fragmentIds);
    } catch (error) {
      const errorMsg = `Failed to delete ${fragmentList.length} embeddings from Vectorize: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[Delete Resource] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  // Step 4: Try to delete from R2 (log errors but don't fail)
  let deletedR2Count = 0;
  try {
    const { deleteResourceFiles } = await import('@/lib/services/r2-storage');
    deletedR2Count = await deleteResourceFiles(c.env.FILES, resourceId);
  } catch (error) {
    const errorMsg = `Failed to delete R2 files for resource ${resourceId}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[Delete Resource] ${errorMsg}`);
    errors.push(errorMsg);
  }

  console.log(`[Delete Resource] Deleted resource ${resourceId}: ${fragmentList.length} fragments, ${attachmentList.length} attachments, ${deletedR2Count} R2 files`);

  // Return 207 Multi-Status if cleanup had errors (resource deleted, but orphaned data remains)
  // Return 200 only if everything succeeded
  const statusCode = errors.length > 0 ? 207 : 200;

  const response = {
    success: errors.length === 0,
    deletedFragments: fragmentList.length,
    deletedAttachments: attachmentList.length,
    deletedR2Files: deletedR2Count,
    warnings: errors.length > 0 ? errors : undefined,
    message: errors.length > 0
      ? 'Resource deleted from database, but some cleanup operations failed. Orphaned data may remain in Vectorize or R2.'
      : 'Resource and all associated data deleted successfully',
  };

  return c.json(validateResponse(response, deleteResourceResponseSchema), statusCode);
});

export default resourcesRouter;
