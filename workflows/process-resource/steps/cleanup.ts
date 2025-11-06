/**
 * CLEANUP Step - Clean markdown with LLM
 */

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ProcessResourceInput } from '../../shared/types';
import {
  parseMetadata,
  serializeMetadata,
  saveStructured,
  loadStructured,
} from '../../shared/helpers';

export async function runCleanupStage(input: ProcessResourceInput) {
  'use step';

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }

    const [resourceRow] = await db
      .select({
        metadata: resources.processingMetadata,
        currentRunId: resources.currentRunId,
      })
      .from(resources)
      .where(eq(resources.id, input.resourceId))
      .limit(1);

    if (!resourceRow) {
      throw new Error(`Resource ${input.resourceId} not found`);
    }

    if (resourceRow.currentRunId && resourceRow.currentRunId !== input.runId) {
      return {
        success: false,
        error: `Resource is being processed by different job: ${resourceRow.currentRunId}`,
      };
    }

    const metadata = parseMetadata(input.resourceId, resourceRow.metadata);
    if (metadata.stages.cleanup) {
      return { success: true };
    }

    const structured = await loadStructured(input.resourceId);

    const { cleanupMarkdownBatch } = await import('@/lib/services/markdown-cleanup');

    const cleanedPages = await cleanupMarkdownBatch(
      structured.pages.map((page) => ({
        markdown: page.markdown,
        pageNumber: page.pageNumber,
      })),
      OPENAI_API_KEY
    );

    structured.pages.forEach((page, index) => {
      page.markdown = cleanedPages[index];
    });

    await saveStructured(input.resourceId, structured);

    metadata.stages.cleanup = true;
    await db
      .update(resources)
      .set({
        processingStage: 'metadata',
        processingMetadata: serializeMetadata(metadata),
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
