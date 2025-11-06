/**
 * METADATA Step - Generate resource name and description
 */

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ProcessResourceInput } from '../../shared/types';
import {
  parseMetadata,
  serializeMetadata,
  loadStructured,
} from '../../shared/helpers';

export async function runMetadataStage(input: ProcessResourceInput) {
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
        name: resources.name,
        originalFilename: resources.originalFilename,
        description: resources.description,
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
    if (metadata.stages.metadata) {
      return { success: true };
    }

    const structured = await loadStructured(input.resourceId);
    const { rebuildMarkdownFromPages } = await import('@/lib/pdf');
    const markdownContent = rebuildMarkdownFromPages(structured);

    const { generateResourceMetadata } = await import('@/lib/services/resource-metadata');
    const metadataResult = await generateResourceMetadata(markdownContent, OPENAI_API_KEY, {
      existingName: resourceRow.name,
      originalFilename: resourceRow.originalFilename,
    });

    const resolvedName = metadataResult?.name ?? resourceRow.name ?? input.name;
    const resolvedDescription = metadataResult?.description ?? resourceRow.description ?? null;

    metadata.stages.metadata = true;
    await db
      .update(resources)
      .set({
        name: resolvedName,
        description: resolvedDescription,
        processingStage: 'embed',
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
