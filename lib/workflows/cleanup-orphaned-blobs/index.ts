/**
 * Cleanup Orphaned Blobs Workflow
 *
 * Identifies and removes blobs that are no longer referenced in the database.
 *
 * IMPORTANT: This file uses 'use workflow' directive and CANNOT import Node.js modules.
 */

import { collectDatabaseReferences } from './steps/collect-db-references';
import { listAllBlobs } from './steps/list-blobs';
import { identifyOrphanedBlobs } from './steps/identify-orphaned';
import { deleteOrphanedBlobs } from './steps/delete-orphaned';
import type { CleanupOrphanedBlobsResult } from '../shared/types';

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
