import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '@/types';
import { getDb, resources, fragments, attachments, games } from '@/lib/db';
import { eq, sql, asc } from 'drizzle-orm';
import { requireAdmin } from '@/middleware/auth';
import { createJob, deleteJob, getJob, listJobs, cancelJob } from '@/lib/jobs/status';
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
 * Get all jobs from KV (admin only)
 * Returns all jobs sorted by creation time (newest first)
 */
resourcesRouter.get('/jobs', requireAdmin, async (c) => {
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100;
  const cursor = c.req.query('cursor');

  const result = await listJobs(c.env.JOB_STATUS_KV, { limit, cursor });

  // Batch fetch resource and game names in a single query
  const db = getDb(c.env.DB);
  const resourceIds = [...new Set(result.jobs.map((job) => job.resourceId))];

  // Handle empty jobs list
  if (resourceIds.length === 0) {
    return c.json({
      jobs: [],
      cursor: result.cursor,
      hasMore: result.hasMore,
    });
  }

  const resourceDetails = await db
    .select({
      resourceId: resources.id,
      resourceName: resources.name,
      gameName: games.name,
    })
    .from(resources)
    .innerJoin(games, eq(resources.gameId, games.id))
    .where(sql`${resources.id} IN (${sql.join(resourceIds.map(id => sql`${id}`), sql`, `)})`)
    .all();

  // Create lookup map for O(1) access
  const resourceMap = new Map(
    resourceDetails.map((r) => [r.resourceId, { name: r.resourceName, gameName: r.gameName }])
  );

  // Enrich jobs with details
  const jobsWithDetails = result.jobs.map((job) => {
    const details = resourceMap.get(job.resourceId);
    return {
      ...job,
      resourceName: details?.name,
      gameName: details?.gameName,
    };
  });

  return c.json({
    jobs: jobsWithDetails,
    cursor: result.cursor,
    hasMore: result.hasMore,
  });
});

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

/**
 * Cancel a job (admin only)
 * Marks the job as failed so the queue consumer will skip it
 * Also updates the resource status in D1
 */
