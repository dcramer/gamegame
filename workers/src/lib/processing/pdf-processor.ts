import type { Env, QueueMessage } from '@/types';
import { nanoid } from 'nanoid';
import { getDb, resources, fragments, attachments } from '../db';
import { eq } from 'drizzle-orm';
import { extractTextFromDocument, rebuildMarkdownFromPages, replaceImageReferences } from '../pdf';
import { getExtensionFromKey } from '../services/r2-storage';
import { getMimeTypeForExtension } from '../file-types';
import { chunkStructuredPDF, calculateResourceStats } from '../services/chunking';
import { uploadPDFImages, extractR2KeyFromUrl, r2KeyToUrl } from '../services/r2-storage';
import type { UploadedImage } from '../services/r2-storage';
import { generateEmbeddings } from '../ai/embeddings';
import { insertEmbeddings, deleteEmbeddings } from '../ai/vectorize';
import type { StructuredPDFContent, PDFImage } from '../types/pdf';
import { enrichPDFImagesWithVision } from '../services/vision';
import { cleanupMarkdownBatch } from '../services/markdown-cleanup';
import { updateJob } from '../jobs/status';
import { generateResourceMetadata } from '../services/resource-metadata';

const STRUCTURED_KEY = (resourceId: string) => `resources/${resourceId}/structured.json`;

interface ResourceProcessingMetadata {
  structuredKey: string;
  stages: {
    ingest: boolean;
    vision: boolean;
    cleanup: boolean;
    metadata: boolean;
    embed: boolean;
  };
}

function defaultMetadata(resourceId: string): ResourceProcessingMetadata {
  return {
    structuredKey: STRUCTURED_KEY(resourceId),
    stages: {
      ingest: false,
      vision: false,
      cleanup: false,
      metadata: false,
      embed: false,
    },
  };
}

/**
 * Type guard to check if a value is a boolean
 */
function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Validate and normalize stage flags, ensuring all are booleans
 */
function validateStages(stages: unknown): ResourceProcessingMetadata['stages'] {
  const defaults = {
    ingest: false,
    vision: false,
    cleanup: false,
    metadata: false,
    embed: false,
  };

  if (!stages || typeof stages !== 'object') {
    return defaults;
  }

  const stageObj = stages as Record<string, unknown>;

  return {
    ingest: isBoolean(stageObj.ingest) ? stageObj.ingest : defaults.ingest,
    vision: isBoolean(stageObj.vision) ? stageObj.vision : defaults.vision,
    cleanup: isBoolean(stageObj.cleanup) ? stageObj.cleanup : defaults.cleanup,
    metadata: isBoolean(stageObj.metadata) ? stageObj.metadata : defaults.metadata,
    embed: isBoolean(stageObj.embed) ? stageObj.embed : defaults.embed,
  };
}

function parseMetadata(resourceId: string, value?: string | null): ResourceProcessingMetadata {
  if (!value) {
    return defaultMetadata(resourceId);
  }

  try {
    const parsed = JSON.parse(value);

    // Validate that parsed is an object
    if (!parsed || typeof parsed !== 'object') {
      console.warn(`[parseMetadata] Invalid metadata format for resource ${resourceId}, using defaults`);
      return defaultMetadata(resourceId);
    }

    const structuredKey = typeof parsed.structuredKey === 'string' && parsed.structuredKey.length > 0
      ? parsed.structuredKey
      : STRUCTURED_KEY(resourceId);

    const stages = validateStages(parsed.stages);

    return {
      structuredKey,
      stages,
    };
  } catch (error) {
    console.warn(`[parseMetadata] Failed to parse metadata for resource ${resourceId}:`, error);
    return defaultMetadata(resourceId);
  }
}

function serializeMetadata(metadata: ResourceProcessingMetadata): string {
  return JSON.stringify(metadata);
}

async function saveStructured(env: Env, resourceId: string, structured: StructuredPDFContent): Promise<void> {
  const key = STRUCTURED_KEY(resourceId);
  await env.FILES.put(key, JSON.stringify(structured), {
    httpMetadata: {
      contentType: 'application/json',
    },
  });
}

async function loadStructured(env: Env, resourceId: string): Promise<StructuredPDFContent> {
  const key = STRUCTURED_KEY(resourceId);
  const object = await env.FILES.get(key);

  if (!object) {
    throw new Error(`Structured data not found for resource ${resourceId}`);
  }

  const text = await object.text();
  return JSON.parse(text) as StructuredPDFContent;
}

// Unused for now - keeping structured data for potential reprocessing
// async function deleteStructured(env: Env, resourceId: string): Promise<void> {
//   try {
//     await env.FILES.delete(STRUCTURED_KEY(resourceId));
//   } catch (error) {
//     console.warn(`[${resourceId}] Failed to delete structured data:`, error);
//   }
// }

