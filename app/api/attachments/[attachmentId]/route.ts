/**
 * Individual Attachment API Routes
 * GET /api/attachments/:attachmentId - Get single attachment
 * PATCH /api/attachments/:attachmentId - Update attachment (admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/helpers';

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
 * GET /api/attachments/:attachmentId
 * Get single attachment by ID
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const params = await props.params;
    const { attachmentId } = params;

    const [attachment] = await db
      .select({
        id: attachments.id,
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
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (!attachment) {
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      );
    }

    // Get public URL
    const { blobKeyToUrl } = await import('@/lib/services/blob-storage');
    const result = {
      ...attachment,
      url: attachment.blobKey ? blobKeyToUrl(attachment.blobKey) : null,
      bbox: parseBbox(attachment.bbox),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/attachments/:attachmentId] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attachment' },
      { status: 500 }
    );
  }
}

const updateAttachmentSchema = z.object({
  description: z.string().optional().nullable(),
  originalFilename: z.string().optional().nullable(),
});

/**
 * PATCH /api/attachments/:attachmentId
 * Update attachment metadata (admin only)
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ attachmentId: string }> }
) {
  try {
    // Require admin authentication
    await requireAdmin();

    const params = await props.params;
    const { attachmentId } = params;
    const body = await request.json();
    const data = updateAttachmentSchema.parse(body);

    const updateData: any = {};

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
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      );
    }

    // Get public URL
    const { blobKeyToUrl } = await import('@/lib/services/blob-storage');
    const result = {
      ...updated,
      url: updated.blobKey ? blobKeyToUrl(updated.blobKey) : null,
      bbox: parseBbox(updated.bbox),
    };

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('[PATCH /api/attachments/:attachmentId] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update attachment' },
      { status: 500 }
    );
  }
}