resourcesRouter.post('/jobs/:jobId/cancel', requireAdmin, async (c) => {
  const { jobId } = c.req.param();

  try {
    // Get job to find resource ID
    const job = await getJob(c.env.JOB_STATUS_KV, jobId);
    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }

    // Cancel the job in KV (this will throw if job is completed or already failed)
    await cancelJob(c.env.JOB_STATUS_KV, jobId);

    // Verify the job was actually cancelled (prevent race condition)
    const cancelledJob = await getJob(c.env.JOB_STATUS_KV, jobId);
    if (!cancelledJob || cancelledJob.status !== 'failed') {
      return c.json({ error: 'Job could not be cancelled - it may have completed' }, 409);
    }

    // Update resource status in D1 only if job is still cancelled
    const db = getDb(c.env.DB);
    const result = await db
      .update(resources)
      .set({
        status: 'failed',
        processingStage: 'cancelled',
        processingMetadata: null,
        currentJobId: null,
        updatedAt: new Date(),
      })
      .where(sql`${resources.id} = ${job.resourceId} AND ${resources.currentJobId} = ${jobId}`)
      .returning();

    // If no rows updated, the resource was already updated by another process
    if (result.length === 0) {
      return c.json({
        success: true,
        message: 'Job cancelled, but resource was already updated by another process'
      });
    }

    return c.json({ success: true, message: 'Job cancelled successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 400);
  }
});

/**
 * Retry a failed job (admin only)
 * Creates a new job and re-enqueues the resource for processing from where it failed
 */
resourcesRouter.post('/jobs/:jobId/retry', requireAdmin, async (c) => {
  const { jobId } = c.req.param();

  try {
    // Get job to find resource ID and verify it's failed
    const job = await getJob(c.env.JOB_STATUS_KV, jobId);
    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }

    if (job.status !== 'failed') {
      return c.json({ error: 'Only failed jobs can be retried' }, 400);
    }

    const db = getDb(c.env.DB);

    // Get resource details including processing stage
    const [resource] = await db
      .select({
        id: resources.id,
        gameId: resources.gameId,
        name: resources.name,
        url: resources.url,
        processingStage: resources.processingStage,
        processingMetadata: resources.processingMetadata,
        status: resources.status,
      })
      .from(resources)
      .where(eq(resources.id, job.resourceId))
      .limit(1);

    if (!resource) {
      return c.json({ error: 'Resource not found' }, 404);
    }

    // Get game name for vision analysis context
    const [game] = await db
      .select({ name: games.name })
      .from(games)
      .where(eq(games.id, resource.gameId))
      .limit(1);

    // Determine which stage to retry from (default to ingest if unknown)
    const stage = resource.processingStage || 'ingest';
    const taskTypeMap: Record<string, 'INGEST' | 'VISION' | 'CLEANUP' | 'METADATA' | 'EMBED' | 'FINALIZE'> = {
      ingest: 'INGEST',
      vision: 'VISION',
      cleanup: 'CLEANUP',
      metadata: 'METADATA',
      embed: 'EMBED',
      finalize: 'FINALIZE',
    };
    const taskType = taskTypeMap[stage] || 'INGEST';

    // Create new job
    const newJobId = await createJob(c.env.JOB_STATUS_KV, resource.id, resource.gameId);

    // Normalize URL for R2 access
    const normalizedUrl = normalizeResourceSourceUrl(resource.id, resource.url) ?? resource.url;
    const sourceKey = normalizedUrl ? extractR2KeyFromUrl(normalizedUrl) : null;

    // Update resource to processing state with new job
    await db
      .update(resources)
      .set({
        status: 'processing',
        currentJobId: newJobId,
        processingStage: stage,
        url: normalizedUrl,
        updatedAt: new Date(),
      })
      .where(eq(resources.id, resource.id));

    // Send to queue
    // Note: INGEST task always requires url and sourceKey
    try {
      await c.env.RESOURCE_QUEUE.send({
        jobId: newJobId,
        resourceId: resource.id,
        gameId: resource.gameId,
        name: resource.name,
        type: taskType,
        url: taskType === 'INGEST' ? normalizedUrl : undefined,
        gameName: game?.name,
        sourceKey: taskType === 'INGEST' ? (sourceKey || undefined) : undefined,
      });
    } catch (error) {
      // If queue send fails, revert the resource status
      await db
        .update(resources)
        .set({
          status: 'failed',
          currentJobId: jobId, // Restore old job ID
          updatedAt: new Date(),
        })
        .where(eq(resources.id, resource.id));

      // Delete the new job we just created
      await deleteJob(c.env.JOB_STATUS_KV, newJobId);

      throw error;
    }

    // Delete old failed job
    await deleteJob(c.env.JOB_STATUS_KV, jobId);

    return c.json({
      success: true,
      jobId: newJobId,
      message: `Job retrying from ${stage} stage`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 400);
  }
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

  // Convert Date objects to timestamps for proper JSON serialization
  const response = {
    ...resource,
    url: normalizeResourceSourceUrl(resource.id, resource.url) ?? resource.url,
    fragmentCount: Number(fragmentCount),
    processedAt: resource.processedAt ? resource.processedAt.getTime() : null,
    createdAt: resource.createdAt ? resource.createdAt.getTime() : null,
    updatedAt: resource.updatedAt ? resource.updatedAt.getTime() : null,
  };

  return c.json(validateResponse(response, resourceSchema));
});

/**
 * Reprocess a resource (admin only)
 * Deletes existing fragments and attachments, then re-queues for processing
 *
 * Query parameter: ?from=stage
 * - ingest (default): Full reprocess from PDF extraction
 * - vision: Re-run vision analysis and subsequent stages (skips PDF extraction)
 * - cleanup: Re-run markdown cleanup and subsequent stages (skips PDF extraction and vision)
 * - metadata: Re-run metadata generation and subsequent stages (skips PDF extraction, vision, and cleanup)
 * - embed: Re-run chunking and embedding (skips PDF extraction, vision, cleanup, and metadata)
 */
resourcesRouter.post('/:resourceId/reprocess', requireAdmin, async (c) => {
  const fromStage = (c.req.query('from') as 'ingest' | 'vision' | 'cleanup' | 'metadata' | 'embed') || 'ingest';

  // Validate from parameter
  if (!['ingest', 'vision', 'cleanup', 'metadata', 'embed'].includes(fromStage)) {
    return c.json({
      error: 'Invalid "from" parameter. Must be one of: ingest, vision, cleanup, metadata, embed'
    }, 400);
  }
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

  // Check if structured data exists when skipping INGEST stage
  if (fromStage !== 'ingest') {
    const structuredKey = `resources/${resourceId}/structured.json`;
    const structuredObject = await c.env.FILES.get(structuredKey);

    if (!structuredObject) {
      return c.json({
        error: `No structured data found for this resource. Use ?from=ingest to extract from PDF first.`
      }, 400);
    }
  }

  const normalizedUrl = normalizeResourceSourceUrl(resource.id, resource.url) ?? resource.url;
  const sourceKey = normalizedUrl ? extractR2KeyFromUrl(normalizedUrl) : null;

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

    // Delete R2 files using bulk delete for efficiency
    try {
      const { bulkDeleteFromR2 } = await import('@/lib/services/r2-storage');
      const keys = oldAttachments
        .map((attachment) => attachment.r2Key)
        .filter((key): key is string => typeof key === 'string' && key.length > 0);

      if (keys.length > 0) {
        await bulkDeleteFromR2(c.env.FILES, keys);
      }
    } catch (error) {
      console.error('Failed to delete old attachment files during reprocess:', error);
      // Continue - orphaned files aren't critical
    }
  }

  // Create new job and enqueue for processing
  const jobId = await createJob(c.env.JOB_STATUS_KV, resourceId, resource.gameId);

  // Build processing metadata based on starting stage
  let processingMetadata: string | null = null;
  if (fromStage !== 'ingest') {
    const stageCompletion: Record<typeof fromStage, { ingest: boolean; vision: boolean; cleanup: boolean; metadata: boolean; embed: boolean }> = {
      vision: { ingest: true, vision: false, cleanup: false, metadata: false, embed: false },
      cleanup: { ingest: true, vision: true, cleanup: false, metadata: false, embed: false },
      metadata: { ingest: true, vision: true, cleanup: true, metadata: false, embed: false },
      embed: { ingest: true, vision: true, cleanup: true, metadata: true, embed: false },
    };
    processingMetadata = JSON.stringify({
      structuredKey: `resources/${resourceId}/structured.json`,
      stages: stageCompletion[fromStage],
    });
  }

  // Map stage names to ProcessingTaskType
  const stageToTaskType: Record<typeof fromStage, 'INGEST' | 'VISION' | 'CLEANUP' | 'METADATA' | 'EMBED'> = {
    ingest: 'INGEST',
    vision: 'VISION',
    cleanup: 'CLEANUP',
    metadata: 'METADATA',
    embed: 'EMBED',
  };

  const taskType = stageToTaskType[fromStage];
  const processingStage = fromStage;

  // Reset resource to processing state
  await db
    .update(resources)
    .set({
      status: 'processing',
      currentJobId: jobId,
      processingStage,
      processingMetadata,
      url: normalizedUrl,
      updatedAt: new Date(),
    })
    .where(eq(resources.id, resourceId));

  // Send to queue (this is the critical operation - must succeed before cleanup)
  try {
    await c.env.RESOURCE_QUEUE.send({
      jobId,
      resourceId,
      gameId: resource.gameId,
      name: resource.name,
      type: taskType,
      url: fromStage === 'ingest' ? normalizedUrl : undefined,
      gameName: game?.name, // Include game name for vision analysis
      sourceKey: fromStage === 'ingest' ? (sourceKey || undefined) : undefined,
    });
  } catch (error) {
    // If queue send fails, revert the resource status
    await db
      .update(resources)
      .set({
        status: 'failed',
        currentJobId: null,
        processingStage: null,
        processingMetadata: null,
        updatedAt: new Date(),
      })
      .where(eq(resources.id, resourceId));

    // Delete the job we just created since it will never process
    await deleteJob(c.env.JOB_STATUS_KV, jobId);

    throw error;
  }

  // Only delete old job AFTER successful queue send
  // This prevents race condition where old job is deleted but new job fails to enqueue
  if (resource.currentJobId && resource.currentJobId !== jobId) {
    await deleteJob(c.env.JOB_STATUS_KV, resource.currentJobId);
  }

  const stageMessages: Record<typeof fromStage, string> = {
    ingest: 'Resource queued for full reprocessing',
    vision: 'Resource queued for vision re-analysis (skipping PDF extraction)',
    cleanup: 'Resource queued for markdown re-cleaning (skipping PDF extraction and vision analysis)',
    metadata: 'Resource queued for metadata regeneration (skipping PDF extraction, vision analysis, and markdown cleanup)',
    embed: 'Resource queued for re-embedding (skipping all previous stages)',
  };

  const response = {
    resourceId,
    jobId,
    status: 'queued',
    message: stageMessages[fromStage],
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

    // Convert Date objects to timestamps for proper JSON serialization
    const response = {
      ...updated,
      processedAt: updated.processedAt ? updated.processedAt.getTime() : null,
      createdAt: updated.createdAt ? updated.createdAt.getTime() : null,
      updatedAt: updated.updatedAt ? updated.updatedAt.getTime() : null,
    };

    return c.json(validateResponse(response, resourceSchema));
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
