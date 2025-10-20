import type {
  PDFExtractionResult,
  StructuredPDFContent,
  PDFPage,
  PDFImage,
  PDFSection,
} from './types/pdf';

/**
 * Parse markdown headings from text and build hierarchy
 */
export function parseMarkdownHeadings(
  markdown: string,
  pageNumber: number
): PDFSection[] {
  const lines = markdown.split('\n');
  const sections: PDFSection[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();

      // Pop headings that are same level or deeper
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= level
      ) {
        headingStack.pop();
      }

      // Add new heading to stack
      headingStack.push({ level, text });

      // Build hierarchy string
      const hierarchy = headingStack.map((h) => h.text).join(' > ');

      sections.push({
        level,
        text,
        hierarchy,
        pageNumber,
      });
    }
  }

  return sections;
}

/**
 * Rebuild combined markdown text from structured pages
 */
export function rebuildMarkdownFromPages(structured: StructuredPDFContent): string {
  return structured.pages
    .map((page) => `<!-- Page ${page.pageNumber} -->\n${page.markdown}`)
    .join('\n\n');
}

/**
 * Remove bad quality images from markdown
 * Filters out images marked as bad quality from the markdown content
 */
export function removeBadQualityImages(markdown: string, images: PDFImage[]): string {
  // Build set of bad quality image IDs
  const badQualityIds = new Set(
    images.filter((img) => img.isGoodQuality === 'bad').map((img) => img.id)
  );

  if (badQualityIds.size === 0) {
    return markdown;
  }

  // Remove markdown image references for bad quality images
  // Matches: ![alt text](attachment://id)
  const imageRegex = /!\[([^\]]*)\]\(attachment:\/\/([^)]+)\)/g;

  return markdown.replace(imageRegex, (fullMatch, alt, attachmentId) => {
    // If this attachment is bad quality, remove the entire image reference
    if (badQualityIds.has(attachmentId)) {
      console.log('Removing bad quality image from markdown', { attachmentId, alt });
      return ''; // Remove the image reference entirely
    }
    return fullMatch; // Keep good quality images
  });
}

/**
 * Replace inline image markdown with custom syntax for database lookup
 * Converts: ![alt](img-0.jpeg) or ![alt](data:image/...)
 * To: ![alt](attachment://{attachmentId})
 */
export function replaceImageReferences(
  markdown: string,
  images: PDFImage[]
): string {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  // Build maps for looking up images
  const imageByFilename = new Map<string, PDFImage[]>();
  const imageById = new Map<string, PDFImage>();

  images.forEach((img) => {
    imageById.set(img.id, img);

    if (img.originalFilename) {
      if (!imageByFilename.has(img.originalFilename)) {
        imageByFilename.set(img.originalFilename, []);
      }
      imageByFilename.get(img.originalFilename)!.push(img);

      // Also map by filename without extension
      const nameWithoutExt = img.originalFilename.replace(/\.[^.]+$/, '');
      if (!imageByFilename.has(nameWithoutExt)) {
        imageByFilename.set(nameWithoutExt, []);
      }
      imageByFilename.get(nameWithoutExt)!.push(img);
    }
  });

  // Track which images have been matched
  const usedImages = new Set<string>();

  // Process each image reference
  let result = markdown.replace(imageRegex, (fullMatch, alt, url) => {
    // Skip already processed or external URLs
    if (
      url.startsWith('attachment://') ||
      url.startsWith('http://') ||
      url.startsWith('https://')
    ) {
      return fullMatch;
    }

    // Remove data URIs (images should be uploaded to R2, not embedded)
    if (url.startsWith('data:')) {
      console.warn('Removing embedded data URI from markdown - images should be uploaded to R2');
      return ''; // Remove the entire image reference
    }

    // Try to find matching image
    let matchedImage: PDFImage | undefined;

    // First try by ID
    matchedImage = imageById.get(url);

    // If no match, try by filename
    if (!matchedImage) {
      const filename = url.split('/').pop() || url;
      const candidates = imageByFilename.get(filename);
      if (candidates && candidates.length > 0) {
        matchedImage = candidates.find((img) => !usedImages.has(img.id));
      }
    }

    if (matchedImage) {
      usedImages.add(matchedImage.id);
      return `![${alt || ''}](attachment://${matchedImage.id})`;
    }

    // No match found, keep original
    console.warn('No matching attachment found for image reference:', url);
    return fullMatch;
  });

  return result;
}

/**
 * Extract text and structured metadata from a PDF using Mistral OCR
 */
export async function extractTextFromPdf(
  buf: Buffer,
  mistralApiKey: string
): Promise<PDFExtractionResult> {
  const { Mistral } = await import('@mistralai/mistralai');

  const client = new Mistral({
    apiKey: mistralApiKey,
  });

  const base64 = buf.toString('base64');

  // Call Mistral OCR
  const result = await client.ocr.process({
    model: 'mistral-ocr-latest',
    document: {
      type: 'document_url',
      documentUrl: `data:application/pdf;base64,${base64}`,
    },
    includeImageBase64: true,
  });

  // Process each page
  const pages: PDFPage[] = result.pages.map((page: any) => {
    const pageNumber = page.index + 1;
    const markdown = page.markdown || '';

    // Parse images from Mistral response
    const images: PDFImage[] = (page.images || []).map(
      (img: any, imgIndex: number) => ({
        id: img.id || `temp_page${pageNumber}_img${imgIndex}`,
        originalFilename: img.id || `img-${imgIndex}.jpeg`,
        bbox: img.bbox,
        base64: img.imageBase64,
        pageNumber,
      })
    );

    // Parse sections from markdown
    const sections = parseMarkdownHeadings(markdown, pageNumber);

    return {
      pageNumber,
      markdown,
      images,
      sections,
      metadata: page.dimensions
        ? {
            width: page.dimensions.width,
            height: page.dimensions.height,
            dpi: page.dimensions.dpi,
          }
        : undefined,
    };
  });

  const structured: StructuredPDFContent = {
    pages,
    pageCount: pages.length,
  };

  // Combine all pages' markdown
  const markdown = rebuildMarkdownFromPages(structured);

  return {
    text: markdown,
    structured,
  };
}
