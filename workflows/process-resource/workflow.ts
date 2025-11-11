/**
 * Process Resource Workflow
 *
 * Coordinates the 6-stage PDF processing pipeline:
 * 1. INGEST - Extract text and images from PDF using Mistral OCR
 * 2. VISION - Analyze images with GPT-5 vision
 * 3. CLEANUP - Clean markdown with LLM
 * 4. METADATA - Generate resource name/description
 * 5. EMBED - Generate embeddings (content + HyDE questions)
 * 6. FINALIZE - Mark resource as ready
 *
 * IMPORTANT: This file uses 'use workflow' directive and CANNOT import Node.js modules.
 * All Node.js operations must be in step functions.
 */

import type { ReprocessStage } from '@/lib/reprocess/stages';
import { runIngestStage } from '@/workflows/steps/resource-processing/ingest.step';
import { runVisionStage } from '@/workflows/steps/resource-processing/vision.step';
import { runCleanupStage } from '@/workflows/steps/resource-processing/cleanup.step';
import { runMetadataStage } from '@/workflows/steps/resource-processing/metadata.step';
import { runEmbedStage } from '@/workflows/steps/resource-processing/embed.step';
import { runFinalizeStage } from '@/workflows/steps/resource-processing/finalize.step';
import { markJobFailedStep } from '@/workflows/steps/resource-processing/mark-job-failed.step';
import type { ProcessResourceInput } from '@/workflows/support/types';

function extractErrorMessage(result: { success: boolean } & Record<string, unknown>): string {
  if ('error' in result && typeof result.error === 'string' && result.error.length > 0) {
    return result.error;
  }
  return 'Unknown workflow error';
}

export async function processResourceWorkflow(input: ProcessResourceInput) {
  'use workflow';

  const stageOrder: ReprocessStage[] = ['ingest', 'vision', 'cleanup', 'metadata', 'embed'];
  const startStage: ReprocessStage = input.fromStage || 'ingest';
  const onlyStage = Boolean(input.onlyStage);

  const shouldRunStage = (stage: ReprocessStage) => {
    if (onlyStage) {
      return stage === startStage;
    }
    const startIndex = stageOrder.indexOf(startStage);
    const stageIndex = stageOrder.indexOf(stage);
    return stageIndex >= startIndex;
  };

  // Stage 1: INGEST - PDF extraction
  if (shouldRunStage('ingest')) {
    const ingestResult = await runIngestStage(input);
    if (!ingestResult.success) {
      const errorMessage = extractErrorMessage(ingestResult);
      await markJobFailedStep(input.runId, input.resourceId, errorMessage);
      return { success: false, stage: 'ingest', error: errorMessage };
    }
  }

  // Stage 2: VISION - Image analysis (skip if starting after vision or no images)
  if (shouldRunStage('vision')) {
    // For vision stage, we need to check if there are images to process
    // This is handled inside the vision step
    const visionResult = await runVisionStage(input);
    if (!visionResult.success) {
      const errorMessage = extractErrorMessage(visionResult);
      await markJobFailedStep(input.runId, input.resourceId, errorMessage);
      return { success: false, stage: 'vision', error: errorMessage };
    }
  }

  // Stage 3: CLEANUP - Markdown cleanup
  if (shouldRunStage('cleanup')) {
    const cleanupResult = await runCleanupStage(input);
    if (!cleanupResult.success) {
      const errorMessage = extractErrorMessage(cleanupResult);
      await markJobFailedStep(input.runId, input.resourceId, errorMessage);
      return { success: false, stage: 'cleanup', error: errorMessage };
    }
  }

  // Stage 4: METADATA - Resource metadata generation
  if (shouldRunStage('metadata')) {
    const metadataResult = await runMetadataStage(input);
    if (!metadataResult.success) {
      const errorMessage = extractErrorMessage(metadataResult);
      await markJobFailedStep(input.runId, input.resourceId, errorMessage);
      return { success: false, stage: 'metadata', error: errorMessage };
    }
  }

  // Stage 5: EMBED - Embedding generation (only when required)
  if (shouldRunStage('embed')) {
    const embedResult = await runEmbedStage(input);
    if (!embedResult.success) {
      const errorMessage = extractErrorMessage(embedResult);
      await markJobFailedStep(input.runId, input.resourceId, errorMessage);
      return { success: false, stage: 'embed', error: errorMessage };
    }
  }

  // Stage 6: FINALIZE - Mark resource ready
  const finalizeResult = await runFinalizeStage(input);
  if (!finalizeResult.success) {
    const errorMessage = extractErrorMessage(finalizeResult);
    await markJobFailedStep(input.runId, input.resourceId, errorMessage);
    return { success: false, stage: 'finalize', error: errorMessage };
  }

  return { success: true };
}

export type { ProcessResourceInput };
