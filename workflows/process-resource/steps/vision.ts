/**
 * VISION Step - Analyze images with GPT-4o vision
 *
 * Calls the batch resource analysis step directly.
 * Note: Steps cannot call workflows, only other steps.
 */

import type { ProcessResourceInput } from '../../shared/types';
import { analyzeBatchResourceStep } from '../../analyze-images/steps/batch-resource';

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
