/**
 * Searchable Content Generation
 *
 * This module creates enriched content for embeddings by adding contextual metadata.
 * This improves semantic search by providing the LLM with additional context about
 * the document, location, and visual elements.
 */

import type { PDFChunk, PDFPage, PDFImage } from '../types/pdf';
import type { Resource, Attachment } from '../db/schema';

export interface SearchableContentOptions {
  includeDocumentContext?: boolean;
  includeLocationContext?: boolean;
  includeVisualContext?: boolean;
}

const DEFAULT_OPTIONS: SearchableContentOptions = {
  includeDocumentContext: true,
  includeLocationContext: true,
  includeVisualContext: true,
};

/**
 * Build enriched searchable content for text fragments
 *
 * Creates a multi-section format:
 * 1. Document context (title, type, description, edition)
 * 2. Location context (page, section hierarchy)
 * 3. Visual elements context (images on this page with descriptions)
 * 4. Main content (the actual text)
 *
 * This enriched content is used for embeddings, while the clean `content`
 * field is used for display.
 */
export function buildSearchableContent(
  fragment: PDFChunk,
  resource: Pick<
    Resource,
    'name' | 'originalFilename' | 'description' | 'resourceType' | 'edition'
  >,
  attachments: Pick<Attachment, 'id' | 'description' | 'detectedType'>[],
  options: SearchableContentOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const parts: string[] = [];

  // Document context
  if (opts.includeDocumentContext) {
    parts.push('--- DOCUMENT CONTEXT ---');
    parts.push(`Title: ${resource.name}`);

    if (resource.originalFilename) {
      parts.push(`Filename: ${resource.originalFilename}`);
    }

    if (resource.description) {
      parts.push(`Description: ${resource.description}`);
    }

    const resourceType = resource.resourceType || 'rulebook';
    parts.push(`Type: ${resourceType}`);

    if (resource.edition) {
      parts.push(`Edition: ${resource.edition}`);
    }

    parts.push('');
  }

  // Location context
  if (opts.includeLocationContext && (fragment.pageNumber || fragment.section)) {
    parts.push('--- LOCATION ---');

    if (fragment.pageNumber) {
      parts.push(`Page: ${fragment.pageNumber}`);
    }

    if (fragment.section) {
      parts.push(`Section: ${fragment.section}`);
    }

    parts.push('');
  }

  // Visual elements context (images on this page)
  if (opts.includeVisualContext && fragment.images && fragment.images.length > 0) {
    const relevantAttachments = attachments.filter((att) =>
      fragment.images!.some((img) => img.id === att.id)
    );

    if (relevantAttachments.length > 0) {
      parts.push('--- VISUAL ELEMENTS ---');

      relevantAttachments.forEach((attachment, idx) => {
        if (attachment.description) {
          parts.push(`Image ${idx + 1}: ${attachment.description}`);

          if (attachment.detectedType) {
            parts.push(`  Type: ${attachment.detectedType}`);
          }
        }
      });

      parts.push('');
    }
  }

  // Main content
  parts.push('--- CONTENT ---');
  parts.push(fragment.content);

  return parts.join('\n');
}

/**
 * Build enriched searchable content for image fragments
 *
 * Image fragments are created for each relevant image with an AI-generated
 * description. This allows images to be directly searchable.
 *
 * Creates a multi-section format:
 * 1. Document context
 * 2. Image context (type, page, section, caption)
 * 3. Description (AI-generated description of what the image shows)
 */
export function buildImageSearchableContent(
  image: PDFImage,
  attachment: Pick<
    Attachment,
    'description' | 'detectedType' | 'caption' | 'ocrText'
  >,
  page: Pick<PDFPage, 'pageNumber' | 'sections'>,
  resource: Pick<
    Resource,
    'name' | 'description' | 'resourceType' | 'edition'
  >,
  options: SearchableContentOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const parts: string[] = [];

  // Document context
  if (opts.includeDocumentContext) {
    parts.push('--- DOCUMENT CONTEXT ---');
    parts.push(`Document: ${resource.name}`);

    if (resource.description) {
      parts.push(`Description: ${resource.description}`);
    }

    if (resource.resourceType) {
      parts.push(`Type: ${resource.resourceType}`);
    }

    if (resource.edition) {
      parts.push(`Edition: ${resource.edition}`);
    }

    parts.push('');
  }

  // Image context
  if (opts.includeLocationContext) {
    parts.push('--- IMAGE CONTEXT ---');

    if (attachment.detectedType) {
      parts.push(`Type: ${attachment.detectedType}`);
    }

    parts.push(`Page: ${page.pageNumber}`);

    // Get the section for this page
    const section = page.sections && page.sections.length > 0
      ? page.sections[page.sections.length - 1].hierarchy
      : null;

    if (section) {
      parts.push(`Section: ${section}`);
    }

    if (attachment.caption || image.caption) {
      parts.push(`Caption: ${attachment.caption || image.caption}`);
    }

    parts.push('');
  }

  // Description (main searchable content for images)
  parts.push('--- DESCRIPTION ---');
  parts.push(attachment.description || image.description || '');

  // OCR text (for tables and diagrams with text)
  if (attachment.ocrText) {
    parts.push('');
    parts.push('--- EXTRACTED TEXT ---');
    parts.push(attachment.ocrText);
  }

  return parts.join('\n');
}

/**
 * Estimate the token count for searchable content
 * (Rough estimate: ~4 characters per token)
 */
export function estimateTokenCount(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Validate that searchable content isn't too large
 * (OpenAI embedding models have a limit of 8191 tokens)
 */
export function validateSearchableContentSize(
  content: string,
  maxTokens: number = 8000
): { valid: boolean; tokenCount: number; error?: string } {
  const tokenCount = estimateTokenCount(content);

  if (tokenCount > maxTokens) {
    return {
      valid: false,
      tokenCount,
      error: `Searchable content exceeds token limit: ${tokenCount} > ${maxTokens}`,
    };
  }

  return { valid: true, tokenCount };
}
