import type { Env, QueueMessage } from '@/types';
import { nanoid } from 'nanoid';
import { getDb, resources, fragments, attachments } from '../db';
import { eq } from 'drizzle-orm';
import { extractTextFromPdf, rebuildMarkdownFromPages, replaceImageReferences } from '../pdf';
import { chunkStructuredPDF, calculateResourceStats } from '../services/chunking';
import { uploadPDFImages, deleteAttachmentsByUrls, extractR2KeyFromUrl } from '../services/r2-storage';
import type { UploadedImage } from '../services/r2-storage';
import { generateEmbeddings } from '../ai/embeddings';
import { insertEmbeddings, deleteEmbeddings } from '../ai/vectorize';
import type { StructuredPDFContent, PDFImage } from '../types/pdf';
import { enrichPDFImagesWithVision } from '../services/vision';
import { cleanupMarkdownBatch } from '../services/markdown-cleanup';
import { updateJob } from '../jobs/status';
import { summarizeResource } from '../services/resource-summary';

const STRUCTURED_KEY = (resourceId: string) => `resources/${resourceId}/structured.json`;

interface ResourceProcessingMetadata {
  structuredKey: string;
  stages: {
    ingest: boolean;
    vision: boolean;
    cleanup: boolean;
    embed: boolean;
    summary: boolean;
  };
}

function defaultMetadata(resourceId: string): ResourceProcessingMetadata {
  return {
    structuredKey: STRUCTURED_KEY(resourceId),
    stages: {
      ingest: false,
      vision: false,
      cleanup: false,
      embed: false,
      summary: false,
    },
  };
}

