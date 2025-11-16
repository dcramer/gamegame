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
import { completeWorkflowRun, failWorkflowRun, recordWorkflowStage } from '@/lib/services/workflow-run-store';

export interface SingleAttachmentInput {
  attachmentId: string;
  runId?: string;
}

export interface SingleAttachmentResult {
  success: boolean;
  error?: string;
}

export async function analyzeSingleAttachmentStep(
  input: SingleAttachmentInput
): Promise<SingleAttachmentResult> {
  try {
    await recordWorkflowStage(input.runId, 'vision', {
      attachmentId: input.attachmentId,
      status: 'Analyzing attachment',
    });

    // Get attachment from database
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, input.attachmentId))
      .limit(1);

    if (!attachment) {
      await failWorkflowRun(input.runId, `Attachment ${input.attachmentId} not found`, {
        attachmentId: input.attachmentId,
        stage: 'vision',
      });
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
      const error = fetchResult.error || 'Failed to fetch image';
      await failWorkflowRun(input.runId, error, {
        attachmentId: input.attachmentId,
        stage: 'vision',
      });
      return {
        success: false,
        error,
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
      const error = analysisResult.error || 'Failed to analyze image';
      await failWorkflowRun(input.runId, error, {
        attachmentId: input.attachmentId,
        stage: 'vision',
      });
      return {
        success: false,
        error,
      };
    }

    // Update attachment with results
    const updateResult = await updateAttachmentStep({
      attachmentId: input.attachmentId,
      analysis: analysisResult.analysis,
    });

    if (!updateResult.success) {
      const error = updateResult.error || 'Failed to update attachment';
      await failWorkflowRun(input.runId, error, {
        attachmentId: input.attachmentId,
        stage: 'vision',
      });
      return {
        success: false,
        error,
      };
    }

    await completeWorkflowRun(input.runId, {
      attachmentId: input.attachmentId,
      message: 'Attachment analysis complete',
      stage: 'vision',
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await failWorkflowRun(input.runId, errorMessage, {
      attachmentId: input.attachmentId,
      stage: 'vision',
    });
    return {
      success: false,
      error: errorMessage,
    };
  }
}
