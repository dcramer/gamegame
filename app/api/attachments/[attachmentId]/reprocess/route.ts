/**
 * Reprocess Attachment with Vision API
 * POST /api/attachments/:attachmentId/reprocess
 *
 * This is now a thin API wrapper around the unified analyze-images workflow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withAdmin, errorResponse, successResponse } from '@/lib/api/middleware';
import { analyzeImagesWorkflow } from '@/workflows/analyze-images';
import {
  createWorkflowRunRecord,
  updateWorkflowRunRecord,
} from '@/lib/services/workflow-run-store';

/**
 * POST /api/attachments/:attachmentId/reprocess
 * Reprocess attachment with GPT-5 vision analysis
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

    const runId = nanoid();

    await createWorkflowRunRecord({
      runId,
      workflowName: 'analyze-images',
      status: 'pending',
      attachmentId: attachment.id,
      gameId: attachment.gameId,
      metadata: {
        jobName: `Analyze ${attachment.originalFilename ?? attachment.id}`,
        stage: 'vision',
        mode: 'single-attachment',
      },
    });

    let workflowRun;
    try {
      workflowRun = await start(analyzeImagesWorkflow, [{
        runId,
        mode: 'single-attachment',
        attachmentId,
        gameId: attachment.gameId,
      }]);
    } catch (workflowError) {
      console.error('[POST attachments/:attachmentId/reprocess] Workflow error:', workflowError);
      const errorMessage =
        workflowError instanceof Error
          ? workflowError.message
          : 'Failed to start vision analysis workflow';
      return errorResponse(errorMessage, 500, 'WORKFLOW_ERROR');
    }

    await updateWorkflowRunRecord(runId, {
      externalRunId: workflowRun?.runId,
      status: 'running',
    });

    return successResponse({
      id: attachment.id,
      status: 'processing' as const,
      runId: workflowRun?.runId ?? runId,
      message: 'Image reanalysis started',
    });
  } catch (error) {
    console.error('[POST /api/attachments/:attachmentId/reprocess] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to reprocess attachment';

    return errorResponse(errorMessage, 500, 'INTERNAL_ERROR');
  }
});