async function fetchDocumentBuffer(task: QueueMessage, env: Env): Promise<{ buffer: Buffer; mimeType: string }> {
  if (task.sourceKey) {
    const object = await env.FILES.get(task.sourceKey);
    if (object) {
      const arrayBuffer = await object.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Get MIME type from R2 metadata or derive from extension
      const mimeType = object.httpMetadata?.contentType ||
                      getMimeTypeForExtension(getExtensionFromKey(task.sourceKey));

      return { buffer, mimeType };
    }
    console.warn(`[${task.resourceId}] Source file not found in R2 at key ${task.sourceKey}, falling back to URL fetch`);
  }

  if (!task.url) {
    throw new Error('No URL or source key provided for document ingestion');
  }

  const keyFromUrl = extractR2KeyFromUrl(task.url);
  if (keyFromUrl) {
    const object = await env.FILES.get(keyFromUrl);
    if (object) {
      const arrayBuffer = await object.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const mimeType = object.httpMetadata?.contentType ||
                      getMimeTypeForExtension(getExtensionFromKey(keyFromUrl));

      return { buffer, mimeType };
    }
  }

  const response = await fetch(task.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch document (status ${response.status} ${response.statusText})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Try to get MIME type from response headers
  const mimeType = response.headers.get('content-type') || 'application/pdf';

  return { buffer, mimeType };
}

async function deleteExistingAttachments(env: Env, resourceId: string) {
  const db = getDb(env.DB);
  const existingAttachments = await db
    .select({ r2Key: attachments.r2Key })
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId))
    .all();

  if (existingAttachments.length > 0) {
    await db.delete(attachments).where(eq(attachments.resourceId, resourceId));
    const keys = existingAttachments
      .map((attachment) => attachment.r2Key)
      .filter((key): key is string => typeof key === 'string' && key.length > 0);

    if (keys.length > 0) {
      const { bulkDeleteFromR2 } = await import('../services/r2-storage');
      await bulkDeleteFromR2(env.FILES, keys);
    }
  }
}

async function deleteExistingFragments(env: Env, resourceId: string) {
  const db = getDb(env.DB);
  const existingFragments = await db
    .select({ id: fragments.id })
    .from(fragments)
    .where(eq(fragments.resourceId, resourceId))
    .all();

  if (existingFragments.length > 0) {
    await db.delete(fragments).where(eq(fragments.resourceId, resourceId));

    const MAX_VECTOR_ID_LENGTH = 64;

    // Build list of all vector IDs to delete (content + questions)
    const vectorIds: string[] = [];
    const skipped: Array<{ id: string }> = [];

    existingFragments.forEach((fragment) => {
      // Content vector (main fragment ID)
      if (fragment.id.length <= MAX_VECTOR_ID_LENGTH) {
        vectorIds.push(fragment.id);

        // Question vectors (up to 5 per fragment: fragmentId-q0 through fragmentId-q4)
        for (let qIdx = 0; qIdx < 5; qIdx++) {
          const questionId = `${fragment.id}-q${qIdx}`;
          if (questionId.length <= MAX_VECTOR_ID_LENGTH) {
            vectorIds.push(questionId);
          }
        }
      } else {
        skipped.push(fragment);
      }
    });

    if (vectorIds.length > 0) {
      await deleteEmbeddings(env.VECTORIZE, vectorIds);
    }

    if (skipped.length > 0) {
      console.warn(
        `Skipped deleting ${skipped.length} vector embeddings with IDs longer than ${MAX_VECTOR_ID_LENGTH} bytes. ` +
          'Run `wrangler vectorize delete-by-ids` manually or reset the index to remove legacy entries.'
      );
    }
  }
}

