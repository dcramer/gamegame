import { pruneWorkflowRunsStep } from '@/workflows/steps/workflow-runs/prune.step';

export async function cleanupWorkflowRunsWorkflow() {
  'use workflow';

  return await pruneWorkflowRunsStep();
}
