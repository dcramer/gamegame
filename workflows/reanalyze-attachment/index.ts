/**
 * Reanalyze Attachment Workflow
 *
 * Re-runs vision analysis on a single attachment to update its description and quality rating.
 */
'use workflow';

import type { ReanalyzeAttachmentInput } from './types';
import { analyzeAttachmentStep } from './steps/analyze';

export async function reanalyzeAttachmentWorkflow(input: ReanalyzeAttachmentInput) {
  // Step 1: Analyze the attachment with vision API
  const result = await analyzeAttachmentStep(input);

  if (!result.success) {
    throw new Error(result.error || 'Failed to analyze attachment');
  }

  return {
    success: true,
    attachmentId: input.attachmentId,
  };
}
