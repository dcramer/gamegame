/**
 * Cleanup Orphaned Blobs Workflow
 *
 * Identifies and removes blobs that are no longer referenced in the database.
 *
 * IMPORTANT: This file uses 'use workflow' directive and CANNOT import Node.js modules.
 */

import { collectDatabaseReferences } from '@/workflows/steps/blob-maintenance/collect-db-references.step';
import { listAllBlobs } from '@/workflows/steps/blob-maintenance/list-blobs.step';
import { identifyOrphanedBlobs } from '@/workflows/steps/blob-maintenance/identify-orphaned.step';
import { deleteOrphanedBlobs } from '@/workflows/steps/blob-maintenance/delete-orphaned.step';
import type { CleanupOrphanedBlobsResult } from '@/workflows/support/types';

export async function cleanupOrphanedBlobsWorkflow(): Promise<CleanupOrphanedBlobsResult> {
  'use workflow';

  // Step 1: Collect database references
  const dbReferences = await collectDatabaseReferences();

  // Step 2: List all blobs in storage
  const allBlobs = await listAllBlobs();

  // Step 3: Identify orphaned blobs
  const orphanedBlobs = await identifyOrphanedBlobs(dbReferences, allBlobs);

  // Step 4: Delete orphaned blobs
  const deleteResult = await deleteOrphanedBlobs(orphanedBlobs);

  return {
    success: deleteResult.failedDeletions.length === 0,
    orphanedCount: orphanedBlobs.length,
    deletedCount: deleteResult.deletedCount,
    failedDeletions: deleteResult.failedDeletions,
  };
}