export async function runIngestStage(task: QueueMessage, env: Env): Promise<QueueMessage | null> {
  const db = getDb(env.DB);
  if (!env.MISTRAL_API_KEY) {
    throw new Error('Missing MISTRAL_API_KEY secret');
  }

  // Check if this stage is already done OR if another job is processing
  // (optimistic locking via currentJobId)
  const [resourceRow] = await db
    .select({
      metadata: resources.processingMetadata,
      currentJobId: resources.currentJobId,
    })
    .from(resources)
    .where(eq(resources.id, task.resourceId))
    .limit(1);

  if (!resourceRow) {
    throw new Error(`Resource ${task.resourceId} was deleted during processing`);
  }

  const metadata = parseMetadata(task.resourceId, resourceRow.metadata);

  // If ingest already completed, skip to next stage
  if (metadata.stages.ingest) {
    console.log(`[Ingest Stage] Resource ${task.resourceId} already ingested, skipping`);
    const hasImages = await checkHasImages(env, task.resourceId);
    return { ...task, type: hasImages ? 'VISION' : 'CLEANUP', url: undefined, sourceKey: undefined };
  }

  // Optimistic locking: If another job is processing this resource, abort
  // This handles the case where a reprocess was triggered while this job was retrying
  if (resourceRow.currentJobId && resourceRow.currentJobId !== task.jobId) {
    console.warn(
      `[Ingest Stage] Resource ${task.resourceId} is being processed by a different job ` +
      `(current: ${resourceRow.currentJobId}, this: ${task.jobId}). ` +
      `This job will stop. The active job will continue processing.`
    );
    return null; // Don't queue next task - another job is handling it
  }

  const { buffer, mimeType } = await fetchDocumentBuffer(task, env);
  const extraction = await extractTextFromDocument(buffer, env.MISTRAL_API_KEY, mimeType);

  if (!extraction.structured) {
    throw new Error('Document extraction did not return structured content');
  }

  const structured = extraction.structured;
  await saveStructured(env, task.resourceId, structured);

  metadata.stages.ingest = true;

  await db
    .update(resources)
    .set({
      status: 'processing',
      processingStage: 'vision',
      processingMetadata: serializeMetadata(metadata),
      currentJobId: task.jobId,
      updatedAt: new Date(),
    })
    .where(eq(resources.id, task.resourceId));

  await updateJob(env.JOB_STATUS_KV, task.jobId, {
    status: 'processing',
    currentStep: 'Vision analysis pending',
    progress: 15,
  });

  const hasImages = structured.pages.some((page) => page.images.length > 0);
  if (!hasImages) {
    return { ...task, type: 'CLEANUP', url: undefined, sourceKey: undefined };
  }

  return { ...task, type: 'VISION', url: undefined, sourceKey: undefined };
}

async function checkHasImages(env: Env, resourceId: string): Promise<boolean> {
  try {
    const structured = await loadStructured(env, resourceId);
    return structured.pages.some((page) => page.images.length > 0);
  } catch {
    // If we can't load structured data, assume no images
    return false;
  }
}

export async function runVisionStage(task: QueueMessage, env: Env): Promise<QueueMessage | null> {
  const db = getDb(env.DB);
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY secret');
  }
  const [resourceRow] = await db
    .select({
      metadata: resources.processingMetadata,
      currentJobId: resources.currentJobId,
    })
    .from(resources)
    .where(eq(resources.id, task.resourceId))
    .limit(1);

  // Check if resource exists
  if (!resourceRow) {
    throw new Error(`Resource ${task.resourceId} was deleted during processing`);
  }

  const metadata = parseMetadata(task.resourceId, resourceRow.metadata);

  // Check if this stage is already done OR if another job is processing
  // (optimistic locking via currentJobId)
  if (metadata.stages.vision) {
    return { ...task, type: 'CLEANUP' };
  }

  if (resourceRow.currentJobId && resourceRow.currentJobId !== task.jobId) {
    console.warn(`[Vision Stage] Resource ${task.resourceId} is being processed by job ${resourceRow.currentJobId}, skipping`);
    return null; // Don't queue next task - another job is handling it
  }

  const structured = await loadStructured(env, task.resourceId);
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
      .where(eq(resources.id, task.resourceId));

    await updateJob(env.JOB_STATUS_KV, task.jobId, {
      currentStep: 'Cleanup pending',
      progress: 30,
    });

    return { ...task, type: 'CLEANUP' };
  }

  await enrichPDFImagesWithVision(structured, env.OPENAI_API_KEY, task.gameName, {
    maxConcurrency: 5,
    logContext: {
      resourceId: task.resourceId,
      jobId: task.jobId,
    },
    onProgress: async (processed, total) => {
      // Update job status with detailed progress
      // Progress range for vision: 25-35%
      const progressPercent = 25 + Math.floor((processed / total) * 10);
      await updateJob(env.JOB_STATUS_KV, task.jobId, {
        currentStep: `Vision analysis: ${processed}/${total} images`,
        progress: progressPercent,
      });
    },
    environment: env.ENVIRONMENT, // Use env-based model selection
  });

  await saveStructured(env, task.resourceId, structured);

  metadata.stages.vision = true;
  await db
    .update(resources)
    .set({
      processingStage: 'cleanup',
      processingMetadata: serializeMetadata(metadata),
      updatedAt: new Date(),
    })
    .where(eq(resources.id, task.resourceId));

  await updateJob(env.JOB_STATUS_KV, task.jobId, {
    currentStep: 'Markdown cleanup pending',
    progress: 30,
  });

  return { ...task, type: 'CLEANUP' };
}

