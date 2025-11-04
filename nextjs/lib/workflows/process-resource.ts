/**
 * Vercel Workflow for processing game resources (PDFs)
 *
 * This workflow coordinates the 6-stage PDF processing pipeline:
 * 1. INGEST - Extract text and images from PDF using Mistral OCR
 * 2. VISION - Analyze images with GPT-4o vision
 * 3. CLEANUP - Clean markdown with LLM
 * 4. METADATA - Generate resource name/description
 * 5. EMBED - Generate embeddings (content + HyDE questions)
 * 6. FINALIZE - Mark resource as ready
 *
 * Advantages of Vercel Workflows:
 * - Automatic retries on failure
 * - Built-in observability and logging
 * - Durable execution (survives deployments)
 * - Simple sequential coordination
 */

import { db } from '@/lib/db';
import { resources, fragments, attachments, embeddings, jobs } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import type { StructuredPDFContent, PDFImage } from '@/lib/types/pdf';
import { nanoid } from 'nanoid';

// ==========================================
// Types
// ==========================================

export interface ProcessResourceInput {
  jobId: string;
  resourceId: string;
  gameId: string;
  gameName: string;
  name: string;
  url?: string;
  sourceKey?: string;
}

export interface ProcessingMetadata {
  structuredKey: string;
  stages: {
    ingest: boolean;
    vision: boolean;
    cleanup: boolean;
    metadata: boolean;
    embed: boolean;
  };
}

// ==========================================
// Main Workflow
// ==========================================

export async function processResourceWorkflow(input: ProcessResourceInput) {
  'use workflow';

  // Check if job was cancelled before starting
  const job = await checkJobStatus(input.jobId);
  if (!job || job.status === 'failed') {
    return { success: false, reason: 'Job cancelled before start' };
  }

  // Stage 1: INGEST - PDF extraction
  const ingestResult = await runIngestStage(input);
  if (!ingestResult.success) {
    await markJobFailed(input.jobId, input.resourceId, ingestResult.error!);
    return { success: false, stage: 'ingest', error: ingestResult.error };
  }

  // Check if we should continue to vision or skip to cleanup
  const hasImages = ingestResult.hasImages;

  // Stage 2: VISION - Image analysis (skip if no images)
  if (hasImages) {
    const visionResult = await runVisionStage(input);
    if (!visionResult.success) {
      await markJobFailed(input.jobId, input.resourceId, visionResult.error!);
      return { success: false, stage: 'vision', error: visionResult.error };
    }
  }

  // Stage 3: CLEANUP - Markdown cleanup
  const cleanupResult = await runCleanupStage(input);
  if (!cleanupResult.success) {
    await markJobFailed(input.jobId, input.resourceId, cleanupResult.error!);
    return { success: false, stage: 'cleanup', error: cleanupResult.error };
  }

  // Stage 4: METADATA - Resource metadata generation
  const metadataResult = await runMetadataStage(input);
  if (!metadataResult.success) {
    await markJobFailed(input.jobId, input.resourceId, metadataResult.error!);
    return { success: false, stage: 'metadata', error: metadataResult.error };
  }

  // Stage 5: EMBED - Embedding generation
  const embedResult = await runEmbedStage(input);
  if (!embedResult.success) {
    await markJobFailed(input.jobId, input.resourceId, embedResult.error!);
    return { success: false, stage: 'embed', error: embedResult.error };
  }

  // Stage 6: FINALIZE - Mark resource ready
  const finalizeResult = await runFinalizeStage(input);
  if (!finalizeResult.success) {
    await markJobFailed(input.jobId, input.resourceId, finalizeResult.error!);
    return { success: false, stage: 'finalize', error: finalizeResult.error };
  }

  return { success: true };
}

// ==========================================
// Helper Functions (NOT steps)
// ==========================================

async function checkJobStatus(jobId: string) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  return job;
}

async function markJobFailed(jobId: string, resourceId: string, error: string) {
  // Update job status
  await db
    .update(jobs)
    .set({
      status: 'failed',
      error,
      completedAt: BigInt(Date.now()),
    })
    .where(eq(jobs.id, jobId));

  // Update resource status
  await db
    .update(resources)
    .set({
      status: 'failed',
      processingStage: 'failed',
      processingMetadata: null,
      currentJobId: null,
      updatedAt: new Date(),
    })
    .where(eq(resources.id, resourceId));
}

