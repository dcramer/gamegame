'use workflow';

import { pruneWorkflowRunsStep } from '@/workflows/steps/workflow-runs/prune.step';

export async function cleanupWorkflowRunsWorkflow() {
  return await pruneWorkflowRunsStep();
}
