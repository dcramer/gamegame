/**
 * BATCH RESOURCE Step - Analyze all images in a resource
 *
 * This step processes images from structured PDF data and updates them with vision analysis.
 * Used during resource processing pipeline.
 */
'use step';

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  loadStructured,
  saveStructured,
  parseMetadata,
  serializeMetadata,
  stripDataUriBase64,
} from '@/workflows/support/helpers';
import { analyzeBatchStep } from '@/workflows/steps/vision/analyze-image.step';
import { recordWorkflowStage } from '@/lib/services/workflow-run-store';
import type { PDFPage } from '@/lib/types/pdf';

export interface BatchResourceInput {
  resourceId: string;
  gameName: string;
  runId?: string;
}

export interface BatchResourceResult {
  success: boolean;
  imagesProcessed: number;
  error?: string;
}

export async function analyzeBatchResourceStep(
  input: BatchResourceInput
): Promise<BatchResourceResult> {
  try {
    const [resourceRow] = await db
      .select({
        metadata: resources.processingMetadata,
      })
      .from(resources)
      .where(eq(resources.id, input.resourceId))
      .limit(1);

    if (!resourceRow) {
      return {
        success: false,
        imagesProcessed: 0,
        error: `Resource ${input.resourceId} not found`,
      };
    }

    const metadata = parseMetadata(input.resourceId, resourceRow.metadata);

    // Load structured data
    const structured = await loadStructured(input.resourceId);
    const allImages = structured.pages.flatMap((page) => page.images);

    await recordWorkflowStage(input.runId, 'vision', {
      status: 'Analyzing resource images',
      imagesTotal: allImages.length,
    });

    // If no images, skip vision processing and return
    if (allImages.length === 0) {
      await db
        .update(resources)
        .set({
          processingStage: 'cleanup',
          processingMetadata: serializeMetadata(metadata),
          updatedAt: Date.now(),
        })
        .where(eq(resources.id, input.resourceId));

      await recordWorkflowStage(input.runId, 'vision', {
        status: 'No images to analyze',
      });
      return { success: true, imagesProcessed: 0 };
    }

    // Prepare images for batch analysis with contextual metadata
    const resourceTitle = structured.metadata?.title;
    const imagesToAnalyze = structured.pages.flatMap((page) => {
      const sectionHierarchy = getSectionHierarchy(page);
      const surroundingText = extractSurroundingText(page.markdown);

      return page.images
        .filter((img) => img.base64)
        .map((img) => ({
          buffer: Buffer.from(stripDataUriBase64(img.base64!), 'base64'),
          context: {
            gameName: input.gameName,
            resourceName: resourceTitle,
            pageNumber: img.pageNumber ?? page.pageNumber ?? 1,
            section: sectionHierarchy,
            caption: img.caption,
            surroundingText,
          },
        }));
    });

    // Run batch analysis with progress tracking
    const batchResult = await analyzeBatchStep({
      images: imagesToAnalyze,
      batchSize: 3,
      onProgress: async (completed, total) => {
        await recordWorkflowStage(input.runId, 'vision', {
          status: 'Analyzing images',
          completed,
          total,
        });
      },
    });

    if (!batchResult.success || !batchResult.analyses) {
      return {
        success: false,
        imagesProcessed: 0,
        error: batchResult.error || 'Failed to analyze images',
      };
    }

    // Update structured data with analysis results
    let analysisIndex = 0;
    for (const page of structured.pages) {
      for (const image of page.images) {
        if (image.base64 && analysisIndex < batchResult.analyses.length) {
          const result = batchResult.analyses[analysisIndex];
          image.description = result.description;
          image.isGoodQuality = result.quality;
          // Store additional fields for later use
          image.isRelevant = result.relevant ? 1 : 0;
          image.detectedType = result.type;
          if (result.ocrText) {
            image.ocrText = result.ocrText;
          }
          analysisIndex++;
        }
      }
    }

    // Save updated structured data
    await saveStructured(input.resourceId, structured);

    // Update processing stage
    await db
      .update(resources)
      .set({
        processingStage: 'cleanup',
        processingMetadata: serializeMetadata(metadata),
        updatedAt: Date.now(),
      })
      .where(eq(resources.id, input.resourceId));

    await recordWorkflowStage(input.runId, 'vision', {
      status: 'Vision analysis complete',
      imagesProcessed: analysisIndex,
    });

    return {
      success: true,
      imagesProcessed: analysisIndex,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      imagesProcessed: 0,
      error: errorMessage,
    };
  }
}

function getSectionHierarchy(page: PDFPage): string | undefined {
  if (page.sections && page.sections.length > 0) {
    return page.sections[page.sections.length - 1].hierarchy;
  }
  return undefined;
}

function extractSurroundingText(markdown?: string, limit = 800): string | undefined {
  if (!markdown) {
    return undefined;
  }

  const normalized = markdown.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}
