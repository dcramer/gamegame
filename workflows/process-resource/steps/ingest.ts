/**
 * INGEST Step - Extract text and images from PDF using Mistral OCR
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
  fetchDocumentBuffer,
  hasActiveWorkflowConflict,
} from '../../shared/helpers';

export async function runIngestStage(input: ProcessResourceInput) {
  'use step';

  try {
    const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
    if (!MISTRAL_API_KEY) {
      throw new Error('Missing MISTRAL_API_KEY');
    }

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

      // Check for workflow conflicts and clear stale currentRunId references
      const hasConflict = await hasActiveWorkflowConflict(
        input.resourceId,
        input.runId,
        resourceRow.currentRunId,
        tx
      );

      if (hasConflict) {
        return {
          success: false,
          error: `Resource is being processed by another workflow: ${resourceRow.currentRunId}`,
        };
      }

      const metadata = parseMetadata(input.resourceId, resourceRow.metadata);
      if (metadata.stages.ingest) {
        const structured = await loadStructured(input.resourceId);
        const hasImages = structured.pages.some((page) => page.images.length > 0);
        return { success: true, hasImages, skipProcessing: true };
      }

      // Set currentRunId immediately within the transaction
      metadata.stages.ingest = false; // Will be set to true after processing
      await tx
        .update(resources)
        .set({
          currentRunId: input.runId,
          updatedAt: Date.now(),
        })
        .where(eq(resources.id, input.resourceId));

      return { success: true, hasImages: false, skipProcessing: false };
    });

    if (!result.success || result.skipProcessing) {
      return result;
    }

    const { buffer, mimeType } = await fetchDocumentBuffer(input);

    const { extractTextFromDocument } = await import('@/lib/pdf');
    const extraction = await extractTextFromDocument(buffer, MISTRAL_API_KEY, mimeType);

    if (!extraction.structured) {
      throw new Error('Document extraction did not return structured content');
    }

    await saveStructured(input.resourceId, extraction.structured);

    const metadata = parseMetadata(input.resourceId, null);
    metadata.stages.ingest = true;
    await db
      .update(resources)
      .set({
        status: 'processing',
        processingStage: 'vision',
        processingMetadata: serializeMetadata(metadata),
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));

    const hasImages = extraction.structured.pages.some((page) => page.images.length > 0);
    return { success: true, hasImages };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
