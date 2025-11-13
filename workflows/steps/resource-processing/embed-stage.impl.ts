/**
 * EMBED Stage Implementation
 *
 * This is extracted from the main workflow to keep the code manageable.
 * The EMBED stage is responsible for:
 * 1. Uploading images to blob storage
 * 2. Creating attachment records
 * 3. Chunking text content
 * 4. Generating HyDE questions
 * 5. Building searchable content
 * 6. Generating embeddings
 * 7. Storing fragments and embeddings in database
 */

import { db } from '@/lib/db';
import { resources, fragments, attachments, embeddings } from '@/lib/db/schema';
import type { NewFragment, ImageMetadata } from '@/lib/db/schema/fragments';
import type { NewEmbedding } from '@/lib/db/schema/embeddings';
import type { Attachment, NewAttachment } from '@/lib/db/schema/attachments';
import { eq, inArray } from 'drizzle-orm';
import type { StructuredPDFContent, PDFImage } from '@/lib/types/pdf';
import { nanoid } from 'nanoid';
import type { ProcessResourceInput } from '@/workflows/support/types';
import {
  blobKeyToUrl,
  bulkDelete,
  extractBlobKeyFromUrl,
  uploadPDFImages,
  blobExists,
  type UploadedImage,
} from '@/lib/services/blob-storage';
import { recordWorkflowStage } from '@/lib/services/workflow-run-store';

const CURRENT_EMBEDDING_VERSION = 3; // Match workers implementation

type EmbedAttachmentRecord = Omit<NewAttachment, 'id' | 'blobKey' | 'mimeType'> & {
  id: string;
  blobKey: string;
  mimeType: string;
};

type EmbeddableFragment = {
  type: 'text' | 'image' | 'table';
  content: string;
  searchableContent: string;
  syntheticQuestions: string[];
  answerTypes: string[];
  pageNumber?: number;
  pageRange?: [number, number] | null;
  section?: string | null;
  images: ImageMetadata[] | null;
  attachmentId: string | null;
};

type FragmentRecord = NewFragment & { id: string };

