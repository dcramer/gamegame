/**
 * Vercel Workflow for cleaning up orphaned blobs
 *
 * This workflow identifies and removes blobs that are no longer referenced
 * in the database. This happens when:
 * - Resource deletions fail to clean up blob storage
 * - Processing failures leave temporary files
 * - Attachment deletions fail to clean up storage
 *
 * The workflow compares blob storage contents against database references
 * and safely removes orphaned files.
 */

import { db } from '@/lib/db';
import { resources, attachments } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

// ==========================================
// Types
// ==========================================

export interface CleanupOrphanedBlobsResult {
  success: boolean;
  orphanedCount: number;
  deletedCount: number;
  failedDeletions: string[];
  error?: string;
}

interface BlobReference {
  type: 'resource' | 'attachment';
  blobKey: string;
  id: string;
}

// ==========================================
// Main Workflow
// ==========================================

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

// ==========================================
// Step 1: Collect Database References
// ==========================================

async function collectDatabaseReferences(): Promise<BlobReference[]> {
  'use step';

  const references: BlobReference[] = [];

  try {
    // Collect resource blob keys (source PDFs and structured data)
    const resourceRows = await db
      .select({
        id: resources.id,
      })
      .from(resources)
      .execute();

    for (const row of resourceRows) {
      // Source file: resources/{id}/source.pdf (or other extensions)
      references.push({
        type: 'resource',
        blobKey: `resources/${row.id}/source`,
        id: row.id,
      });

      // Structured data: resources/{id}/structured.json
      references.push({
        type: 'resource',
        blobKey: `resources/${row.id}/structured.json`,
        id: row.id,
      });
    }

    // Collect attachment blob keys
    const attachmentRows = await db
      .select({
        id: attachments.id,
        blobKey: attachments.blobKey,
      })
      .from(attachments)
      .execute();

    for (const row of attachmentRows) {
      references.push({
        type: 'attachment',
        blobKey: row.blobKey,
        id: row.id,
      });
    }

    console.log(`[Cleanup] Collected ${references.length} database references`);
    return references;
  } catch (error) {
    console.error('[Cleanup] Error collecting database references:', error);
    throw error;
  }
}

// ==========================================
// Step 2: List All Blobs
// ==========================================

async function listAllBlobs(): Promise<string[]> {
  'use step';

  try {
    const { listFiles } = await import('@/lib/services/blob-storage');

    // List all files under the resources/ prefix
    const blobs = await listFiles('resources/');

    console.log(`[Cleanup] Found ${blobs.length} blobs in storage`);
    return blobs;
  } catch (error) {
    console.error('[Cleanup] Error listing blobs:', error);
    throw error;
  }
}

// ==========================================
// Step 3: Identify Orphaned Blobs
// ==========================================

async function identifyOrphanedBlobs(
  references: BlobReference[],
  allBlobs: string[]
): Promise<string[]> {
  'use step';

  try {
    // Build a set of referenced blob key prefixes
    const referencedPrefixes = new Set<string>();

    for (const ref of references) {
      // For source files, we need to match any extension (source.pdf, source.docx, etc.)
      if (ref.blobKey.endsWith('/source')) {
        referencedPrefixes.add(ref.blobKey);
      } else {
        // For exact matches (structured.json, attachments)
        referencedPrefixes.add(ref.blobKey);
      }
    }

    // Filter blobs that are not referenced
    const orphanedBlobs: string[] = [];

    for (const blobKey of allBlobs) {
      let isReferenced = false;

      // Check if blob matches any reference
      for (const prefix of referencedPrefixes) {
        if (prefix.endsWith('/source')) {
          // Match source files with any extension: resources/{id}/source.*
          if (blobKey.startsWith(prefix + '.')) {
            isReferenced = true;
            break;
          }
        } else {
          // Exact match
          if (blobKey === prefix) {
            isReferenced = true;
            break;
          }
        }
      }

      if (!isReferenced) {
        orphanedBlobs.push(blobKey);
      }
    }

    console.log(`[Cleanup] Identified ${orphanedBlobs.length} orphaned blobs`);

    // Log sample of orphaned blobs for debugging
    if (orphanedBlobs.length > 0) {
      const sample = orphanedBlobs.slice(0, 5);
      console.log('[Cleanup] Sample orphaned blobs:', sample);
    }

    return orphanedBlobs;
  } catch (error) {
    console.error('[Cleanup] Error identifying orphaned blobs:', error);
    throw error;
  }
}

// ==========================================
// Step 4: Delete Orphaned Blobs
// ==========================================

async function deleteOrphanedBlobs(
  orphanedBlobs: string[]
): Promise<{ deletedCount: number; failedDeletions: string[] }> {
  'use step';

  if (orphanedBlobs.length === 0) {
    console.log('[Cleanup] No orphaned blobs to delete');
    return { deletedCount: 0, failedDeletions: [] };
  }

  try {
    const { bulkDelete } = await import('@/lib/services/blob-storage');

    console.log(`[Cleanup] Deleting ${orphanedBlobs.length} orphaned blobs`);

    const failedDeletions: string[] = [];
    let deletedCount = 0;

    // Delete in batches of 100 to avoid overwhelming the API
    const BATCH_SIZE = 100;
    for (let i = 0; i < orphanedBlobs.length; i += BATCH_SIZE) {
      const batch = orphanedBlobs.slice(i, i + BATCH_SIZE);

      try {
        await bulkDelete(batch);
        deletedCount += batch.length;
        console.log(`[Cleanup] Deleted batch ${i / BATCH_SIZE + 1}: ${batch.length} blobs`);
      } catch (error) {
        console.error('[Cleanup] Failed to delete batch:', error);
        failedDeletions.push(...batch);
      }
    }

    console.log(`[Cleanup] Deletion complete: ${deletedCount} deleted, ${failedDeletions.length} failed`);

    return { deletedCount, failedDeletions };
  } catch (error) {
    console.error('[Cleanup] Error deleting orphaned blobs:', error);
    throw error;
  }
}
