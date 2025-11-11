/**
 * VISION Step - Analyze images with GPT-5 vision
 *
 * Calls the batch resource analysis step directly.
 * Note: Steps cannot call workflows, only other steps.
 */

import type { ProcessResourceInput } from '@/workflows/support/types';
import { analyzeBatchResourceStep } from '@/workflows/steps/vision/analyze-batch-resource.step';

export async function runVisionStage(input: ProcessResourceInput) {
  'use step';

  try {
    // Call the batch resource step directly
    const result = await analyzeBatchResourceStep({
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
