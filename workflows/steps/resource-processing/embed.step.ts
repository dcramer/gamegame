/**
 * EMBED Step - Generate embeddings for search
 */

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ProcessResourceInput } from '@/workflows/support/types';
import {
  parseMetadata,
  serializeMetadata,
  loadStructured,
} from '@/workflows/support/helpers';
import { recordWorkflowStage } from '@/lib/services/workflow-run-store';

export async function runEmbedStage(input: ProcessResourceInput) {
  'use step';

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }

    await recordWorkflowStage(input.runId, 'embed', {
      status: 'Generating embeddings',
    });

    // Use transaction with row-level locking to prevent race conditions
    const result = await db.transaction(async (tx) => {
      // Lock the row for this transaction
      const [resourceRow] = await tx
        .select({
          metadata: resources.processingMetadata,
          currentRunId: resources.currentRunId,
        })
        .from(resources)
        .where(eq(resources.id, input.resourceId))
        .limit(1)
        .for('update');

      if (!resourceRow) {
        throw new Error(`Resource ${input.resourceId} not found`);
      }

      // Set currentRunId immediately within the transaction
      await tx
        .update(resources)
        .set({
          currentRunId: input.runId,
          updatedAt: Date.now(),
        })
        .where(eq(resources.id, input.resourceId));

      return { success: true };
    });

    if (!result.success) {
      return result;
    }

    const structured = await loadStructured(input.resourceId);

    // Run the complex EMBED stage implementation
    const { runEmbedStageImpl } = await import('@/workflows/steps/resource-processing/embed-stage.impl');
    await runEmbedStageImpl(input, structured);

    await recordWorkflowStage(input.runId, 'embed', {
      status: 'Embeddings generated',
    });

    const metadata = parseMetadata(input.resourceId, null);
    await db
      .update(resources)
      .set({
        processingStage: 'finalize',
        processingMetadata: serializeMetadata(metadata),
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[EMBED Stage] Error:', error);
    return { success: false, error: errorMessage };
  }
}
