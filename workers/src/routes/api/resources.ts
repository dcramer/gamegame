import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '@/types';
import { getDb, resources, fragments, attachments, games } from '@/lib/db';
import { eq, sql, asc } from 'drizzle-orm';
import { requireAdmin } from '@/middleware/auth';
import { createJob, deleteJob, getJob } from '@/lib/jobs/status';
import { extractR2KeyFromUrl, normalizeAttachmentUrl, normalizeResourceSourceUrl } from '@/lib/services/r2-storage';

const resourcesRouter = new Hono<{ Bindings: Env }>();

/**
 * Get job status for a resource
 */
resourcesRouter.get('/jobs/:jobId', async (c) => {
  const { jobId } = c.req.param();

  const job = await getJob(c.env.JOB_STATUS_KV, jobId);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json(job);
});

/**
 * List resources for a game
 */
resourcesRouter.get('/games/:gameId', async (c) => {
  const { gameId } = c.req.param();
  const db = getDb(c.env.DB);

  const resourceList = await db
    .select({
      id: resources.id,
      name: resources.name,
      originalFilename: resources.originalFilename,
      author: resources.author,
      attributionUrl: resources.attributionUrl,
      url: resources.url,
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
      fragmentCount: sql<number>`COUNT(${fragments.id})`,
    })
    .from(resources)
    .leftJoin(fragments, eq(resources.id, fragments.resourceId))
    .where(eq(resources.gameId, gameId))
    .groupBy(resources.id)
    .all();

  return c.json(
    resourceList.map((resource) => ({
      ...resource,
      url: normalizeResourceSourceUrl(resource.id, resource.url) ?? resource.url,
    }))
  );
});

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

  return c.json({
    ...resource,
    url: normalizeResourceSourceUrl(resource.id, resource.url) ?? resource.url,
    fragmentCount: Number(fragmentCount),
  });
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

  if (resource.currentJobId) {
    await deleteJob(c.env.JOB_STATUS_KV, resource.currentJobId);
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

  return c.json(
    {
      resourceId,
      jobId,
      status: 'queued',
      message: 'Resource queued for reprocessing',
    },
    202 // Accepted
  );
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

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.content !== undefined) {
      updateData.content = data.content;
    }
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
      url: attachments.url,
      mimeType: attachments.mimeType,
      originalFilename: attachments.originalFilename,
      pageNumber: attachments.pageNumber,
      bbox: attachments.bbox,
      caption: attachments.caption,
      width: attachments.width,
      height: attachments.height,
    })
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId))
    .orderBy(asc(attachments.pageNumber), asc(attachments.createdAt))
    .all();

  const parsed = attachmentList.map((attachment) => ({
    ...attachment,
    url: normalizeAttachmentUrl(resourceId, attachment.url) ?? attachment.url,
    bbox: attachment.bbox ? JSON.parse(attachment.bbox as string) : undefined,
  }));

  return c.json(parsed);
});

/**
 * Delete resource (admin only)
 */
resourcesRouter.delete('/:resourceId', requireAdmin, async (c) => {
  const { resourceId } = c.req.param();
  const db = getDb(c.env.DB);

  // Get fragment IDs for Vectorize cleanup
  const fragmentList = await db
    .select({ id: fragments.id })
    .from(fragments)
    .where(eq(fragments.resourceId, resourceId))
    .all();

  // Get attachment URLs for R2 cleanup
  const attachmentList = await db
    .select({ url: attachments.url })
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId))
    .all();

  // Delete from D1 (cascades to fragments and attachments)
  await db.delete(resources).where(eq(resources.id, resourceId));

  // Delete from Vectorize
  if (fragmentList.length > 0) {
    const fragmentIds = fragmentList.map((f) => f.id);
    await c.env.VECTORIZE.deleteByIds(fragmentIds);
  }

  // Delete from R2
  const { deleteResourceFiles } = await import('@/lib/services/r2-storage');
  const deletedR2Count = await deleteResourceFiles(c.env.FILES, resourceId);
  console.log(`[Delete] Deleted ${deletedR2Count} files from R2`);

  return c.json({
    success: true,
    deletedFragments: fragmentList.length,
    deletedAttachments: attachmentList.length,
    deletedR2Files: deletedR2Count,
  });
});

export default resourcesRouter;
