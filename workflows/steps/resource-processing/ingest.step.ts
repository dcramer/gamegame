/**
 * INGEST Step - Extract text and images from PDF using Mistral OCR
 */

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ProcessResourceInput } from '@/workflows/support/types';
import {
  parseMetadata,
  serializeMetadata,
  saveStructured,
  loadStructured,
  fetchDocumentBuffer,
} from '@/workflows/support/helpers';
import { recordWorkflowStage } from '@/lib/services/workflow-run-store';

export async function runIngestStage(input: ProcessResourceInput) {
  'use step';

  try {
    const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
    if (!MISTRAL_API_KEY) {
      throw new Error('Missing MISTRAL_API_KEY');
    }

    await recordWorkflowStage(input.runId, 'ingest', {
      status: 'Extracting PDF',
      resourceId: input.resourceId,
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

    const { buffer, mimeType } = await fetchDocumentBuffer(input);

    const { extractTextFromDocument } = await import('@/lib/pdf');
    const extraction = await extractTextFromDocument(buffer, MISTRAL_API_KEY, mimeType);

    if (!extraction.structured) {
      throw new Error('Document extraction did not return structured content');
    }

    await saveStructured(input.resourceId, extraction.structured);

    const metadata = parseMetadata(input.resourceId, null);
    await db
      .update(resources)
      .set({
        status: 'processing',
        processingStage: 'vision',
        processingMetadata: serializeMetadata(metadata),
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));

    const pageCount = extraction.structured.pages.length;
    const imageCount = extraction.structured.pages.reduce((count, page) => count + page.images.length, 0);
    const hasImages = imageCount > 0;

    await recordWorkflowStage(input.runId, 'ingest', {
      status: 'PDF extracted',
      pageCount,
      imageCount,
      hasImages,
    });
    return { success: true, hasImages };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