export async function runEmbedStageImpl(input: ProcessResourceInput, structured: StructuredPDFContent) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

  // Normalize image IDs for idempotency
  structured.pages.forEach((page) => {
    page.images.forEach((image) => {
      image.id = namespaceImageId(input.resourceId, image);
    });
  });

  const allImages = structured.pages.flatMap((page) => page.images);
  const existingAttachments = await loadExistingAttachments(input.resourceId);
  const existingAttachmentMap = new Map(existingAttachments.map((attachment) => [attachment.id, attachment]));

  const uploadedImageMap = new Map<string, UploadedImage>();
  const imageBlobState = new Map<string, string | null>();
  const imagesToUpload: Array<{
    id: string;
    base64: string;
    originalFilename?: string;
    pageNumber?: number;
    bbox?: number[];
    caption?: string;
  }> = [];
  const unrecoverableImages: string[] = [];

  for (const img of allImages) {
    const existing = existingAttachmentMap.get(img.id);
    const blobKeyFromExisting = normalizeBlobKey(existing?.blobKey);
    const blobKeyFromUrl = normalizeBlobKey(img.url);
    const preferredBlobKey = blobKeyFromExisting ?? blobKeyFromUrl;

    let hasBlob = false;
    if (preferredBlobKey) {
      hasBlob = await blobExists(preferredBlobKey);
    }

    imageBlobState.set(img.id, preferredBlobKey ?? null);

    if (hasBlob) {
      continue;
    }

    if (img.base64) {
      imagesToUpload.push({
        id: img.id,
        base64: img.base64!,
        originalFilename: img.originalFilename,
        pageNumber: img.pageNumber,
        bbox: img.bbox,
        caption: img.caption,
      });
    } else {
      unrecoverableImages.push(img.id);
    }
  }

  if (unrecoverableImages.length > 0) {
    console.warn(
      `[Embed Stage] Unable to repair ${unrecoverableImages.length} images for resource ${input.resourceId}: ${unrecoverableImages.join(', ')}`
    );
  }

  let structuredChanged = false;

  if (imagesToUpload.length > 0) {
    await recordWorkflowStage(input.runId, 'embed', {
      status: `Uploading ${imagesToUpload.length} images`,
    });

    const uploadedImages = await uploadPDFImages(input.resourceId, imagesToUpload);

    uploadedImages.forEach((img) => {
      uploadedImageMap.set(img.id, img);
      imageBlobState.set(img.id, img.blobKey);
    });

    // Update structured data with uploaded image URLs
    structured.pages.forEach((page) => {
      page.images.forEach((img) => {
        const uploaded = uploadedImageMap.get(img.id);
        if (uploaded) {
          if (img.url !== uploaded.url) {
            img.url = uploaded.url;
            structuredChanged = true;
          }
          if ((!img.mimeType || img.mimeType !== uploaded.mimeType) && uploaded.mimeType) {
            img.mimeType = uploaded.mimeType;
            structuredChanged = true;
          }
          if (!img.caption && uploaded.caption) {
            img.caption = uploaded.caption;
            structuredChanged = true;
          }
        }
      });
    });
  }

  // Create/upsert attachment records with proper typing
  const attachmentRecords: EmbedAttachmentRecord[] = [];
  const attachmentIdsToKeep = new Set<string>();

  structured.pages.forEach((page) => {
    page.images.forEach((img) => {
      if (!img.id) {
        return;
      }

      if (!img.url && !uploadedImageMap.has(img.id)) {
        const existing = existingAttachmentMap.get(img.id);
        const normalizedExistingKey = normalizeBlobKey(existing?.blobKey);
        if (normalizedExistingKey) {
          img.url = blobKeyToUrl(normalizedExistingKey);
          structuredChanged = true;
        }
      }

      attachmentIdsToKeep.add(img.id);
      const uploaded = uploadedImageMap.get(img.id);
      const existing = existingAttachmentMap.get(img.id);
      const blobStateKey = imageBlobState.get(img.id);
      const blobKeyFromUpload = uploaded?.blobKey;
      const blobKeyFromExisting = normalizeBlobKey(existing?.blobKey);
      const blobKeyFromUrl = normalizeBlobKey(img.url);
      const blobKey =
        blobKeyFromUpload ??
        blobKeyFromExisting ??
        blobStateKey ??
        blobKeyFromUrl;

      if (!blobKey) {
        console.warn(
          `[Embed Stage] Missing blob key for image ${img.id} (resource ${input.resourceId}), skipping attachment creation`
        );
        return;
      }

      let url = uploaded?.url ?? img.url ?? existing?.url ?? null;
      if (!url) {
        url = blobKeyToUrl(blobKey);
        img.url = url;
        structuredChanged = true;
      }

      if (!img.mimeType && (uploaded?.mimeType || existing?.mimeType)) {
        img.mimeType = uploaded?.mimeType ?? existing?.mimeType ?? undefined;
        structuredChanged = true;
      }

      const record: EmbedAttachmentRecord = {
        id: img.id,
        gameId: input.gameId,
        resourceId: input.resourceId,
        type: 'image' as const,
        mimeType: resolveMimeType(img, uploaded, existing) ?? 'image/png',
        blobKey,
        url,
        originalFilename: img.originalFilename ?? existing?.originalFilename ?? null,
        pageNumber: img.pageNumber ?? existing?.pageNumber ?? null,
        bbox: normalizeBbox(img.bbox) ?? normalizeBbox(existing?.bbox) ?? null,
        caption: img.caption ?? existing?.caption ?? null,
        width: uploaded?.width ?? existing?.width ?? null,
        height: uploaded?.height ?? existing?.height ?? null,
        description: img.description ?? existing?.description ?? null,
        isGoodQuality: img.isGoodQuality ?? existing?.isGoodQuality ?? null,
        isRelevant:
          typeof img.isRelevant === 'number'
            ? img.isRelevant
            : existing?.isRelevant ?? null,
        detectedType: img.detectedType ?? existing?.detectedType ?? null,
        ocrText: img.ocrText ?? existing?.ocrText ?? null,
        createdAt: existing?.createdAt ?? Date.now(),
      };

      attachmentRecords.push(record);
    });
  });

  if (structuredChanged) {
    await saveStructured(input.resourceId, structured);
  }

  await upsertAttachments(attachmentRecords);
  await deleteOrphanAttachments(input.resourceId, attachmentIdsToKeep);
  await deleteExistingFragments(input.resourceId);

  // Rebuild final markdown with attachment references
  const { rebuildMarkdownFromPages, replaceImageReferences } = await import('@/lib/pdf');
  const allImagesWithUrls = structured.pages.flatMap((page) =>
    page.images.filter((img): img is PDFImage & { url: string } => !!img.url && img.url.length > 0)
  );

  const rebuiltMarkdown = rebuildMarkdownFromPages(structured);
  const finalContent = replaceImageReferences(rebuiltMarkdown, allImagesWithUrls);

  // Get resource metadata for searchable content
  const [resourceMetadata] = await db
    .select({
      name: resources.name,
      originalFilename: resources.originalFilename,
      description: resources.description,
      resourceType: resources.resourceType,
      edition: resources.edition,
    })
    .from(resources)
    .where(eq(resources.id, input.resourceId))
    .limit(1);

  if (!resourceMetadata) {
    throw new Error(`Resource ${input.resourceId} not found during embed stage`);
  }

  const resourceInfo = {
    name: resourceMetadata.name || input.name,
    originalFilename: resourceMetadata.originalFilename ?? null,
    description: resourceMetadata.description ?? null,
    resourceType: (resourceMetadata.resourceType || 'rulebook') as 'rulebook' | 'expansion' | 'faq' | 'errata' | 'reference',
    edition: resourceMetadata.edition ?? null,
  };

  // Chunk structured PDF
  const { chunkStructuredPDF } = await import('@/lib/services/chunking');
  const pdfChunks = await chunkStructuredPDF(structured);

  console.log(
    JSON.stringify({
      module: 'embed-stage',
      event: 'text_chunks_generated',
      resourceId: input.resourceId,
      chunkCount: pdfChunks.length,
    })
  );

  await recordWorkflowStage(input.runId, 'embed', {
    status: `Generating HyDE questions for ${pdfChunks.length} chunks`,
  });

  // Generate HyDE questions
  const { generateQuestionsForFragments } = await import('@/lib/services/hyde');
  const syntheticQuestionsArrays = await generateQuestionsForFragments(
    pdfChunks.map((chunk) => ({
      content: chunk.content,
      section: chunk.section,
      pageNumber: chunk.pageNumber,
    })),
    resourceInfo,
    OPENAI_API_KEY,
    {
      batchSize: 10,
      count: 5,
    }
  );

  console.log(
    JSON.stringify({
      module: 'embed-stage',
      event: 'hyde_questions_generated',
      resourceId: input.resourceId,
      totalQuestions: syntheticQuestionsArrays.reduce((sum, arr) => sum + arr.length, 0),
    })
  );


  // Generate answer type classifications for text chunks
  const { classifyFragmentsAnswerTypes } = await import('@/lib/services/answer-type-classification');
  const answerTypesArrays = await classifyFragmentsAnswerTypes(
    pdfChunks.map((chunk) => ({
      content: chunk.content,
      section: chunk.section,
      pageNumber: chunk.pageNumber,
    })),
    resourceInfo,
    OPENAI_API_KEY,
    {
      batchSize: 10,
    }
  );

  console.log(
    JSON.stringify({
      module: 'embed-stage',
      event: 'answer_types_classified',
      resourceId: input.resourceId,
      totalClassifications: answerTypesArrays.reduce((sum, arr) => sum + arr.length, 0),
    })
  );

  // Build searchable content for text chunks
  const { buildSearchableContent, buildImageSearchableContent } = await import('@/lib/services/searchable-content');

  const textFragmentsData = pdfChunks.map((chunk, index) => {
    const searchableContent = buildSearchableContent(
      chunk,
      resourceInfo,
      attachmentRecords.map((att) => ({
        id: att.id,
        description: att.description ?? null,
        detectedType: null,
      }))
    );

    return {
      chunk,
      searchableContent,
      syntheticQuestions: syntheticQuestionsArrays[index] || [],
      answerTypes: answerTypesArrays[index] || [],
    };
  });

  // Build image fragments for good quality images
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

  const imageFragmentsData = relevantImages
    .map(({ image, page }) => {
      const attachment = attachmentRecords.find((att) => att.id === image.id);
      if (!attachment) return null;

      const searchableContent = buildImageSearchableContent(
        image,
        {
          description: attachment.description ?? null,
          detectedType: null,
          caption: attachment.caption ?? null,
          ocrText: null,
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
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  console.log(
    JSON.stringify({
      module: 'embed-stage',
      event: 'image_fragments_generated',
      resourceId: input.resourceId,
      imageFragmentCount: imageFragmentsData.length,
    })
  );

  // Combine all fragments for embedding
  const allFragmentsForEmbedding: EmbeddableFragment[] = [
    ...textFragmentsData.map((item) => {
      const images: ImageMetadata[] = item.chunk.images.map((image) =>
        buildFragmentImageMetadata({
          id: image.id,
          url: image.url,
          bbox: image.bbox,
          caption: image.caption ?? null,
          description: null,
        })
      );

      return {
        type: 'text' as const,
        content: item.chunk.content,
        searchableContent: item.searchableContent,
        syntheticQuestions: item.syntheticQuestions,
        answerTypes: item.answerTypes,
        pageNumber: item.chunk.pageNumber,
        pageRange: item.chunk.pageRange ?? null,
        section: item.chunk.section ?? null,
        images: images.length > 0 ? images : null,
        attachmentId: null,
      };
    }),
    ...imageFragmentsData.map((item) => {
      const imageMetadata = item.image.url
        ? buildFragmentImageMetadata({
            id: item.image.id,
            url: item.image.url,
            bbox: item.image.bbox,
            caption: item.image.caption ?? null,
            description: item.image.description ?? item.attachment.description ?? null,
          })
        : null;

      return {
        type: 'image' as const,
        content: item.attachment.description || '',
        searchableContent: item.searchableContent,
        syntheticQuestions: [] as string[],
        answerTypes: [] as string[],
        pageNumber: item.page.pageNumber,
        pageRange: null,
        section:
          item.page.sections.length > 0
            ? item.page.sections[item.page.sections.length - 1].hierarchy
            : null,
        images: imageMetadata ? [imageMetadata] : null,
        attachmentId: item.attachment.id,
      };
    }),
  ];


  // Prepare texts to embed (content + questions)
  const textsToEmbed: string[] = [];
  const embeddingMap: Array<{
    fragmentIndex: number;
    isQuestion: boolean;
    questionIndex?: number;
    questionText?: string;
  }> = [];

  allFragmentsForEmbedding.forEach((item, fragmentIndex) => {
    // Embed content
    textsToEmbed.push(item.searchableContent);
    embeddingMap.push({ fragmentIndex, isQuestion: false });

    // Embed synthetic questions
    item.syntheticQuestions.forEach((question, qIdx) => {
      textsToEmbed.push(question);
      embeddingMap.push({
        fragmentIndex,
        isQuestion: true,
        questionIndex: qIdx,
        questionText: question,
      });
    });
  });

  await recordWorkflowStage(input.runId, 'embed', {
    status: `Generating ${textsToEmbed.length} embeddings`,
  });

  // Generate embeddings
  const { generateEmbeddings } = await import('@/lib/ai/embeddings');
  const [embeddingsData, version] = await generateEmbeddings(
    textsToEmbed.map((content) => ({ content })),
    OPENAI_API_KEY
  );

  console.log(
    JSON.stringify({
      module: 'embed-stage',
      event: 'embeddings_generated',
      resourceId: input.resourceId,
      totalEmbeddings: embeddingsData.length,
      version,
    })
  );

  // Create a map of fragment index to content embedding
  const fragmentEmbeddingMap = new Map<number, number[]>();
  embeddingMap.forEach((mapping, embeddingIndex) => {
    if (!mapping.isQuestion) {
      fragmentEmbeddingMap.set(mapping.fragmentIndex, embeddingsData[embeddingIndex].embedding);
    }
  });

  // Create fragment records with proper typing
  const fragmentRecords: FragmentRecord[] = allFragmentsForEmbedding.map((item, index) => {
    const embeddingVector = fragmentEmbeddingMap.get(index) || [];

    return {
      id: nanoid(),
      gameId: input.gameId,
      resourceId: input.resourceId,
      type: item.type as 'text' | 'image' | 'table',
      attachmentId: item.attachmentId ?? null,
      content: item.content,
      embedding: embeddingVector, // Drizzle handles pgvector conversion from number[]
      searchableContent: item.searchableContent ?? null,
      syntheticQuestions: item.syntheticQuestions.length > 0 ? item.syntheticQuestions : null,
      answerTypes: item.answerTypes.length > 0 ? item.answerTypes : null,
      resourceName: resourceInfo.name ?? null,
      resourceDescription: resourceInfo.description ?? null,
      resourceType: resourceInfo.resourceType ?? null,
      version: CURRENT_EMBEDDING_VERSION,
      pageNumber: item.pageNumber ?? null,
      pageRange: item.pageRange ?? null,
      section: item.section ?? null,
      images: item.images && item.images.length > 0 ? item.images : null,
    };
  });


  // Insert fragments in batches
  const FRAGMENT_BATCH_SIZE = 10;
  await recordWorkflowStage(input.runId, 'embed', {
    status: `Storing fragments`,
    completed: 0,
    total: fragmentRecords.length,
  });

  for (let i = 0; i < fragmentRecords.length; i += FRAGMENT_BATCH_SIZE) {
    const batch = fragmentRecords.slice(i, i + FRAGMENT_BATCH_SIZE);
    if (batch.length > 0) {
      await db.insert(fragments).values(batch);
    }

    const completed = Math.min(i + FRAGMENT_BATCH_SIZE, fragmentRecords.length);
    await recordWorkflowStage(input.runId, 'embed', {
      status: `Storing fragments`,
      completed,
      total: fragmentRecords.length,
    });
  }

  // Create embedding records with proper typing
  const embeddingRecords: NewEmbedding[] = embeddingMap.map((mapping, embeddingIndex) => {
    const fragment = fragmentRecords[mapping.fragmentIndex];
    const sourceItem = allFragmentsForEmbedding[mapping.fragmentIndex];
    const embeddingData = embeddingsData[embeddingIndex];

    if (mapping.isQuestion) {
      return {
        id: `${fragment.id}-q${mapping.questionIndex}`,
        fragmentId: fragment.id,
        gameId: input.gameId,
        resourceId: input.resourceId,
        type: 'question' as const,
        embedding: embeddingData.embedding, // Drizzle handles pgvector conversion from number[]
        questionIndex: mapping.questionIndex!,
        questionText: mapping.questionText!,
        pageNumber: sourceItem.pageNumber ?? null,
        section: sourceItem.section ?? null,
        fragmentType: sourceItem.type as 'text' | 'image' | 'table',
        version: CURRENT_EMBEDDING_VERSION,
        createdAt: Date.now(),
      };
    } else {
      return {
        id: fragment.id,
        fragmentId: fragment.id,
        gameId: input.gameId,
        resourceId: input.resourceId,
        type: 'content' as const,
        embedding: embeddingData.embedding, // Drizzle handles pgvector conversion from number[]
        questionIndex: null,
        questionText: null,
        pageNumber: sourceItem.pageNumber ?? null,
        section: sourceItem.section ?? null,
        fragmentType: sourceItem.type as 'text' | 'image' | 'table',
        version: CURRENT_EMBEDDING_VERSION,
        createdAt: Date.now(),
      };
    }
  });

  // Insert embeddings in batches
  const EMBEDDING_BATCH_SIZE = 10;
  await recordWorkflowStage(input.runId, 'embed', {
    status: `Storing embeddings`,
    completed: 0,
    total: embeddingRecords.length,
  });

  for (let i = 0; i < embeddingRecords.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = embeddingRecords.slice(i, i + EMBEDDING_BATCH_SIZE);
    if (batch.length > 0) {
      await db.insert(embeddings).values(batch);
    }

    const completed = Math.min(i + EMBEDDING_BATCH_SIZE, embeddingRecords.length);
    await recordWorkflowStage(input.runId, 'embed', {
      status: `Storing embeddings`,
      completed,
      total: embeddingRecords.length,
    });
  }

  // Calculate resource stats
  const { calculateResourceStats } = await import('@/lib/services/chunking');
  const stats = calculateResourceStats(finalContent, structured);

  // Update resource with final content and stats
  await db
    .update(resources)
    .set({
      content: finalContent,
      version: CURRENT_EMBEDDING_VERSION,
      pdfExtractor: 'mistral',
      processedAt: Date.now(), // bigint timestamp
      pageCount: stats.pageCount,
      imageCount: stats.imageCount,
      wordCount: stats.wordCount,
      updatedAt: Date.now(), // bigint timestamp
    })
    .where(eq(resources.id, input.resourceId));

  console.log(
    JSON.stringify({
      module: 'embed-stage',
      event: 'embed_stage_complete',
      resourceId: input.resourceId,
      fragmentCount: fragmentRecords.length,
      embeddingCount: embeddingRecords.length,
    })
  );
}

// Helper functions

function namespaceImageId(resourceId: string, image: PDFImage): string {
  const baseId = image.id.replace(/\.[^./]+$/, '');
  if (!baseId.startsWith(resourceId)) {
    return `${resourceId}-${baseId}`;
  }
  return baseId;
}

function resolveMimeType(
  image: PDFImage,
  uploaded: UploadedImage | undefined,
  existing: Attachment | undefined
): string | null {
  if (uploaded?.mimeType) {
    return uploaded.mimeType;
  }
  if (typeof image.mimeType === 'string' && image.mimeType.length > 0) {
    return image.mimeType;
  }
  if (existing?.mimeType) {
    return existing.mimeType;
  }
  return null;
}

function normalizeBbox(
  bbox?: number[] | [number, number, number, number] | null
): [number, number, number, number] | null {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return null;
  }
  return [bbox[0], bbox[1], bbox[2], bbox[3]];
}

function buildFragmentImageMetadata(image: {
  id: string;
  url: string;
  bbox?: number[] | null;
  caption?: string | null;
  description?: string | null;
}): ImageMetadata {
  const metadata: ImageMetadata = {
    id: image.id,
    url: image.url,
  };

  const normalizedBbox = normalizeBbox(image.bbox);
  if (normalizedBbox) {
    metadata.bbox = normalizedBbox;
  }
  if (image.caption) {
    metadata.caption = image.caption;
  }
  if (image.description) {
    metadata.description = image.description;
  }

  return metadata;
}

async function deleteExistingFragments(resourceId: string) {
  const existing = await db
    .select({ id: fragments.id })
    .from(fragments)
    .where(eq(fragments.resourceId, resourceId));

  if (existing.length > 0) {
    const fragmentIds = existing.map((f) => f.id);

    // Delete embeddings first (foreign key constraint)
    await db.delete(embeddings).where(inArray(embeddings.fragmentId, fragmentIds));

    // Then delete fragments
    await db.delete(fragments).where(eq(fragments.resourceId, resourceId));
  }
}

async function saveStructured(resourceId: string, structured: StructuredPDFContent): Promise<void> {
  const { uploadBlob } = await import('@/lib/services/blob-storage');
  const key = `resources/${resourceId}/structured.json`;
  const buffer = Buffer.from(JSON.stringify(structured));
  await uploadBlob(key, buffer, 'application/json');
}

async function loadExistingAttachments(resourceId: string): Promise<Attachment[]> {
  return db.select().from(attachments).where(eq(attachments.resourceId, resourceId));
}

async function upsertAttachments(records: EmbedAttachmentRecord[]) {
  for (const record of records) {
    await db
      .insert(attachments)
      .values(record)
      .onConflictDoUpdate({
        target: attachments.id,
        set: {
          gameId: record.gameId,
          resourceId: record.resourceId,
          type: record.type,
          mimeType: record.mimeType,
          blobKey: record.blobKey,
          url: record.url,
          originalFilename: record.originalFilename,
          pageNumber: record.pageNumber,
          bbox: record.bbox,
          caption: record.caption,
          width: record.width,
          height: record.height,
          description: record.description,
          isGoodQuality: record.isGoodQuality,
          isRelevant: record.isRelevant,
          detectedType: record.detectedType,
          ocrText: record.ocrText,
        },
      });
  }
}

async function deleteOrphanAttachments(resourceId: string, keepIds: Set<string>) {
  const existing = await db
    .select({ id: attachments.id, blobKey: attachments.blobKey })
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId));

  if (!existing.length) {
    return;
  }

  const orphans =
    keepIds.size === 0
      ? existing
      : existing.filter((attachment) => !keepIds.has(attachment.id));

  if (!orphans.length) {
    return;
  }

  const orphanIds = orphans.map((attachment) => attachment.id);
  await db.delete(attachments).where(inArray(attachments.id, orphanIds));

  const keys = orphans
    .map((attachment) => normalizeBlobKey(attachment.blobKey))
    .filter((key): key is string => !!key);

  if (keys.length > 0) {
    await bulkDelete(keys);
  }
}

function normalizeBlobKey(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const extracted = extractBlobKeyFromUrl(value);
  if (extracted) {
    return extracted;
  }

  return value.replace(/^\/+/, '');
}
