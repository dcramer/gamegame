import { Hono } from 'hono';
import type { Env } from '@/types';
import { getDb, attachments } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { normalizeAttachmentUrl } from '@/lib/services/r2-storage';

const attachmentsRouter = new Hono<{ Bindings: Env }>();

/**
 * Get single attachment by ID
 */
attachmentsRouter.get('/:attachmentId', async (c) => {
  const { attachmentId } = c.req.param();
  const db = getDb(c.env.DB);

  const [attachment] = await db
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
    })
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .limit(1);

  if (!attachment) {
    return c.json({ error: 'Attachment not found' }, 404);
  }

  // Parse JSON strings back to arrays/objects
  const result = {
    ...attachment,
    url: normalizeAttachmentUrl(attachment.resourceId, attachment.url) ?? attachment.url,
    bbox: attachment.bbox ? JSON.parse(attachment.bbox as string) : undefined,
  };

  return c.json(result);
});

/**
 * Get all attachments for a resource
 */
attachmentsRouter.get('/resources/:resourceId', async (c) => {
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
    url: normalizeAttachmentUrl(attachment.resourceId, attachment.url) ?? attachment.url,
    bbox: attachment.bbox ? JSON.parse(attachment.bbox as string) : undefined,
  }));

  return c.json(parsed);
});

export default attachmentsRouter;
