/**
 * METADATA Step - Generate resource name and description
 */

'use step';

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

export async function runMetadataStage(input: ProcessResourceInput) {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }

    await recordWorkflowStage(input.runId, 'metadata', {
      status: 'Generating resource metadata',
    });

    // Use transaction with row-level locking to prevent race conditions
    const result = await db.transaction(async (tx) => {
      // Lock the row for this transaction
      const [resourceRow] = await tx
        .select({
          metadata: resources.processingMetadata,
          currentRunId: resources.currentRunId,
          name: resources.name,
          originalFilename: resources.originalFilename,
          description: resources.description,
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

      return { success: true, resourceRow };
    });

    if (!result.success) {
      return result;
    }

    const structured = await loadStructured(input.resourceId);
    const { rebuildMarkdownFromPages } = await import('@/lib/pdf');
    const markdownContent = rebuildMarkdownFromPages(structured);

    const { generateResourceMetadata } = await import('@/lib/services/resource-metadata');
    const metadataResult = await generateResourceMetadata(markdownContent, OPENAI_API_KEY, {
      existingName: result.resourceRow!.name,
      originalFilename: result.resourceRow!.originalFilename,
    });

    const resolvedName = metadataResult?.name ?? result.resourceRow!.name ?? input.name;
    const resolvedDescription = metadataResult?.description ?? result.resourceRow!.description ?? null;

    const metadata = parseMetadata(input.resourceId, null);
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

    await recordWorkflowStage(input.runId, 'metadata', {
      status: 'Metadata updated',
      resolvedName,
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
