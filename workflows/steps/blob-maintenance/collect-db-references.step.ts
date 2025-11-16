/**
 * Collect Database References Step
 */

'use step';

import { db } from '@/lib/db';
import { resources, attachments } from '@/lib/db/schema';
import type { BlobReference } from '@/workflows/support/types';

export async function collectDatabaseReferences(): Promise<BlobReference[]> {
  const references: BlobReference[] = [];

  try {
    const resourceRows = await db
      .select({
        id: resources.id,
      })
      .from(resources)
      .execute();

    for (const row of resourceRows) {
      references.push({
        type: 'resource',
        blobKey: `resources/${row.id}/source`,
        id: row.id,
      });

      references.push({
        type: 'resource',
        blobKey: `resources/${row.id}/structured.json`,
        id: row.id,
      });
    }

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