function parseMetadata(resourceId: string, value?: string | null): ResourceProcessingMetadata {
  if (!value) {
    return defaultMetadata(resourceId);
  }

  try {
    const parsed = JSON.parse(value) as ResourceProcessingMetadata;
    if (!parsed.structuredKey) {
      parsed.structuredKey = STRUCTURED_KEY(resourceId);
    }
    if (!parsed.stages) {
      parsed.stages = defaultMetadata(resourceId).stages;
    } else {
      parsed.stages = {
        ...defaultMetadata(resourceId).stages,
        ...parsed.stages,
      };
    }
    return parsed;
  } catch {
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

async function deleteStructured(env: Env, resourceId: string): Promise<void> {
  try {
    await env.FILES.delete(STRUCTURED_KEY(resourceId));
  } catch (error) {
    console.warn(`[${resourceId}] Failed to delete structured data:`, error);
  }
}

async function fetchPdfBuffer(task: QueueMessage, env: Env): Promise<Buffer> {
  if (task.sourceKey) {
    const object = await env.FILES.get(task.sourceKey);
    if (object) {
      const arrayBuffer = await object.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    console.warn(`[${task.resourceId}] Source PDF not found in R2 at key ${task.sourceKey}, falling back to URL fetch`);
  }

  if (!task.url) {
    throw new Error('No URL or source key provided for PDF ingestion');
  }

  const keyFromUrl = extractR2KeyFromUrl(task.url);
  if (keyFromUrl) {
    const object = await env.FILES.get(keyFromUrl);
    if (object) {
      const arrayBuffer = await object.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  }

  const response = await fetch(task.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF (status ${response.status} ${response.statusText})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function deleteExistingAttachments(env: Env, resourceId: string) {
  const db = getDb(env.DB);
  const existingAttachments = await db
    .select({ url: attachments.url })
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId))
    .all();

  if (existingAttachments.length > 0) {
    await db.delete(attachments).where(eq(attachments.resourceId, resourceId));
    const urls = existingAttachments
      .map((attachment) => attachment.url)
      .filter((url): url is string => typeof url === 'string' && url.length > 0);

    if (urls.length > 0) {
      await deleteAttachmentsByUrls(env.FILES, urls);
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
    const vectorIds = existingFragments
      .map((fragment) => fragment.id)
      .filter((id) => id.length <= MAX_VECTOR_ID_LENGTH);

    if (vectorIds.length > 0) {
      await deleteEmbeddings(env.VECTORIZE, vectorIds);
    }

    const skipped = existingFragments.filter((fragment) => fragment.id.length > MAX_VECTOR_ID_LENGTH);
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
  const buffer = await fetchPdfBuffer(task, env);
  const extraction = await extractTextFromPdf(buffer, env.MISTRAL_API_KEY);

  if (!extraction.structured) {
    throw new Error('PDF extraction did not return structured content');
  }

  const structured = extraction.structured;
  await saveStructured(env, task.resourceId, structured);

  const metadata = defaultMetadata(task.resourceId);
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
    progress: 20,
  });

  const hasImages = structured.pages.some((page) => page.images.length > 0);
  if (!hasImages) {
    return { ...task, type: 'CLEANUP', url: undefined, sourceKey: undefined };
  }

  return { ...task, type: 'VISION', url: undefined, sourceKey: undefined };
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

  const metadata = parseMetadata(task.resourceId, resourceRow?.metadata);

  // Check if this stage is already done OR if another job is processing
  // (optimistic locking via currentJobId)
  if (metadata.stages.vision) {
    return { ...task, type: 'CLEANUP' };
  }

  if (resourceRow?.currentJobId && resourceRow.currentJobId !== task.jobId) {
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
      progress: 35,
    });

    return { ...task, type: 'CLEANUP' };
  }

  await enrichPDFImagesWithVision(structured, env.OPENAI_API_KEY, task.gameName, {
    maxConcurrency: 5,
    logContext: {
      resourceId: task.resourceId,
      jobId: task.jobId,
    },
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
    progress: 45,
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

  const metadata = parseMetadata(task.resourceId, resourceRow?.metadata);

  // Check if this stage is already done OR if another job is processing
  if (metadata.stages.cleanup) {
    return { ...task, type: 'EMBED' };
  }

  if (resourceRow?.currentJobId && resourceRow.currentJobId !== task.jobId) {
    console.warn(`[Cleanup Stage] Resource ${task.resourceId} is being processed by job ${resourceRow.currentJobId}, skipping`);
    return null;
  }

  const structured = await loadStructured(env, task.resourceId);

  const cleanedPages = await cleanupMarkdownBatch(
    structured.pages.map((page) => ({
      markdown: page.markdown,
      pageNumber: page.pageNumber,
    })),
    env.OPENAI_API_KEY
  );

  structured.pages.forEach((page, index) => {
    page.markdown = cleanedPages[index];
  });

  await saveStructured(env, task.resourceId, structured);

  metadata.stages.cleanup = true;
  await db
    .update(resources)
    .set({
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
      description: resources.description,
      originalFilename: resources.originalFilename,
      author: resources.author,
      attributionUrl: resources.attributionUrl,
    })
    .from(resources)
    .where(eq(resources.id, task.resourceId))
    .limit(1);

  const metadata = parseMetadata(task.resourceId, resourceRow?.metadata);

  // Check if this stage is already done OR if another job is processing
  if (metadata.stages.embed) {
    return { ...task, type: 'FINALIZE' };
  }

  if (resourceRow?.currentJobId && resourceRow.currentJobId !== task.jobId) {
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
          img.url = uploaded.url;
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
      .map((img) => ({
        id: img.id,
        gameId: task.gameId,
        resourceId: task.resourceId,
        type: 'image' as const,
        mimeType: resolveMimeType(img) ?? 'application/octet-stream',
        url: img.url!,
        originalFilename: img.originalFilename ?? null,
        pageNumber: img.pageNumber ?? null,
        bbox: img.bbox ? JSON.stringify(img.bbox) : null,
        caption: img.caption ?? null,
        width: null,
        height: null,
        createdAt: new Date(),
      }))
  );

  const BATCH_SIZE = 10;
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

  const pdfChunks = await chunkStructuredPDF(structured);
  const [embeddingsData, version] = await generateEmbeddings(pdfChunks, env.OPENAI_API_KEY);

  const fragmentRecords = embeddingsData.map((embedding) => ({
    id: nanoid(),
    gameId: task.gameId,
    resourceId: task.resourceId,
    content: embedding.content,
    version,
    pageNumber: embedding.pageNumber ?? null,
    pageRangeStart: embedding.pageRange ? embedding.pageRange[0] : null,
    pageRangeEnd: embedding.pageRange ? embedding.pageRange[1] : null,
    section: embedding.section ?? null,
    images: embedding.images ? JSON.stringify(embedding.images) : null,
  }));

  if (fragmentRecords.length > 0) {
    const FRAGMENT_BATCH_SIZE = 10;

    for (let i = 0; i < fragmentRecords.length; i += FRAGMENT_BATCH_SIZE) {
      const fragmentBatch = fragmentRecords.slice(i, i + FRAGMENT_BATCH_SIZE);
      if (fragmentBatch.length > 0) {
        await db.insert(fragments).values(fragmentBatch);
      }
    }

    await insertEmbeddings(
      env.VECTORIZE!,
      fragmentRecords.map((fragment, index) => ({
        id: fragment.id,
        values: embeddingsData[index].embedding,
        metadata: {
          fragmentId: fragment.id,
          gameId: task.gameId,
          resourceId: task.resourceId,
          ...(fragment.pageNumber != null && { pageNumber: fragment.pageNumber }),
          ...(fragment.section != null && { section: fragment.section }),
        },
      }))
    );
  }

  let summaryResult: Awaited<ReturnType<typeof summarizeResource>> | null = null;
  if (!metadata.stages.summary && env.OPENAI_API_KEY) {
    summaryResult = await summarizeResource(finalContent, env.OPENAI_API_KEY, {
      existingName: resourceRow?.name,
      originalFilename: resourceRow?.originalFilename,
    });

    if (summaryResult) {
      metadata.stages.summary = true;
    }
  }

  const resolvedName = summaryResult?.name ?? resourceRow?.name ?? task.name;
  const resolvedDescription = summaryResult?.description ?? resourceRow?.description ?? null;
  const resolvedAuthor = resourceRow?.author ?? null;
  const resolvedAttributionUrl = resourceRow?.attributionUrl ?? null;

  const stats = calculateResourceStats(finalContent, structured);

  await db
    .update(resources)
    .set({
      content: finalContent,
      version,
      pdfExtractor: 'mistral',
      processedAt: new Date(),
      processingStage: 'finalize',
      processingMetadata: serializeMetadata({
        ...metadata,
        stages: {
          ...metadata.stages,
          embed: true,
        },
      }),
      originalFilename: resourceRow?.originalFilename ?? task.name,
      name: resolvedName,
      description: resolvedDescription,
      author: resolvedAuthor,
      attributionUrl: resolvedAttributionUrl,
      pageCount: stats.pageCount,
      imageCount: stats.imageCount,
      wordCount: stats.wordCount,
      updatedAt: new Date(),
    })
    .where(eq(resources.id, task.resourceId));

  await updateJob(env.JOB_STATUS_KV, task.jobId, {
    currentStep: 'Finalizing resource',
    progress: 90,
  });

  return { ...task, type: 'FINALIZE' };
}

export async function runFinalizeStage(task: QueueMessage, env: Env): Promise<QueueMessage | null> {
  const db = getDb(env.DB);
  await deleteStructured(env, task.resourceId);

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
    case 'EMBED':
      return runEmbedStage(task, env);
    case 'FINALIZE':
      return runFinalizeStage(task, env);
    default:
      throw new Error(`Unknown queue task type ${(task as QueueMessage).type}`);
  }
}
