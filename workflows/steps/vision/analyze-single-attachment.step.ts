/**
 * SINGLE ATTACHMENT Step - Analyze one attachment
 */
'use step';

import { db } from '@/lib/db';
import { attachments } from '@/lib/db/schema/attachments';
import { eq } from 'drizzle-orm';
import { fetchImageStep } from '@/workflows/steps/vision/fetch-image.step';
import { analyzeImageStep } from '@/workflows/steps/vision/analyze-image.step';
import { updateAttachmentStep } from '@/workflows/steps/attachments/update-attachment.step';

export interface SingleAttachmentInput {
  attachmentId: string;
}

export interface SingleAttachmentResult {
  success: boolean;
  error?: string;
}

export async function analyzeSingleAttachmentStep(
  input: SingleAttachmentInput
): Promise<SingleAttachmentResult> {
  try {
    // Get attachment from database
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, input.attachmentId))
      .limit(1);

    if (!attachment) {
      return {
        success: false,
        error: `Attachment ${input.attachmentId} not found`,
      };
    }

    // Fetch image buffer
    const fetchResult = await fetchImageStep({
      source: { type: 'blobKey', blobKey: attachment.blobKey },
    });

    if (!fetchResult.success || !fetchResult.buffer) {
      return {
        success: false,
        error: fetchResult.error || 'Failed to fetch image',
      };
    }

    // Analyze image
    const analysisResult = await analyzeImageStep({
      buffer: fetchResult.buffer,
      context: {
        pageNumber: attachment.pageNumber ?? 1,
        caption: attachment.caption ?? undefined,
        // Note: we don't have gameName or section here, could fetch from resource if needed
      },
    });

    if (!analysisResult.success || !analysisResult.analysis) {
      return {
        success: false,
        error: analysisResult.error || 'Failed to analyze image',
      };
    }

    // Update attachment with results
    const updateResult = await updateAttachmentStep({
      attachmentId: input.attachmentId,
      analysis: analysisResult.analysis,
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: updateResult.error || 'Failed to update attachment',
      };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
