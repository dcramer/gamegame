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
import type { NewAttachment } from '@/lib/db/schema/attachments';
import { eq, inArray } from 'drizzle-orm';
import type { StructuredPDFContent, PDFImage } from '@/lib/types/pdf';
import { nanoid } from 'nanoid';
import type { ProcessResourceInput } from './process-resource';
import type { UploadedImage } from '@/lib/services/blob-storage';

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

  // Upload images to blob storage
  const allImages = structured.pages.flatMap((page) => page.images);
  const imagesToUpload = allImages
    .filter((img) => img.base64)
    .map((img) => ({
      id: namespaceImageId(input.resourceId, img),
      base64: img.base64!,
      originalFilename: img.originalFilename,
      pageNumber: img.pageNumber,
      bbox: img.bbox,
      caption: img.caption,
    }));

  const uploadedImageMap = new Map<string, UploadedImage>();

  if (imagesToUpload.length > 0) {
    const { uploadPDFImages } = await import('@/lib/services/blob-storage');
    const uploadedImages = await uploadPDFImages(input.resourceId, imagesToUpload);

    uploadedImages.forEach((img) => {
      uploadedImageMap.set(img.id, img);
    });

    // Update structured data with uploaded image URLs
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

    // Save updated structured data
    await saveStructured(input.resourceId, structured);
  }

  // Delete existing attachments and fragments for idempotent reprocessing
  await deleteExistingAttachments(input.resourceId);
  await deleteExistingFragments(input.resourceId);

  // Create attachment records with proper typing
  const attachmentRecords: EmbedAttachmentRecord[] = structured.pages.flatMap((page) =>
    page.images
      .filter((img) => img.url)
      .map((img) => {
        const uploaded = uploadedImageMap.get(img.id);
        return {
          id: img.id,
          gameId: input.gameId,
          resourceId: input.resourceId,
          type: 'image' as const,
          mimeType: resolveMimeType(img, uploaded) ?? 'image/png',
          blobKey: uploaded?.blobKey ?? img.url!,
          url: img.url!,
          originalFilename: img.originalFilename ?? null,
          pageNumber: img.pageNumber ?? null,
          bbox: normalizeBbox(img.bbox),
          caption: img.caption ?? null,
          width: uploaded?.width ?? null,
          height: uploaded?.height ?? null,
          description: img.description ?? null,
          isGoodQuality: img.isGoodQuality ?? null, // varchar type, not integer
          createdAt: Date.now(),
        };
      })
  );

  // Insert attachments in batches
  const ATTACHMENT_BATCH_SIZE = 10;
  for (let i = 0; i < attachmentRecords.length; i += ATTACHMENT_BATCH_SIZE) {
    const batch = attachmentRecords.slice(i, i + ATTACHMENT_BATCH_SIZE);
    if (batch.length > 0) {
      await db.insert(attachments).values(batch);
    }
  }

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

  // Progress tracking removed - workflows are tracked via resources.processingStage

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
  for (let i = 0; i < fragmentRecords.length; i += FRAGMENT_BATCH_SIZE) {
    const batch = fragmentRecords.slice(i, i + FRAGMENT_BATCH_SIZE);
    if (batch.length > 0) {
      await db.insert(fragments).values(batch);
    }
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
  for (let i = 0; i < embeddingRecords.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = embeddingRecords.slice(i, i + EMBEDDING_BATCH_SIZE);
    if (batch.length > 0) {
      await db.insert(embeddings).values(batch);
    }
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

function resolveMimeType(image: PDFImage, uploaded: any): string | null {
  if (uploaded?.mimeType) {
    return uploaded.mimeType;
  }
  if (typeof image.mimeType === 'string' && image.mimeType.length > 0) {
    return image.mimeType;
  }
  return null;
}

function normalizeBbox(bbox?: number[] | null): [number, number, number, number] | null {
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

async function deleteExistingAttachments(resourceId: string) {
  const existing = await db
    .select({ id: attachments.id, blobKey: attachments.blobKey })
    .from(attachments)
    .where(eq(attachments.resourceId, resourceId));

  if (existing.length > 0) {
    await db.delete(attachments).where(eq(attachments.resourceId, resourceId));

    // Delete from blob storage
    const keys = existing.map((a) => a.blobKey).filter((k): k is string => !!k);
    if (keys.length > 0) {
      const { bulkDelete } = await import('@/lib/services/blob-storage');
      await bulkDelete(keys);
    }
  }
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
