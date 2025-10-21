import type { Env, VectorMetadata } from '@/types';
import { getDb, resources, fragments, attachments } from '../db';
import { eq } from 'drizzle-orm';
import { extractTextFromPdf, replaceImageReferences, rebuildMarkdownFromPages } from '../pdf';
import { chunkStructuredPDF, calculateResourceStats } from '../services/chunking';
import { uploadPDFImages } from '../services/r2-storage';
import { generateEmbeddings } from '../ai/embeddings';
import { insertEmbeddings } from '../ai/vectorize';
import type { PDFImage } from '../types/pdf';

export interface ProcessingProgress {
  step: string;
  progress: number;
}

/**
 * Complete PDF processing pipeline
 * Called by queue consumer
 */
export async function processResourcePDF(options: {
  resourceId: string;
  gameId: string;
  name: string;
  url: string;
  env: Env;
  onProgress?: (step: string, progress: number) => Promise<void>;
  gameName?: string; // Optional: for vision analysis context
  sourceKey?: string; // Optional: R2 object key for direct access
}): Promise<void> {
  const { resourceId, gameId, url, env, onProgress, gameName, sourceKey } = options;
  const db = getDb(env.DB);
  const { OPENAI_API_KEY, MISTRAL_API_KEY } = env;
  let lastStep = 'initializing';

  const progress = async (step: string, pct: number) => {
    lastStep = step;
    console.log(`[${resourceId}] ${step} (${pct}%)`);
    if (onProgress) await onProgress(step, pct);
  };

  try {
    if (!MISTRAL_API_KEY) {
      throw new Error('Missing MISTRAL_API_KEY secret');
    }

    if (!OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY secret');
    }

    // Step 1: Fetch PDF
    await progress('Fetching PDF', 10);

    let buffer: Buffer | null = null;

    if (sourceKey) {
      const object = await env.FILES.get(sourceKey);
      if (object) {
        console.log(`[${resourceId}] Loaded source PDF from R2 key=${sourceKey}`);
        const arrayBuffer = await object.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      } else {
        console.warn(`[${resourceId}] Source PDF not found in R2 (key: ${sourceKey}), falling back to URL fetch (${url})`);
      }
    }

    if (!buffer) {
      console.log(`[${resourceId}] Fetching PDF from URL ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF (status ${response.status} ${response.statusText})`);
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    // Step 2: Extract with Mistral OCR
    await progress('Extracting text with OCR', 25);
    const extraction = await extractTextFromPdf(buffer, MISTRAL_API_KEY);

    if (!extraction.structured) {
      throw new Error('PDF extraction did not return structured content');
    }

    // Step 2.5: Enrich images with vision analysis
    await progress('Analyzing images with vision AI', 30);
    console.log('[Vision] Starting image analysis', { resourceId });

    const { enrichPDFImagesWithVision } = await import('../services/vision');
    await enrichPDFImagesWithVision(extraction.structured, OPENAI_API_KEY, gameName, {
      maxConcurrency: 5,
    });

    console.log('[Vision] Image analysis completed', { resourceId });

    // Step 2.6: Clean up markdown with LLM
    await progress('Cleaning up markdown', 35);
    console.log('[Cleanup] Starting markdown cleanup', { resourceId, pageCount: extraction.structured.pages.length });

    const { cleanupMarkdownBatch } = await import('../services/markdown-cleanup');
    const cleanedPages = await cleanupMarkdownBatch(
      extraction.structured.pages.map((page) => ({
        markdown: page.markdown,
        pageNumber: page.pageNumber,
      })),
      OPENAI_API_KEY
    );

    // Update pages with cleaned markdown
    extraction.structured.pages.forEach((page, i) => {
      page.markdown = cleanedPages[i];
    });

    console.log('[Cleanup] Markdown cleanup completed', { resourceId });

    // Step 3: Upload images to R2
    await progress('Uploading images', 45);

    // Collect all images from all pages
    const allImages = extraction.structured.pages.flatMap((page) => page.images);

    // Map description to caption (vision analysis sets description, but we store as caption)
    allImages.forEach(img => {
      if (img.description && !img.caption) {
        img.caption = img.description;
      }
    });

    // Only upload images that have base64 data
    const imagesToUpload = allImages.filter((img) => img.base64);

    const uploadedImages = await uploadPDFImages(
      env.FILES,
      resourceId,
      imagesToUpload as Array<PDFImage & { base64: string }>
    );

    // Create a map of image ID to uploaded image data
    const imageMap = new Map(uploadedImages.map((img) => [img.id, img]));

    // Update images in pages with URLs
    for (const page of extraction.structured.pages) {
      for (const img of page.images) {
        const uploaded = imageMap.get(img.id);
        if (uploaded) {
          img.url = uploaded.url;
          img.caption = img.caption || uploaded.caption;
        }
      }
    }

    // Step 4: Insert attachments into database
    await progress('Storing attachments', 55);

    if (uploadedImages.length > 0) {
      const attachmentRecords = uploadedImages.map((img) => ({
        id: img.id,
        gameId,
        resourceId,
        type: 'image' as const,
        mimeType: img.mimeType,
        url: img.url,
        originalFilename: img.originalFilename,
        pageNumber: img.pageNumber,
        bbox: img.bbox ? JSON.stringify(img.bbox) : null,
        caption: img.caption || null,
        width: img.width || null,
        height: img.height || null,
        createdAt: new Date(),
      }));

      await db.insert(attachments).values(attachmentRecords);
    }

    // Step 5: Replace image references in markdown
    await progress('Processing content', 60);

    const allImagesWithUrls = extraction.structured.pages.flatMap((page) =>
      page.images.filter((img) => img.url)
    );

    // Rebuild markdown from pages (may have been modified by vision/cleanup)
    const rebuiltMarkdown = rebuildMarkdownFromPages(extraction.structured);

    let finalContent = replaceImageReferences(
      rebuiltMarkdown,
      allImagesWithUrls as Array<PDFImage & { url: string }>
    );

    // Step 6: Chunk content
    await progress('Chunking content', 70);
    const pdfChunks = await chunkStructuredPDF(extraction.structured);

    // Step 7: Generate embeddings
    await progress('Generating embeddings', 80);
    const [embeddingsData, version] = await generateEmbeddings(pdfChunks);

    // Step 8: Insert into D1 and Vectorize
    await progress('Storing fragments', 90);

    // Insert fragments into D1
    const fragmentRecords = embeddingsData.map((e) => ({
      id: crypto.randomUUID(),
      gameId,
      resourceId,
      content: e.content,
      version,
      pageNumber: e.pageNumber ?? null,
      pageRangeStart: e.pageRange?.[0] ?? null,
      pageRangeEnd: e.pageRange?.[1] ?? null,
      section: e.section ?? null,
      images: e.images ? JSON.stringify(e.images) : null,
    }));

    await db.insert(fragments).values(fragmentRecords);

    // Insert embeddings into Vectorize
    const vectorRecords = embeddingsData.map((e, i) => {
      const metadata: VectorMetadata = {
        fragmentId: fragmentRecords[i].id,
        gameId,
        resourceId,
      };
      // Only add optional fields if they have values (Vectorize doesn't accept undefined/null)
      if (e.pageNumber !== undefined) metadata.pageNumber = e.pageNumber;
      if (e.section) metadata.section = e.section;

      return {
        id: fragmentRecords[i].id,
        values: e.embedding,
        metadata,
      };
    });

    await insertEmbeddings(env.VECTORIZE, vectorRecords);

    // Step 9: Update resource with final content and stats
    await progress('Finalizing', 95);

    const stats = calculateResourceStats(finalContent, extraction.structured);

    await db
      .update(resources)
      .set({
        content: finalContent,
        version,
        pdfExtractor: 'mistral',
        processedAt: new Date(),
        updatedAt: new Date(),
        ...stats,
      })
      .where(eq(resources.id, resourceId));

    await progress('Complete', 100);

    console.log(`[${resourceId}] Processing complete: ${fragmentRecords.length} fragments, ${uploadedImages.length} images`);
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(
      `[${resourceId}] Processing failed during step "${lastStep}": ${message}`,
      error instanceof Error ? error.stack : error
    );
    throw new Error(`${message} (step: ${lastStep})`);
  }
}
