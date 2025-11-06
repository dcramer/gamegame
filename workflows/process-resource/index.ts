/**
 * Process Resource Workflow
 *
 * Coordinates the 6-stage PDF processing pipeline:
 * 1. INGEST - Extract text and images from PDF using Mistral OCR
 * 2. VISION - Analyze images with GPT-4o vision
 * 3. CLEANUP - Clean markdown with LLM
 * 4. METADATA - Generate resource name/description
 * 5. EMBED - Generate embeddings (content + HyDE questions)
 * 6. FINALIZE - Mark resource as ready
 *
 * IMPORTANT: This file uses 'use workflow' directive and CANNOT import Node.js modules.
 * All Node.js operations must be in step functions.
 */

import { runIngestStage } from './steps/ingest';
import { runVisionStage } from './steps/vision';
import { runCleanupStage } from './steps/cleanup';
import { runMetadataStage } from './steps/metadata';
import { runEmbedStage } from './steps/embed';
import { runFinalizeStage } from './steps/finalize';
import { markJobFailedStep } from './steps/mark-job-failed';
import type { ProcessResourceInput } from '../shared/types';

export async function processResourceWorkflow(input: ProcessResourceInput) {
  'use workflow';

  const startStage = input.fromStage || 'ingest';

  // Stage 1: INGEST - PDF extraction
  if (startStage === 'ingest') {
    const ingestResult = await runIngestStage(input);
    if (!ingestResult.success) {
      await markJobFailedStep(input.jobId, input.resourceId, ingestResult.error!);
      return { success: false, stage: 'ingest', error: ingestResult.error };
    }
  }

  // Stage 2: VISION - Image analysis (skip if starting after vision or no images)
  if (startStage === 'ingest' || startStage === 'vision') {
    // For vision stage, we need to check if there are images to process
    // This is handled inside the vision step
    const visionResult = await runVisionStage(input);
    if (!visionResult.success) {
      await markJobFailedStep(input.jobId, input.resourceId, visionResult.error!);
      return { success: false, stage: 'vision', error: visionResult.error };
    }
  }

  // Stage 3: CLEANUP - Markdown cleanup
  if (startStage === 'ingest' || startStage === 'vision' || startStage === 'cleanup') {
    const cleanupResult = await runCleanupStage(input);
    if (!cleanupResult.success) {
      await markJobFailedStep(input.jobId, input.resourceId, cleanupResult.error!);
      return { success: false, stage: 'cleanup', error: cleanupResult.error };
    }
  }

  // Stage 4: METADATA - Resource metadata generation
  if (startStage === 'ingest' || startStage === 'vision' || startStage === 'cleanup' || startStage === 'metadata') {
    const metadataResult = await runMetadataStage(input);
    if (!metadataResult.success) {
      await markJobFailedStep(input.jobId, input.resourceId, metadataResult.error!);
      return { success: false, stage: 'metadata', error: metadataResult.error };
    }
  }

  // Stage 5: EMBED - Embedding generation (always run if we're at metadata or embed stage)
  const embedResult = await runEmbedStage(input);
  if (!embedResult.success) {
    await markJobFailedStep(input.jobId, input.resourceId, embedResult.error!);
    return { success: false, stage: 'embed', error: embedResult.error };
  }

  // Stage 6: FINALIZE - Mark resource ready
  const finalizeResult = await runFinalizeStage(input);
  if (!finalizeResult.success) {
    await markJobFailedStep(input.jobId, input.resourceId, finalizeResult.error!);
    return { success: false, stage: 'finalize', error: finalizeResult.error };
  }

  return { success: true };
}
