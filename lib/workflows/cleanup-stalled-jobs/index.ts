/**
 * Cleanup Stalled Jobs Workflow
 *
 * Identifies jobs that have been stuck in 'processing' state
 * for more than 30 minutes and marks them as failed.
 *
 * IMPORTANT: This file uses 'use workflow' directive and CANNOT import Node.js modules.
 */

import { findStalledJobs } from './steps/find-stalled-jobs';
import { markJobsAsFailed } from './steps/mark-jobs-failed';
import type { CleanupStalledJobsResult } from '../shared/types';

export async function cleanupStalledJobsWorkflow(): Promise<CleanupStalledJobsResult> {
  'use workflow';

  // Step 1: Find stalled jobs
  const stalledJobs = await findStalledJobs();

  if (stalledJobs.length === 0) {
    return {
      success: true,
      totalJobs: 0,
      stalledJobs: 0,
      cleanedJobs: 0,
      failedUpdates: 0,
      errors: [],
    };
  }

  // Step 2: Mark jobs as failed
  const cleanupResult = await markJobsAsFailed(stalledJobs);

  return {
    success: cleanupResult.failedUpdates === 0,
    totalJobs: stalledJobs.length,
    stalledJobs: stalledJobs.length,
    cleanedJobs: cleanupResult.cleanedJobs,
    failedUpdates: cleanupResult.failedUpdates,
    errors: cleanupResult.errors,
  };
}
