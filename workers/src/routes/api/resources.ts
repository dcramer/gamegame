import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '@/types';
import { getDb, resources, fragments, attachments, games } from '@/lib/db';
import { eq, sql, asc } from 'drizzle-orm';
import { requireAdmin } from '@/middleware/auth';
import { createJob, getJob } from '@/lib/jobs/status';

const resourcesRouter = new Hono<{ Bindings: Env }>();

/**
 * Upload a PDF resource (queues for processing)
 */
resourcesRouter.post(
  '/upload',
  requireAdmin,
  zValidator(
    'json',
    z.object({
      gameId: z.string(),
      name: z.string().min(1),
      url: z.string().url(),
    })
  ),
  async (c) => {
    const data = c.req.valid('json');
    const db = getDb(c.env.DB);

    // Fetch game name for vision analysis context
    const [game] = await db
      .select({ name: games.name })
      .from(games)
      .where(eq(games.id, data.gameId))
      .limit(1);

    if (!game) {
      return c.json({ error: 'Game not found' }, 404);
    }

    // Create resource record (empty content initially)
    const resourceId = crypto.randomUUID();

    await db
      .insert(resources)
      .values({
        id: resourceId,
        gameId: data.gameId,
        name: data.name,
        url: data.url,
        content: '',
        version: 0,
        pdfExtractor: 'mistral',
        pageCount: null,
        imageCount: 0,
        wordCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Create job and enqueue for processing
    const jobId = await createJob(c.env.JOB_STATUS_KV, resourceId, data.gameId);

    await c.env.RESOURCE_QUEUE.send({
      jobId,
      resourceId,
      gameId: data.gameId,
      name: data.name,
      url: data.url,
      gameName: game.name, // Include game name for vision analysis
    });

    return c.json(
      {
        resourceId,
        jobId,
        status: 'queued',
        message: 'Resource queued for processing',
      },
      202 // Accepted
    );
  }
);

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
      url: resources.url,
      version: resources.version,
      pdfExtractor: resources.pdfExtractor,
      processedAt: resources.processedAt,
      pageCount: resources.pageCount,
      imageCount: resources.imageCount,
      wordCount: resources.wordCount,
      fragmentCount: sql<number>`COUNT(${fragments.id})`,
    })
    .from(resources)
    .leftJoin(fragments, eq(resources.id, fragments.resourceId))
    .where(eq(resources.gameId, gameId))
    .groupBy(resources.id)
    .all();

  return c.json(resourceList);
});

/**
 * Get attachments for a resource
 */
resourcesRouter.get('/:resourceId/attachments', async (c) => {
  const { resourceId } = c.req.param();
  const db = getDb(c.env.DB);

  const results = await db
    .select({
      id: attachments.id,
      resourceId: attachments.resourceId,
      type: attachments.type,
      url: attachments.url,
      mimeType: attachments.mimeType,
      originalFilename: attachments.originalFilename,
      pageNumber: attachments.pageNumber,
      bbox: attachments.bbox,
      caption: attachments.caption,
      width: attachments.width,
      height: attachments.height,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId))
    .orderBy(asc(attachments.pageNumber), asc(attachments.createdAt))
    .all();

  // Parse JSON strings back to arrays/objects
  const parsed = results.map((attachment) => ({
    ...attachment,
    bbox: attachment.bbox ? JSON.parse(attachment.bbox as string) : undefined,
  }));

  return c.json(parsed);
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
      url: resources.url,
      content: resources.content,
      version: resources.version,
      pdfExtractor: resources.pdfExtractor,
      processedAt: resources.processedAt,
      pageCount: resources.pageCount,
      imageCount: resources.imageCount,
      wordCount: resources.wordCount,
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

  // Delete existing fragments and attachments from D1
  await db.delete(fragments).where(eq(fragments.resourceId, resourceId));
  await db.delete(attachments).where(eq(attachments.resourceId, resourceId));

  // Delete from Vectorize
  if (fragmentList.length > 0) {
    const fragmentIds = fragmentList.map((f) => f.id);
    await c.env.VECTORIZE.deleteByIds(fragmentIds);
  }

  // Delete from R2
  const { deleteAttachmentsByUrls } = await import('@/lib/services/r2-storage');
  const deletedR2Count = await deleteAttachmentsByUrls(
    c.env.FILES,
    attachmentList.map((a) => a.url)
  );
  console.log(`[Reprocess] Deleted ${deletedR2Count} files from R2`);

  // Reset resource to empty state
  await db
    .update(resources)
    .set({
      content: '',
      version: 0,
      pageCount: null,
      imageCount: 0,
      wordCount: 0,
      processedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(resources.id, resourceId));

  // Fetch game name for vision analysis context
  const [game] = await db
    .select({ name: games.name })
    .from(games)
    .where(eq(games.id, resource.gameId))
    .limit(1);

  // Create new job and enqueue for processing
  const jobId = await createJob(c.env.JOB_STATUS_KV, resourceId, resource.gameId);

  await c.env.RESOURCE_QUEUE.send({
    jobId,
    resourceId,
    gameId: resource.gameId,
    name: resource.name,
    url: resource.url,
    gameName: game?.name, // Include game name for vision analysis
  });

  return c.json(
    {
      resourceId,
      jobId,
      status: 'queued',
      message: 'Resource queued for reprocessing',
      deletedFragments: fragmentList.length,
      deletedAttachments: attachmentList.length,
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
    .orderBy(attachments.pageNumber, attachments.id)
    .all();

  return c.json(attachmentList);
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
  const { deleteAttachmentsByUrls } = await import('@/lib/services/r2-storage');
  const deletedR2Count = await deleteAttachmentsByUrls(
    c.env.FILES,
    attachmentList.map((a) => a.url)
  );
  console.log(`[Delete] Deleted ${deletedR2Count} files from R2`);

  return c.json({
    success: true,
    deletedFragments: fragmentList.length,
    deletedAttachments: attachmentList.length,
    deletedR2Files: deletedR2Count,
  });
});

export default resourcesRouter;
