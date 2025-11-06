/**
 * Reprocess Attachment with Vision API
 * POST /api/attachments/:attachmentId/reprocess
 *
 * This is now a thin API wrapper around the unified analyze-images workflow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withAdmin, errorResponse, successResponse } from '@/lib/api/middleware';
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
 * POST /api/attachments/:attachmentId/reprocess
 * Reprocess attachment with GPT-4o vision analysis
 */
export const POST = withAdmin(async (
  request: NextRequest,
  user,
  props?: { params: Promise<{ attachmentId: string }> }
) => {
  try {
    if (!props) {
      return errorResponse('Invalid request', 400, 'INVALID_REQUEST');
    }

    const params = await props.params;
    const { attachmentId } = params;

    // Get attachment from database
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (!attachment) {
      return errorResponse('Attachment not found', 404, 'NOT_FOUND');
    }

    // Only process images
    if (attachment.type !== 'image' || !attachment.mimeType?.startsWith('image/')) {
      return errorResponse('Only image attachments can be reprocessed with vision', 400, 'VALIDATION_ERROR');
    }

    // Call unified workflow in single-attachment mode
    await analyzeImagesWorkflow({
      mode: 'single-attachment',
      attachmentId,
      gameId: attachment.gameId,
    });

    // Fetch updated attachment
    const [updated] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (!updated) {
      return errorResponse('Failed to fetch updated attachment', 500, 'INTERNAL_ERROR');
    }

    // Get public URL
    const { blobKeyToUrl } = await import('@/lib/services/blob-storage');
    const responseData = {
      ...updated,
      url: updated.blobKey ? blobKeyToUrl(updated.blobKey) : null,
      bbox: parseBbox(updated.bbox),
    };

    return successResponse(responseData);
  } catch (error) {
    console.error('[POST /api/attachments/:attachmentId/reprocess] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to reprocess attachment';

    return errorResponse(errorMessage, 500, 'INTERNAL_ERROR');
  }
});
