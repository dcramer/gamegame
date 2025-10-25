import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '@/types';
import { getDb, attachments } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { r2KeyToUrl } from '@/lib/services/r2-storage';
import { requireAdmin } from '@/middleware/auth';
import { analyzeImageWithVision } from '@/lib/services/vision';

const attachmentsRouter = new Hono<{ Bindings: Env }>();

/**
 * Safely parse bbox JSON string to number array
 * Returns undefined if parsing fails or result is invalid
 */
function parseBbox(bboxValue: string | null | undefined): number[] | undefined {
  if (!bboxValue) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(typeof bboxValue === 'string' ? bboxValue : String(bboxValue));
    // Validate it's an array of numbers
    if (Array.isArray(parsed) && parsed.every(v => typeof v === 'number')) {
      return parsed;
    }
    console.warn('Bbox is not an array of numbers:', parsed);
    return undefined;
  } catch (error) {
    console.error('Failed to parse bbox JSON:', error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

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
    .where(eq(attachments.id, attachmentId))
    .limit(1);

  if (!attachment) {
    return c.json({ error: 'Attachment not found' }, 404);
  }

  // Parse JSON strings back to arrays/objects and construct URL from R2 key
  const result = {
    ...attachment,
    url: r2KeyToUrl(attachment.r2Key),
    bbox: parseBbox(attachment.bbox),
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
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId))
    .orderBy(asc(attachments.pageNumber), asc(attachments.createdAt))
    .all();

  // Parse JSON strings back to arrays/objects and construct URLs from R2 keys
  const parsed = results.map((attachment) => ({
    ...attachment,
    url: r2KeyToUrl(attachment.r2Key),
    bbox: parseBbox(attachment.bbox),
  }));

  return c.json(parsed);
});

/**
 * Update attachment (admin only)
 */
attachmentsRouter.patch(
  '/:attachmentId',
  requireAdmin,
  zValidator(
    'json',
    z.object({
      description: z.string().optional().nullable(),
      originalFilename: z.string().optional().nullable(),
    })
  ),
  async (c) => {
    const { attachmentId } = c.req.param();
    const data = c.req.valid('json');
    const db = getDb(c.env.DB);

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
      return c.json({ error: 'Attachment not found' }, 404);
    }

    // Parse JSON strings back to arrays/objects and construct URL from R2 key
    const result = {
      ...updated,
      url: r2KeyToUrl(updated.r2Key),
      bbox: parseBbox(updated.bbox),
    };

    return c.json(result);
  }
);

/**
 * Reprocess attachment with vision analysis (admin only)
 */
attachmentsRouter.post('/:attachmentId/reprocess', requireAdmin, async (c) => {
  const { attachmentId } = c.req.param();
  const db = getDb(c.env.DB);

  // Fetch attachment details
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .limit(1);

  if (!attachment) {
    return c.json({ error: 'Attachment not found' }, 404);
  }

  try {
    // Validate r2Key exists
    if (!attachment.r2Key) {
      return c.json({ error: 'Attachment has no R2 key' }, 400);
    }

    // Fetch the image from R2 using the r2Key
    const r2Object = await c.env.FILES.get(attachment.r2Key);
    if (!r2Object) {
      return c.json({ error: 'Attachment not found in storage' }, 404);
    }

    const imageBuffer = await r2Object.arrayBuffer();

    // Validate buffer is not empty
    if (imageBuffer.byteLength === 0) {
      return c.json({ error: 'Attachment file is empty' }, 400);
    }

    // Convert to base64 using Workers-compatible method (not Node.js Buffer)
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

    // Validate OPENAI_API_KEY exists
    if (!c.env.OPENAI_API_KEY) {
      return c.json({ error: 'OpenAI API key not configured' }, 500);
    }

    // Run vision analysis (no context since we're reprocessing a single image)
    const analysis = await analyzeImageWithVision(
      base64Image,
      '', // No surrounding text available for single attachment
      c.env.OPENAI_API_KEY,
      undefined, // No context
      { imageId: attachmentId, pageNumber: attachment.pageNumber ?? undefined }
    );

    // Validate analysis result
    if (!analysis || typeof analysis.description !== 'string') {
      return c.json({ error: 'Vision analysis returned invalid result' }, 500);
    }

    // Update attachment with new description and quality
    const [updated] = await db
      .update(attachments)
      .set({
        description: analysis.description,
        isGoodQuality: analysis.isGoodQuality === 'good',
      })
      .where(eq(attachments.id, attachmentId))
      .returning();

    // Validate update succeeded
    if (!updated) {
      return c.json({ error: 'Failed to update attachment' }, 500);
    }

    // Parse JSON strings back to arrays/objects and construct URL from R2 key
    const result = {
      ...updated,
      url: r2KeyToUrl(updated.r2Key),
      bbox: parseBbox(updated.bbox),
    };

    return c.json(result);
  } catch (error) {
    console.error('Vision analysis failed:', error);
    return c.json(
      {
        error: 'Vision analysis failed',
        details: error instanceof Error ? error.message : String(error)
      },
      500
    );
  }
});

export default attachmentsRouter;
