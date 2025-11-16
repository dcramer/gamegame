/**
 * Delete Orphaned Blobs Step
 */

'use step';

export async function deleteOrphanedBlobs(
  orphanedBlobs: string[]
): Promise<{ deletedCount: number; failedDeletions: string[] }> {
  if (orphanedBlobs.length === 0) {
    console.log('[Cleanup] No orphaned blobs to delete');
    return { deletedCount: 0, failedDeletions: [] };
  }

  try {
    const { bulkDelete } = await import('@/lib/services/blob-storage');

    console.log(`[Cleanup] Deleting ${orphanedBlobs.length} orphaned blobs`);

    const failedDeletions: string[] = [];
    let deletedCount = 0;

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
