/**
 * VISION Step - Analyze images with GPT-4o vision
 *
 * This is now a thin wrapper around the unified analyze-images workflow.
 * The actual logic has been moved to workflows/analyze-images for reusability.
 */

import type { ProcessResourceInput } from '../../shared/types';
import { analyzeImagesWorkflow } from '../../analyze-images';

export async function runVisionStage(input: ProcessResourceInput) {
  'use step';

  try {
    // Call unified workflow in batch-resource mode
    const result = await analyzeImagesWorkflow({
      mode: 'batch-resource',
      resourceId: input.resourceId,
      gameName: input.gameName,
      runId: input.runId,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to analyze images',
      };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
