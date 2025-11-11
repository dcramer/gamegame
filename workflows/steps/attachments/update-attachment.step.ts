/**
 * UPDATE ATTACHMENT Step - Update attachment with analysis results
 *
 * Shared step that updates the attachments table with full analysis fields.
 * Ensures consistent field updates across all workflows.
 */
'use step';

import { db } from '@/lib/db';
import { attachments } from '@/lib/db/schema/attachments';
import { eq } from 'drizzle-orm';
import type { ImageAnalysisResult } from '@/lib/services/image-analysis';

export interface UpdateAttachmentInput {
  attachmentId: string;
  analysis: ImageAnalysisResult;
}

export interface UpdateAttachmentResult {
  success: boolean;
  error?: string;
}

export async function updateAttachmentStep(
  input: UpdateAttachmentInput
): Promise<UpdateAttachmentResult> {
  try {
    await db
      .update(attachments)
      .set({
        description: input.analysis.description || null,
        isGoodQuality: input.analysis.quality,
        isRelevant: input.analysis.relevant ? 1 : 0,
        detectedType: input.analysis.type,
        ocrText: input.analysis.ocrText || null,
      })
      .where(eq(attachments.id, input.attachmentId));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
