/**
 * FINALIZE Step - Mark resource as ready
 */

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ProcessResourceInput } from '@/workflows/support/types';

export async function runFinalizeStage(input: ProcessResourceInput) {
  'use step';

  try {
    await db
      .update(resources)
      .set({
        status: 'ready',
        processingStage: 'ready',
        processingMetadata: null,
        currentRunId: null,
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
