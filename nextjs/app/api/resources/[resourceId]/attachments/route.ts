/**
 * Resource Attachments API Route
 * GET /api/resources/:resourceId/attachments - Get all attachments for a resource
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { attachments } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

/**
 * GET /api/resources/:resourceId/attachments
 * Get all attachments for a resource
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { resourceId: string } }
) {
  try {
    const { resourceId } = params;

    const attachmentList = await db
      .select({
        id: attachments.id,
        type: attachments.type,
        blobKey: attachments.blobKey,
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
      .orderBy(asc(attachments.pageNumber), asc(attachments.createdAt));

    // Helper to safely parse bbox JSON
    const parseBbox = (bboxValue: any): number[] | undefined => {
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
    };

    // Get public URLs for attachments
    const { blobKeyToUrl } = await import('@/lib/services/blob-storage');
    const parsed = attachmentList.map((attachment) => ({
      ...attachment,
      url: attachment.blobKey ? blobKeyToUrl(attachment.blobKey) : null,
      bbox: parseBbox(attachment.bbox),
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('[GET /api/resources/:resourceId/attachments] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attachments' },
      { status: 500 }
    );
  }
}
