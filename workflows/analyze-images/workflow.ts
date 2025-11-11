/**
 * Analyze Images Workflow
 *
 * Unified workflow for image analysis that supports two modes:
 * 1. single-attachment: Analyze one attachment and update database
 * 2. batch-resource: Analyze all images in a resource during PDF processing
 *
 * This consolidates the logic from:
 * - workflows/reanalyze-attachment (deprecated)
 * - workflows/steps/resource-processing/vision.step.ts (now calls this)
 * - app/api/attachments/[id]/reprocess (now calls this)
 */
'use workflow';

import type { AnalyzeImagesInput, AnalyzeImagesResult } from './workflow.types';
import { analyzeSingleAttachmentStep } from '@/workflows/steps/vision/analyze-single-attachment.step';
import { analyzeBatchResourceStep } from '@/workflows/steps/vision/analyze-batch-resource.step';

export async function analyzeImagesWorkflow(input: AnalyzeImagesInput): Promise<AnalyzeImagesResult> {
  if (input.mode === 'single-attachment') {
    // Mode 1: Reanalyze a single attachment
    if (!input.attachmentId) {
      throw new Error('attachmentId is required for single-attachment mode');
    }

    const result = await analyzeSingleAttachmentStep({
      attachmentId: input.attachmentId,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to analyze attachment');
    }

    return {
      success: true,
      mode: 'single-attachment',
      attachmentId: input.attachmentId,
    };
  } else if (input.mode === 'batch-resource') {
    // Mode 2: Analyze all images in a resource
    if (!input.resourceId || !input.gameName) {
      throw new Error('resourceId and gameName are required for batch-resource mode');
    }

    const result = await analyzeBatchResourceStep({
      resourceId: input.resourceId,
      gameName: input.gameName,
      runId: input.runId,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to analyze resource images');
    }

    return {
      success: true,
      mode: 'batch-resource',
      resourceId: input.resourceId,
      imagesProcessed: result.imagesProcessed,
    };
  } else {
    throw new Error(`Invalid mode: ${input.mode}`);
  }
}

// Export types for consumers
export type { AnalyzeImagesInput, AnalyzeImagesResult, AnalyzeImagesMode } from './workflow.types';
