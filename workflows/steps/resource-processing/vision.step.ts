/**
 * VISION Step - Analyze images with GPT-5 vision
 *
 * Calls the batch resource analysis step directly.
 * Note: Steps cannot call workflows, only other steps.
 */

'use step';

import type { ProcessResourceInput } from '@/workflows/support/types';
import { analyzeBatchResourceStep } from '@/workflows/steps/vision/analyze-batch-resource.step';
import { recordWorkflowStage } from '@/lib/services/workflow-run-store';

export async function runVisionStage(input: ProcessResourceInput) {
  try {
    await recordWorkflowStage(input.runId, 'vision', {
      status: 'Analyzing resource images',
      resourceId: input.resourceId,
    });

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
