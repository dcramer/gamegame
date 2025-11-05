/**
 * VISION Step - Analyze images with GPT-4o vision
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
} from '../../shared/helpers';

export async function runVisionStage(input: ProcessResourceInput) {
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
    if (metadata.stages.vision) {
      return { success: true };
    }

    await db
      .update(jobs)
      .set({
        currentStep: 'Running vision analysis',
        progress: 25,
      })
      .where(eq(jobs.id, input.jobId));

    const structured = await loadStructured(input.resourceId);
    const images = structured.pages.flatMap((page) => page.images);

    if (images.length === 0) {
      metadata.stages.vision = true;
      await db
        .update(resources)
        .set({
          processingStage: 'cleanup',
          processingMetadata: serializeMetadata(metadata),
          updatedAt: Date.now(),
        })
        .where(eq(resources.id, input.resourceId));

      return { success: true };
    }

    const { analyzeImagesBatch } = await import('@/lib/services/image-analysis');

    const imagesToAnalyze = images
      .filter((img) => img.base64)
      .map((img) => ({
        base64: img.base64!,
        pageNumber: img.pageNumber ?? 1,
      }));

    const analysisResults = await analyzeImagesBatch(
      imagesToAnalyze.map(img => ({
        buffer: Buffer.from(img.base64, 'base64'),
        context: {
          gameName: input.gameName,
          pageNumber: img.pageNumber,
        },
      })),
      OPENAI_API_KEY,
      {}
    );

    let analysisIndex = 0;
    for (const page of structured.pages) {
      for (const image of page.images) {
        if (image.base64 && analysisIndex < analysisResults.length) {
          const result = analysisResults[analysisIndex];
          image.description = result.description;
          image.isGoodQuality = result.quality;
          analysisIndex++;
        }
      }
    }

    await saveStructured(input.resourceId, structured);

    metadata.stages.vision = true;
    await db
      .update(resources)
      .set({
        processingStage: 'cleanup',
        processingMetadata: serializeMetadata(metadata),
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));

    await db
      .update(jobs)
      .set({
        currentStep: 'Markdown cleanup pending',
        progress: 30,
      })
      .where(eq(jobs.id, input.jobId));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