export async function runCleanupStage(task: QueueMessage, env: Env): Promise<QueueMessage | null> {
  const db = getDb(env.DB);
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY secret');
  }
  const [resourceRow] = await db
    .select({
      metadata: resources.processingMetadata,
      currentJobId: resources.currentJobId,
    })
    .from(resources)
    .where(eq(resources.id, task.resourceId))
    .limit(1);

  if (!resourceRow) {
    throw new Error(`Resource ${task.resourceId} was deleted during processing`);
  }

  const metadata = parseMetadata(task.resourceId, resourceRow.metadata);

  // Check if this stage is already done OR if another job is processing
  if (metadata.stages.cleanup) {
    return { ...task, type: 'METADATA' };
  }

  if (resourceRow.currentJobId && resourceRow.currentJobId !== task.jobId) {
    console.warn(`[Cleanup Stage] Resource ${task.resourceId} is being processed by job ${resourceRow.currentJobId}, skipping`);
    return null;
  }

  const structured = await loadStructured(env, task.resourceId);

  const cleanedPages = await cleanupMarkdownBatch(
    structured.pages.map((page) => ({
      markdown: page.markdown,
      pageNumber: page.pageNumber,
    })),
    env.OPENAI_API_KEY,
    {
      onProgress: async (processed, total) => {
        // Update job status with detailed progress
        // Progress range for cleanup: 40-50%
        const progressPercent = 40 + Math.floor((processed / total) * 10);
        await updateJob(env.JOB_STATUS_KV, task.jobId, {
          currentStep: `Markdown cleanup: ${processed}/${total} pages`,
          progress: progressPercent,
        });
      },
    }
  );

  structured.pages.forEach((page, index) => {
    page.markdown = cleanedPages[index];
  });

  await saveStructured(env, task.resourceId, structured);

  metadata.stages.cleanup = true;
  await db
    .update(resources)
    .set({
      processingStage: 'metadata',
      processingMetadata: serializeMetadata(metadata),
      updatedAt: new Date(),
    })
    .where(eq(resources.id, task.resourceId));

  await updateJob(env.JOB_STATUS_KV, task.jobId, {
    currentStep: 'Metadata pending',
    progress: 45,
  });

  return { ...task, type: 'METADATA' };
}

export async function runMetadataStage(task: QueueMessage, env: Env): Promise<QueueMessage | null> {
  const db = getDb(env.DB);
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY secret');
  }

  const [resourceRow] = await db
    .select({
      metadata: resources.processingMetadata,
      currentJobId: resources.currentJobId,
      name: resources.name,
      originalFilename: resources.originalFilename,
      description: resources.description,
    })
    .from(resources)
    .where(eq(resources.id, task.resourceId))
    .limit(1);

  if (!resourceRow) {
    throw new Error(`Resource ${task.resourceId} was deleted during processing`);
  }

  const metadata = parseMetadata(task.resourceId, resourceRow.metadata);

  // Check if this stage is already done OR if another job is processing
  if (metadata.stages.metadata) {
    return { ...task, type: 'EMBED' };
  }

  if (resourceRow.currentJobId && resourceRow.currentJobId !== task.jobId) {
    console.warn(`[Metadata Stage] Resource ${task.resourceId} is being processed by job ${resourceRow.currentJobId}, skipping`);
    return null;
  }

  const structured = await loadStructured(env, task.resourceId);

  // Rebuild markdown to get the full content for metadata generation
  const markdownContent = rebuildMarkdownFromPages(structured);

  console.log(
    JSON.stringify({
      module: 'pdf-processor',
      stage: 'metadata',
      event: 'metadata_generation_started',
      resourceId: task.resourceId,
      contentLength: markdownContent.length,
    })
  );

  const metadataResult = await generateResourceMetadata(markdownContent, env.OPENAI_API_KEY, {
    existingName: resourceRow?.name,
    originalFilename: resourceRow?.originalFilename,
  });

  let resolvedName = resourceRow?.name ?? task.name;
  let resolvedDescription = resourceRow?.description ?? null;

  if (metadataResult) {
    resolvedName = metadataResult.name;
    resolvedDescription = metadataResult.description;
    console.log(
      JSON.stringify({
        module: 'pdf-processor',
        stage: 'metadata',
        event: 'metadata_generated',
        resourceId: task.resourceId,
        name: metadataResult.name,
        descriptionLength: metadataResult.description.length,
      })
    );
  } else {
    console.log(
      JSON.stringify({
        module: 'pdf-processor',
        stage: 'metadata',
        event: 'metadata_generation_failed',
        resourceId: task.resourceId,
        reason: 'generateResourceMetadata returned null',
      })
    );
  }

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
    .where(eq(resources.id, task.resourceId));

  await updateJob(env.JOB_STATUS_KV, task.jobId, {
    currentStep: 'Embedding pending',
    progress: 60,
  });

  return { ...task, type: 'EMBED' };
}

