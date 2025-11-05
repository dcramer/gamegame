/**
 * Reprocess Attachment with Vision API
 * POST /api/attachments/:attachmentId/reprocess
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/helpers';
import { analyzeImageQuality } from '@/lib/services/image-analysis';
import { env } from '@/lib/env.mjs';

/**
 * Helper to fetch image from URL (supports both Vercel Blob and local storage)
 */
async function fetchImageBuffer(url: string): Promise<Buffer> {
  // If URL is relative and we're using local storage, read from filesystem
  if (url.startsWith('/') && !env.BLOB_READ_WRITE_TOKEN) {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const filePath = path.join(process.cwd(), 'public', url);
    try {
      return await readFile(filePath);
    } catch (error) {
      throw new Error(
        `Failed to read file from local storage at "${filePath}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Otherwise fetch from URL
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from "${url}": ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

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
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ attachmentId: string }> }
) {
  try {
    // Require admin authentication
    await requireAdmin();

    const params = await props.params;
    const { attachmentId } = params;

    // Get attachment from database
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Only process images
    if (attachment.type !== 'image' || !attachment.mimeType?.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image attachments can be reprocessed with vision' },
        { status: 400 }
      );
    }

    // Fetch image data
    const imageBuffer = await fetchImageBuffer(attachment.url);

    // Analyze with vision
    const result = await analyzeImageQuality(
      imageBuffer,
      {
        pageNumber: attachment.pageNumber || 1,
        section: undefined,
        caption: attachment.caption || undefined,
      },
      env.OPENAI_API_KEY
    );

    // Update attachment with new analysis
    const [updated] = await db
      .update(attachments)
      .set({
        description: result.description,
        isGoodQuality: result.quality,
        isRelevant: result.relevant ? 1 : 0,
        detectedType: result.type,
        ocrText: result.ocrText || null,
      })
      .where(eq(attachments.id, attachmentId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update attachment' }, { status: 500 });
    }

    // Get public URL
    const { blobKeyToUrl } = await import('@/lib/services/blob-storage');
    const responseData = {
      ...updated,
      url: updated.blobKey ? blobKeyToUrl(updated.blobKey) : null,
      bbox: parseBbox(updated.bbox),
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('[POST /api/attachments/:attachmentId/reprocess] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to reprocess attachment';

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