function defaultMetadata(resourceId: string): ProcessingMetadata {
  return {
    structuredKey: `resources/${resourceId}/structured.json`,
    stages: {
      ingest: false,
      vision: false,
      cleanup: false,
      metadata: false,
      embed: false,
    },
  };
}

function parseMetadata(resourceId: string, value?: string | null): ProcessingMetadata {
  if (!value) {
    return defaultMetadata(resourceId);
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      return defaultMetadata(resourceId);
    }

    return {
      structuredKey: typeof parsed.structuredKey === 'string' ? parsed.structuredKey : `resources/${resourceId}/structured.json`,
      stages: {
        ingest: parsed.stages?.ingest === true,
        vision: parsed.stages?.vision === true,
        cleanup: parsed.stages?.cleanup === true,
        metadata: parsed.stages?.metadata === true,
        embed: parsed.stages?.embed === true,
      },
    };
  } catch {
    return defaultMetadata(resourceId);
  }
}

function serializeMetadata(metadata: ProcessingMetadata): string {
  return JSON.stringify(metadata);
}

// ==========================================
// Stage 1: INGEST
// ==========================================

async function runIngestStage(input: ProcessResourceInput) {
  'use step';

  try {
    const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
    if (!MISTRAL_API_KEY) {
      throw new Error('Missing MISTRAL_API_KEY');
    }

    // Fetch resource metadata
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

    // Check job ownership
    if (resourceRow.currentJobId && resourceRow.currentJobId !== input.jobId) {
      return {
        success: false,
        error: `Resource is being processed by different job: ${resourceRow.currentJobId}`,
      };
    }

    // Check if already completed
    const metadata = parseMetadata(input.resourceId, resourceRow.metadata);
    if (metadata.stages.ingest) {
      // Check if there are images
      const structured = await loadStructured(input.resourceId);
      const hasImages = structured.pages.some((page) => page.images.length > 0);
      return { success: true, hasImages };
    }

    // Update job status
    await db
      .update(jobs)
      .set({
        status: 'processing',
        currentStep: 'Starting PDF ingestion',
        progress: 5,
      })
      .where(eq(jobs.id, input.jobId));

    // Fetch document
    const { buffer, mimeType } = await fetchDocumentBuffer(input);

    // Extract text and images
    const { extractTextFromDocument } = await import('@/lib/pdf');
    const extraction = await extractTextFromDocument(buffer, MISTRAL_API_KEY, mimeType);

    if (!extraction.structured) {
      throw new Error('Document extraction did not return structured content');
    }

    // Save structured data
    await saveStructured(input.resourceId, extraction.structured);

    // Update metadata
    metadata.stages.ingest = true;
    await db
      .update(resources)
      .set({
        status: 'processing',
        processingStage: 'vision',
        processingMetadata: serializeMetadata(metadata),
        currentJobId: input.jobId,
        updatedAt: new Date(),
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

// ==========================================
// Stage 2: VISION
// ==========================================

async function runVisionStage(input: ProcessResourceInput) {
  'use step';

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }

    // Fetch resource metadata
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

    // Check job ownership
    if (resourceRow.currentJobId && resourceRow.currentJobId !== input.jobId) {
      return {
        success: false,
        error: `Resource is being processed by different job: ${resourceRow.currentJobId}`,
      };
    }

    // Check if already completed
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

    // Load structured data
    const structured = await loadStructured(input.resourceId);
    const images = structured.pages.flatMap((page) => page.images);

    if (images.length === 0) {
      metadata.stages.vision = true;
      await db
        .update(resources)
        .set({
          processingStage: 'cleanup',
          processingMetadata: serializeMetadata(metadata),
          updatedAt: new Date(),
        })
        .where(eq(resources.id, input.resourceId));

      return { success: true };
    }

    // Run vision analysis
    const { analyzeImagesBatch } = await import('@/lib/services/image-analysis');

    const imagesToAnalyze = images
      .filter((img) => img.base64)
      .map((img) => ({
        base64: img.base64!,
        pageNumber: img.pageNumber ?? 1,
      }));

    const analysisResults = await analyzeImagesBatch(
      imagesToAnalyze,
      input.gameName,
      OPENAI_API_KEY,
      {
        onProgress: async (processed, total) => {
          const progressPercent = 25 + Math.floor((processed / total) * 10);
          await db
            .update(jobs)
            .set({
              currentStep: `Vision analysis: ${processed}/${total} images`,
              progress: progressPercent,
            })
            .where(eq(jobs.id, input.jobId));
        },
      }
    );

    // Update structured data with vision results
    let analysisIndex = 0;
    for (const page of structured.pages) {
      for (const image of page.images) {
        if (image.base64 && analysisIndex < analysisResults.length) {
          const result = analysisResults[analysisIndex];
          image.description = result.description;
          image.isGoodQuality = result.quality;
          image.caption = result.caption || image.caption;
          analysisIndex++;
        }
      }
    }

    await saveStructured(input.resourceId, structured);

    // Update metadata
    metadata.stages.vision = true;
    await db
      .update(resources)
      .set({
        processingStage: 'cleanup',
        processingMetadata: serializeMetadata(metadata),
        updatedAt: new Date(),
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

// ==========================================
// Stage 3: CLEANUP
// ==========================================

async function runCleanupStage(input: ProcessResourceInput) {
  'use step';

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }

    // Fetch resource metadata
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

    // Check job ownership
    if (resourceRow.currentJobId && resourceRow.currentJobId !== input.jobId) {
      return {
        success: false,
        error: `Resource is being processed by different job: ${resourceRow.currentJobId}`,
      };
    }

    // Check if already completed
    const metadata = parseMetadata(input.resourceId, resourceRow.metadata);
    if (metadata.stages.cleanup) {
      return { success: true };
    }

    await db
      .update(jobs)
      .set({
        currentStep: 'Cleaning markdown',
        progress: 40,
      })
      .where(eq(jobs.id, input.jobId));

    // Load structured data
    const structured = await loadStructured(input.resourceId);

    // Clean markdown for each page
    const { cleanupMarkdownBatch } = await import('@/lib/services/markdown-cleanup');

    const cleanedPages = await cleanupMarkdownBatch(
      structured.pages.map((page) => ({
        markdown: page.markdown,
        pageNumber: page.pageNumber,
      })),
      OPENAI_API_KEY,
      {
        onProgress: async (processed, total) => {
          const progressPercent = 40 + Math.floor((processed / total) * 10);
          await db
            .update(jobs)
            .set({
              currentStep: `Markdown cleanup: ${processed}/${total} pages`,
              progress: progressPercent,
            })
            .where(eq(jobs.id, input.jobId));
        },
      }
    );

    // Update pages with cleaned markdown
    structured.pages.forEach((page, index) => {
      page.markdown = cleanedPages[index];
    });

    await saveStructured(input.resourceId, structured);

    // Update metadata
    metadata.stages.cleanup = true;
    await db
      .update(resources)
      .set({
        processingStage: 'metadata',
        processingMetadata: serializeMetadata(metadata),
        updatedAt: new Date(),
      })
      .where(eq(resources.id, input.resourceId));

    await db
      .update(jobs)
      .set({
        currentStep: 'Metadata pending',
        progress: 45,
      })
      .where(eq(jobs.id, input.jobId));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

// ==========================================
// Stage 4: METADATA
// ==========================================

async function runMetadataStage(input: ProcessResourceInput) {
  'use step';

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }

    // Fetch resource metadata
    const [resourceRow] = await db
      .select({
        metadata: resources.processingMetadata,
        currentJobId: resources.currentJobId,
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

    // Check job ownership
    if (resourceRow.currentJobId && resourceRow.currentJobId !== input.jobId) {
      return {
        success: false,
        error: `Resource is being processed by different job: ${resourceRow.currentJobId}`,
      };
    }

    // Check if already completed
    const metadata = parseMetadata(input.resourceId, resourceRow.metadata);
    if (metadata.stages.metadata) {
      return { success: true };
    }

    await db
      .update(jobs)
      .set({
        currentStep: 'Generating metadata',
        progress: 55,
      })
      .where(eq(jobs.id, input.jobId));

    // Load structured data and rebuild markdown
    const structured = await loadStructured(input.resourceId);
    const { rebuildMarkdownFromPages } = await import('@/lib/pdf');
    const markdownContent = rebuildMarkdownFromPages(structured);

    // Generate metadata
    const { generateResourceMetadata } = await import('@/lib/services/resource-metadata');
    const metadataResult = await generateResourceMetadata(markdownContent, OPENAI_API_KEY, {
      existingName: resourceRow.name,
      originalFilename: resourceRow.originalFilename,
    });

    const resolvedName = metadataResult?.name ?? resourceRow.name ?? input.name;
    const resolvedDescription = metadataResult?.description ?? resourceRow.description ?? null;

    // Update metadata
    metadata.stages.metadata = true;
    await db
      .update(resources)
      .set({
        name: resolvedName,
        description: resolvedDescription,
        processingStage: 'embed',
        processingMetadata: serializeMetadata(metadata),
        updatedAt: new Date(),
      })
      .where(eq(resources.id, input.resourceId));

    await db
      .update(jobs)
      .set({
        currentStep: 'Embedding pending',
        progress: 60,
      })
      .where(eq(jobs.id, input.jobId));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

// ==========================================
// Stage 5: EMBED
// ==========================================

async function runEmbedStage(input: ProcessResourceInput) {
  'use step';

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY');
    }

    // Fetch resource metadata
    const [resourceRow] = await db
      .select({
        metadata: resources.processingMetadata,
        currentJobId: resources.currentJobId,
        name: resources.name,
        url: resources.url,
      })
      .from(resources)
      .where(eq(resources.id, input.resourceId))
      .limit(1);

    if (!resourceRow) {
      throw new Error(`Resource ${input.resourceId} not found`);
    }

    // Check job ownership
    if (resourceRow.currentJobId && resourceRow.currentJobId !== input.jobId) {
      return {
        success: false,
        error: `Resource is being processed by different job: ${resourceRow.currentJobId}`,
      };
    }

    // Check if already completed
    const metadata = parseMetadata(input.resourceId, resourceRow.metadata);
    if (metadata.stages.embed) {
      return { success: true };
    }

    await db
      .update(jobs)
      .set({
        currentStep: 'Embedding content',
        progress: 75,
      })
      .where(eq(jobs.id, input.jobId));

    // Load structured data
    const structured = await loadStructured(input.resourceId);

    // Run the complex EMBED stage implementation
    const { runEmbedStageImpl } = await import('./embed-stage');
    await runEmbedStageImpl(input, structured);

    // Mark stage as complete
    metadata.stages.embed = true;
    await db
      .update(resources)
      .set({
        processingStage: 'finalize',
        processingMetadata: serializeMetadata(metadata),
        updatedAt: new Date(),
      })
      .where(eq(resources.id, input.resourceId));

    await db
      .update(jobs)
      .set({
        currentStep: 'Finalizing resource',
        progress: 85,
      })
      .where(eq(jobs.id, input.jobId));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[EMBED Stage] Error:', error);
    return { success: false, error: errorMessage };
  }
}

// ==========================================
// Stage 6: FINALIZE
// ==========================================

async function runFinalizeStage(input: ProcessResourceInput) {
  'use step';

  try {
    await db
      .update(resources)
      .set({
        status: 'ready',
        processingStage: 'ready',
        processingMetadata: null,
        currentJobId: null,
        updatedAt: new Date(),
      })
      .where(eq(resources.id, input.resourceId));

    await db
      .update(jobs)
      .set({
        status: 'completed',
        currentStep: 'Processing complete',
        progress: 100,
        completedAt: BigInt(Date.now()),
      })
      .where(eq(jobs.id, input.jobId));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

// ==========================================
// Storage Helpers
// ==========================================

async function saveStructured(resourceId: string, structured: StructuredPDFContent): Promise<void> {
  const { uploadBlob } = await import('@/lib/services/blob-storage');
  const key = `resources/${resourceId}/structured.json`;
  const buffer = Buffer.from(JSON.stringify(structured));
  await uploadBlob(key, buffer, 'application/json');
}

async function loadStructured(resourceId: string): Promise<StructuredPDFContent> {
  const { getBlob } = await import('@/lib/services/blob-storage');
  const key = `resources/${resourceId}/structured.json`;
  const data = await getBlob(key);

  if (!data) {
    throw new Error(`Structured data not found for resource ${resourceId}`);
  }

  return JSON.parse(data.toString('utf-8')) as StructuredPDFContent;
}

async function fetchDocumentBuffer(input: ProcessResourceInput): Promise<{ buffer: Buffer; mimeType: string }> {
  // Try sourceKey first (if document was already uploaded)
  if (input.sourceKey) {
    const { getBlob } = await import('@/lib/services/blob-storage');
    const data = await getBlob(input.sourceKey);

    if (data) {
      // Detect MIME type from buffer
      const { detectMimeType } = await import('@/lib/services/blob-storage');
      const mimeType = detectMimeType(data) || 'application/pdf';
      return { buffer: data, mimeType };
    }
  }

  // Fall back to fetching from URL
  if (!input.url) {
    throw new Error('No URL or source key provided for document ingestion');
  }

  const response = await fetch(input.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch document (status ${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get('content-type') || 'application/pdf';

  return { buffer, mimeType };
}
