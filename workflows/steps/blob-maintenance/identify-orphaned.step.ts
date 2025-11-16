/**
 * Identify Orphaned Blobs Step
 */

'use step';

import type { BlobReference } from '@/workflows/support/types';

export async function identifyOrphanedBlobs(
  references: BlobReference[],
  allBlobs: string[]
): Promise<string[]> {
  try {
    const referencedPrefixes = new Set<string>();

    for (const ref of references) {
      if (ref.blobKey.endsWith('/source')) {
        referencedPrefixes.add(ref.blobKey);
      } else {
        referencedPrefixes.add(ref.blobKey);
      }
    }

    const orphanedBlobs: string[] = [];

    for (const blobKey of allBlobs) {
      let isReferenced = false;

      for (const prefix of referencedPrefixes) {
        if (prefix.endsWith('/source')) {
          if (blobKey.startsWith(prefix + '.')) {
            isReferenced = true;
            break;
          }
        } else {
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
