/**
 * ANALYZE Step - Re-run vision analysis on a single attachment
 */
'use step';

import { db } from '@/lib/db';
import { attachments } from '@/lib/db/schema/attachments';
import { eq } from 'drizzle-orm';
import type { ReanalyzeAttachmentInput } from '../types';

export async function analyzeAttachmentStep(input: ReanalyzeAttachmentInput) {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }

    // Get attachment
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, input.attachmentId))
      .limit(1);

    if (!attachment) {
      throw new Error(`Attachment ${input.attachmentId} not found`);
    }

    // Fetch image from blob storage using blobKey
    const { getBlob } = await import('@/lib/services/blob-storage');
    const buffer = await getBlob(attachment.blobKey);

    if (!buffer) {
      throw new Error(`Failed to fetch blob: ${attachment.blobKey}`);
    }

    // Run vision analysis
    const { analyzeImageQuality } = await import('@/lib/services/image-analysis');
    const analysis = await analyzeImageQuality(
      buffer,
      {
        pageNumber: attachment.pageNumber ?? 1,
        caption: attachment.caption ?? undefined,
      },
      OPENAI_API_KEY
    );

    // Update attachment with analysis results
    await db
      .update(attachments)
      .set({
        description: analysis.description || null,
        isGoodQuality: analysis.quality,
      })
      .where(eq(attachments.id, input.attachmentId));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