function namespaceImageId(resourceId: string, image: PDFImage): string {
  const baseId = image.id.replace(/\.[^./]+$/, '');
  if (!baseId.startsWith(resourceId)) {
    return `${resourceId}-${baseId}`;
  }
  return baseId;
}

function inferMimeTypeFromUrl(url?: string | null): string | null {
  if (!url) {
    return null;
  }

  const match = url.toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/);
  if (!match) {
    return null;
  }

  switch (match[1]) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return null;
  }
}

export async function runEmbedStage(task: QueueMessage, env: Env): Promise<QueueMessage | null> {
  const db = getDb(env.DB);
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY secret');
  }
  if (!env.VECTORIZE) {
    throw new Error('Missing VECTORIZE binding');
  }
  const [resourceRow] = await db
    .select({
      metadata: resources.processingMetadata,
      currentJobId: resources.currentJobId,
      name: resources.name,
      url: resources.url,
      author: resources.author,
      attributionUrl: resources.attributionUrl,
    })
    .from(resources)
    .where(eq(resources.id, task.resourceId))
    .limit(1);

  if (!resourceRow) {
    throw new Error(`Resource ${task.resourceId} was deleted during processing`);
  }

  const metadata = parseMetadata(task.resourceId, resourceRow.metadata);

  // Check if this stage is already done OR if another job is processing
  if (metadata.stages.embed) {
    return { ...task, type: 'FINALIZE' };
  }

  if (resourceRow.currentJobId && resourceRow.currentJobId !== task.jobId) {
    console.warn(`[Embed Stage] Resource ${task.resourceId} is being processed by job ${resourceRow.currentJobId}, skipping`);
    return null;
  }

  const structured = await loadStructured(env, task.resourceId);

  // Normalize image IDs for idempotency
  structured.pages.forEach((page) => {
    page.images.forEach((image) => {
      image.id = namespaceImageId(task.resourceId, image);
    });
  });

  const allImages = structured.pages.flatMap((page) => page.images);
  const imagesToUpload = allImages
    .filter((img) => img.base64)
    .map((img) => ({
      ...img,
      id: namespaceImageId(task.resourceId, img),
      base64: img.base64!,
    }));

  const uploadedImageMap: Map<string, UploadedImage> = new Map();

  if (imagesToUpload.length > 0) {
    const uploadedImages = await uploadPDFImages(env.FILES, task.resourceId, imagesToUpload);
    uploadedImages.forEach((img) => {
      uploadedImageMap.set(img.id, img);
    });

    structured.pages.forEach((page) => {
      page.images.forEach((img) => {
        const uploaded = uploadedImageMap.get(img.id);
        if (uploaded) {
          // Store URL converted from R2 key (for attachment references in markdown)
          img.url = r2KeyToUrl(uploaded.r2Key);
          img.caption = img.caption || uploaded.caption;
          img.mimeType = uploaded.mimeType;
        }
      });
    });

    await saveStructured(env, task.resourceId, structured);
  }

  const resolveMimeType = (image: PDFImage): string | null => {
    const uploaded = uploadedImageMap.get(image.id);
    if (uploaded?.mimeType) {
      return uploaded.mimeType;
    }
    if (typeof image.mimeType === 'string' && image.mimeType.length > 0) {
      return image.mimeType;
    }
    return image.url ? inferMimeTypeFromUrl(image.url) : null;
  };

  await deleteExistingAttachments(env, task.resourceId);
  await deleteExistingFragments(env, task.resourceId);

  const attachmentRecords = structured.pages.flatMap((page) =>
    page.images
      .filter((img) => img.url)
      .map((img) => {
        const uploaded = uploadedImageMap.get(img.id);
        const r2Key = uploaded?.r2Key ?? extractR2KeyFromUrl(img.url!) ?? img.url!;

        return {
          id: img.id,
          gameId: task.gameId,
          resourceId: task.resourceId,
          type: 'image' as const,
          mimeType: resolveMimeType(img) ?? 'application/octet-stream',
          r2Key,
          originalFilename: img.originalFilename ?? null,
          pageNumber: img.pageNumber ?? null,
          bbox: img.bbox ? JSON.stringify(img.bbox) : null,
          caption: img.caption ?? null,
          width: null,
          height: null,
          description: img.description ?? null,
          isGoodQuality: img.isGoodQuality === 'good' ? true : img.isGoodQuality === 'bad' ? false : null,
          createdAt: new Date(),
        };
      })
  );

  // SQLite has a limit on bound parameters (SQLITE_MAX_VARIABLE_NUMBER)
  // With 15 fields per attachment, batch size of 5 = 75 parameters (safe)
  const BATCH_SIZE = 5;
  for (let i = 0; i < attachmentRecords.length; i += BATCH_SIZE) {
    const batch = attachmentRecords.slice(i, i + BATCH_SIZE);
    if (batch.length > 0) {
      await db.insert(attachments).values(batch);
    }
  }

  const allImagesWithUrls = structured.pages.flatMap((page) =>
    page.images.filter((img): img is PDFImage & { url: string } => typeof img.url === 'string' && img.url.length > 0)
  );

  const rebuiltMarkdown = rebuildMarkdownFromPages(structured);
  const finalContent = replaceImageReferences(rebuiltMarkdown, allImagesWithUrls);

  // ======================
  // MULTI-MODAL FRAGMENT GENERATION
  // ======================
  // Create both text and image fragments with enriched searchable content

  console.log(
    JSON.stringify({
      module: 'pdf-processor',
      stage: 'embed',
      event: 'fragment_generation_started',
      resourceId: task.resourceId,
    })
  );

  // Get fresh resource metadata for searchable content
  const [resourceMetadata] = await db
    .select({
      name: resources.name,
      originalFilename: resources.originalFilename,
      description: resources.description,
      resourceType: resources.resourceType,
      edition: resources.edition,
    })
    .from(resources)
    .where(eq(resources.id, task.resourceId))
    .limit(1);

  if (!resourceMetadata) {
    throw new Error(`Resource ${task.resourceId} not found during embed stage`);
  }

  // Prepare resource info for fragments
  const resourceInfo = {
    name: resourceMetadata.name || task.name,
    originalFilename: resourceMetadata.originalFilename ?? null,
    description: resourceMetadata.description ?? null,
    resourceType: (resourceMetadata.resourceType || 'rulebook') as 'rulebook' | 'expansion' | 'faq' | 'errata' | 'reference',
    edition: resourceMetadata.edition ?? null,
  };

  // Step 1: Generate TEXT FRAGMENTS from chunks
  const pdfChunks = await chunkStructuredPDF(structured);

  console.log(
    JSON.stringify({
      module: 'pdf-processor',
      stage: 'embed',
      event: 'text_chunks_generated',
      resourceId: task.resourceId,
      chunkCount: pdfChunks.length,
    })
  );

  // Import new services
  const { buildSearchableContent } = await import('../services/searchable-content');
  const { generateQuestionsForFragments } = await import('../services/hyde');

  // Build searchable content for each text chunk
  const textFragmentsData = pdfChunks.map((chunk) => {
    const searchableContent = buildSearchableContent(
      chunk,
      resourceInfo,
      attachmentRecords.map((att) => ({
        id: att.id,
        description: att.description,
        detectedType: null, // Will be populated by image analysis service
      }))
    );

    return {
      chunk,
      searchableContent,
    };
  });

  // Generate HyDE synthetic questions for text chunks (in batches)
  await updateJob(env.JOB_STATUS_KV, task.jobId, {
    currentStep: 'Generating search questions',
    progress: 70,
  });

  const syntheticQuestionsArrays = await generateQuestionsForFragments(
    pdfChunks.map((chunk) => ({
      content: chunk.content,
      section: chunk.section,
      pageNumber: chunk.pageNumber,
    })),
    resourceInfo,
    env.OPENAI_API_KEY,
    {
      batchSize: 10,
      count: 5,
      environment: env.ENVIRONMENT, // Use env-based model selection
    }
  );

  console.log(
    JSON.stringify({
      module: 'pdf-processor',
      stage: 'embed',
      event: 'hyde_questions_generated',
      resourceId: task.resourceId,
      totalQuestions: syntheticQuestionsArrays.reduce((sum, arr) => sum + arr.length, 0),
    })
  );

  // Step 2: Generate IMAGE FRAGMENTS for relevant images
  const { buildImageSearchableContent } = await import('../services/searchable-content');

  const relevantImages = structured.pages.flatMap((page) =>
    page.images
      .filter((img) => img.isGoodQuality === 'good' && img.url)
      .map((img) => ({
        image: img,
        page: {
          pageNumber: page.pageNumber,
          sections: page.sections,
        },
      }))
  );

  const imageFragmentsData = relevantImages.map(({ image, page }) => {
    const attachment = attachmentRecords.find((att) => att.id === image.id);

    if (!attachment) {
      return null;
    }

    const searchableContent = buildImageSearchableContent(
      image,
      {
        description: attachment.description,
        detectedType: null, // Will be set if we add image type detection
        caption: attachment.caption,
        ocrText: null, // Will be set if we add OCR
      },
      page,
      resourceInfo
    );

    return {
      image,
      attachment,
      page,
      searchableContent,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  console.log(
    JSON.stringify({
      module: 'pdf-processor',
      stage: 'embed',
      event: 'image_fragments_generated',
      resourceId: task.resourceId,
      imageFragmentCount: imageFragmentsData.length,
    })
  );

  // Step 3: Combine text + image fragments for embedding
  const allFragmentsForEmbedding = [
    ...textFragmentsData.map((item, index) => ({
      type: 'text' as const,
      content: item.chunk.content,
      searchableContent: item.searchableContent,
      syntheticQuestions: syntheticQuestionsArrays[index] || [],
      pageNumber: item.chunk.pageNumber,
      pageRange: item.chunk.pageRange,
      section: item.chunk.section,
      images: item.chunk.images,
      attachmentId: null,
    })),
    ...imageFragmentsData.map((item) => ({
      type: 'image' as const,
      content: item.attachment.description || '',
      searchableContent: item.searchableContent,
      syntheticQuestions: [] as string[], // Images don't get HyDE questions (for now)
      pageNumber: item.page.pageNumber,
      pageRange: null,
      section: item.page.sections.length > 0
        ? item.page.sections[item.page.sections.length - 1].hierarchy
        : null,
      images: item.image.url ? [{
        id: item.image.id,
        url: item.image.url,
        bbox: item.image.bbox,
        caption: item.image.caption,
      }] : null,
      attachmentId: item.attachment.id,
    })),
  ];

  // Step 4: Generate embeddings from searchable content + synthetic questions
  await updateJob(env.JOB_STATUS_KV, task.jobId, {
    currentStep: `Generating embeddings: ${allFragmentsForEmbedding.length} fragments`,
    progress: 75,
  });

  // Build array of all texts to embed (content + questions)
  const textsToEmbed: Array<{
    content: string;
    pageNumber?: number;
    pageRange?: [number, number];
    section?: string;
    images?: any;
  }> = [];

  // Track which embeddings belong to which fragments
  const embeddingMap: Array<{
    fragmentIndex: number;
    isQuestion: boolean;
    questionIndex?: number;
    questionText?: string;
  }> = [];

  allFragmentsForEmbedding.forEach((item, fragmentIndex) => {
    // 1. Always embed the content itself
    textsToEmbed.push({
      content: item.searchableContent,
      pageNumber: item.pageNumber,
      pageRange: item.pageRange ?? undefined,
      section: item.section ?? undefined,
      images: item.images ?? undefined,
    });
    embeddingMap.push({ fragmentIndex, isQuestion: false });

    // 2. Embed each synthetic question (for text fragments only)
    if (item.type === 'text' && item.syntheticQuestions.length > 0) {
      item.syntheticQuestions.forEach((question, qIdx) => {
        textsToEmbed.push({
          content: question,
          pageNumber: item.pageNumber,
          section: item.section ?? undefined,
        });
        embeddingMap.push({
          fragmentIndex,
          isQuestion: true,
          questionIndex: qIdx,
          questionText: question,
        });
      });
    }
  });

  const [embeddingsData, version] = await generateEmbeddings(
    textsToEmbed,
    env.OPENAI_API_KEY
  );

  console.log(
    JSON.stringify({
      module: 'pdf-processor',
      stage: 'embed',
      event: 'embeddings_generated',
      resourceId: task.resourceId,
      contentEmbeddings: allFragmentsForEmbedding.length,
      questionEmbeddings: embeddingsData.length - allFragmentsForEmbedding.length,
      totalEmbeddings: embeddingsData.length,
      version,
    })
  );

  // Step 5: Create fragment records with all new fields
  const fragmentRecords = allFragmentsForEmbedding.map((item) => ({
    id: nanoid(),
    gameId: task.gameId,
    resourceId: task.resourceId,
    type: item.type,
    attachmentId: item.attachmentId,
    content: item.content, // Clean content for display
    searchableContent: item.searchableContent, // Enriched content (what was embedded)
    syntheticQuestions: item.syntheticQuestions.length > 0
      ? JSON.stringify(item.syntheticQuestions)
      : null,
    resourceName: resourceInfo.name,
    resourceDescription: resourceInfo.description,
    resourceType: resourceInfo.resourceType,
    version,
    pageNumber: item.pageNumber ?? null,
    pageRangeStart: item.pageRange ? item.pageRange[0] : null,
    pageRangeEnd: item.pageRange ? item.pageRange[1] : null,
    section: item.section ?? null,
    images: item.images ? JSON.stringify(item.images) : null,
  }));

  console.log(
    JSON.stringify({
      module: 'pdf-processor',
      stage: 'embed',
      event: 'fragment_records_created',
      resourceId: task.resourceId,
      textFragments: fragmentRecords.filter((f) => f.type === 'text').length,
      imageFragments: fragmentRecords.filter((f) => f.type === 'image').length,
    })
  );

  if (fragmentRecords.length > 0) {
    const FRAGMENT_BATCH_SIZE = 5; // Reduced from 10 due to many new fields (17 columns per row)

    // Step 6: Insert fragments to D1 (source of truth)
    await updateJob(env.JOB_STATUS_KV, task.jobId, {
      currentStep: `Storing ${fragmentRecords.length} fragments`,
      progress: 80,
    });

    for (let i = 0; i < fragmentRecords.length; i += FRAGMENT_BATCH_SIZE) {
      const fragmentBatch = fragmentRecords.slice(i, i + FRAGMENT_BATCH_SIZE);
      if (fragmentBatch.length > 0) {
        await db.insert(fragments).values(fragmentBatch);
      }
    }

    // Step 7: Insert embeddings to Vectorize with rollback on failure
    // Create vectors for both content and questions
    const vectorizeEntries = embeddingMap.map((mapping, embeddingIndex) => {
      const fragment = fragmentRecords[mapping.fragmentIndex];
      const embedding = embeddingsData[embeddingIndex].embedding;

      if (mapping.isQuestion) {
        // Question vector: separate ID, links back to parent fragment
        return {
          id: `${fragment.id}-q${mapping.questionIndex}`,
          values: embedding,
          metadata: {
            fragmentId: fragment.id,
            gameId: task.gameId,
            resourceId: task.resourceId,
            type: 'question' as const,
            questionIndex: mapping.questionIndex!,
            questionText: mapping.questionText!,
            ...(fragment.pageNumber != null && { pageNumber: fragment.pageNumber }),
            ...(fragment.section != null && { section: fragment.section }),
          },
        };
      } else {
        // Content vector: main fragment embedding
        return {
          id: fragment.id,
          values: embedding,
          metadata: {
            fragmentId: fragment.id,
            gameId: task.gameId,
            resourceId: task.resourceId,
            type: 'content' as const,
            fragmentType: fragment.type,
            ...(fragment.pageNumber != null && { pageNumber: fragment.pageNumber }),
            ...(fragment.section != null && { section: fragment.section }),
          },
        };
      }
    });

    try {
      await insertEmbeddings(env.VECTORIZE!, vectorizeEntries);
    } catch (vectorizeError) {
      // Rollback: Delete the fragments we just inserted since Vectorize failed
      console.error(`[Embed Stage] Vectorize insert failed, rolling back D1 fragments:`, vectorizeError);
      try {
        await db.delete(fragments).where(eq(fragments.resourceId, task.resourceId));
        console.log(`[Embed Stage] Successfully rolled back ${fragmentRecords.length} fragments from D1`);
      } catch (rollbackError) {
        console.error(`[Embed Stage] Rollback failed - orphaned fragments in D1:`, rollbackError);
      }
      throw vectorizeError; // Re-throw to mark job as failed
    }
  }

  const stats = calculateResourceStats(finalContent, structured);

  metadata.stages.embed = true;
  await db
    .update(resources)
    .set({
      content: finalContent,
      version,
      pdfExtractor: 'mistral',
      processedAt: new Date(),
      processingStage: 'finalize',
      processingMetadata: serializeMetadata(metadata),
      pageCount: stats.pageCount,
      imageCount: stats.imageCount,
      wordCount: stats.wordCount,
      updatedAt: new Date(),
    })
    .where(eq(resources.id, task.resourceId));

  await updateJob(env.JOB_STATUS_KV, task.jobId, {
    currentStep: 'Finalizing resource',
    progress: 85,
  });

  return { ...task, type: 'FINALIZE' };
}

export async function runFinalizeStage(task: QueueMessage, env: Env): Promise<QueueMessage | null> {
  const db = getDb(env.DB);
  // Keep structured.json for reprocessing - don't delete it
  // await deleteStructured(env, task.resourceId);

  await db
    .update(resources)
    .set({
      status: 'ready',
      processingStage: 'ready',
      processingMetadata: null,
      currentJobId: null,
      updatedAt: new Date(),
    })
    .where(eq(resources.id, task.resourceId));

  await updateJob(env.JOB_STATUS_KV, task.jobId, {
    status: 'completed',
    currentStep: 'Processing complete',
    progress: 100,
    completedAt: Date.now(),
  });

  return null;
}

export async function handleProcessingTask(task: QueueMessage, env: Env): Promise<QueueMessage | null> {
  switch (task.type) {
    case 'INGEST':
      return runIngestStage(task, env);
    case 'VISION':
      return runVisionStage(task, env);
    case 'CLEANUP':
      return runCleanupStage(task, env);
    case 'METADATA':
      return runMetadataStage(task, env);
    case 'EMBED':
      return runEmbedStage(task, env);
    case 'FINALIZE':
      return runFinalizeStage(task, env);
    default:
      throw new Error(`Unknown queue task type ${(task as QueueMessage).type}`);
  }
}
