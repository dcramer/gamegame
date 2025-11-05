/**
 * INGEST Step - Extract text and images from PDF using Mistral OCR
 */

import { db } from '@/lib/db';
import { jobs, resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ProcessResourceInput } from '../../shared/types';
import {
  parseMetadata,
  serializeMetadata,
  saveStructured,
  loadStructured,
  fetchDocumentBuffer,
} from '../../shared/helpers';

export async function runIngestStage(input: ProcessResourceInput) {
  'use step';

  try {
    const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
    if (!MISTRAL_API_KEY) {
      throw new Error('Missing MISTRAL_API_KEY');
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
    if (metadata.stages.ingest) {
      const structured = await loadStructured(input.resourceId);
      const hasImages = structured.pages.some((page) => page.images.length > 0);
      return { success: true, hasImages };
    }

    await db
      .update(jobs)
      .set({
        status: 'processing',
        currentStep: 'Starting PDF ingestion',
        progress: 5,
      })
      .where(eq(jobs.id, input.jobId));

    const { buffer, mimeType } = await fetchDocumentBuffer(input);

    const { extractTextFromDocument } = await import('@/lib/pdf');
    const extraction = await extractTextFromDocument(buffer, MISTRAL_API_KEY, mimeType);

    if (!extraction.structured) {
      throw new Error('Document extraction did not return structured content');
    }

    await saveStructured(input.resourceId, extraction.structured);

    metadata.stages.ingest = true;
    await db
      .update(resources)
      .set({
        status: 'processing',
        processingStage: 'vision',
        processingMetadata: serializeMetadata(metadata),
        currentJobId: input.jobId,
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));

    await db
      .update(jobs)
      .set({
        currentStep: 'Vision analysis pending',
        progress: 15,
      })
      .where(eq(jobs.id, input.jobId));

    const hasImages = extraction.structured.pages.some((page) => page.images.length > 0);
    return { success: true, hasImages };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
