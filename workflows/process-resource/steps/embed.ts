/**
 * EMBED Step - Generate embeddings for search
 */

import { db } from '@/lib/db';
import { jobs, resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ProcessResourceInput } from '../../shared/types';
import { parseMetadata, serializeMetadata, loadStructured } from '../../shared/helpers';

export async function runEmbedStage(input: ProcessResourceInput) {
  'use step';

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }

    const [resourceRow] = await db
      .select({
        metadata: resources.processingMetadata,
        currentJobId: resources.currentJobId,
      })
      .from(resources)
      .where(eq(resources.id, input.resourceId))
      .limit(1);

    if (!resourceRow) {
      throw new Error(`Resource ${input.resourceId} not found`);
    }

    if (resourceRow.currentJobId && resourceRow.currentJobId !== input.jobId) {
      return {
        success: false,
        error: `Resource is being processed by different job: ${resourceRow.currentJobId}`,
      };
    }

    const metadata = parseMetadata(input.resourceId, resourceRow.metadata);
    if (metadata.stages.embed) {
      return { success: true };
    }

    await db
      .update(jobs)
      .set({
        currentStep: 'Embedding content',
        progress: 75,
      })
      .where(eq(jobs.id, input.jobId));

    const structured = await loadStructured(input.resourceId);

    // Run the complex EMBED stage implementation
    const { runEmbedStageImpl } = await import('@/workflows/embed-stage');
    await runEmbedStageImpl(input, structured);

    metadata.stages.embed = true;
    await db
      .update(resources)
      .set({
        processingStage: 'finalize',
        processingMetadata: serializeMetadata(metadata),
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));

    await db
      .update(jobs)
      .set({
        currentStep: 'Finalizing resource',
        progress: 85,
      })
      .where(eq(jobs.id, input.jobId));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[EMBED Stage] Error:', error);
    return { success: false, error: errorMessage };
  }
}
