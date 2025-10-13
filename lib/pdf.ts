import { env } from "./env.mjs";
import type {
  PDFExtractionResult,
  StructuredPDFContent,
  PDFPage,
  PDFImage,
  PDFSection,
} from "./types/pdf";
import { cleanupMarkdownBatch } from "./services/markdown-cleanup";

/**
 * Replace inline image markdown with custom syntax for database lookup
 * Converts: ![alt](img-0.jpeg) or ![alt](data:image/...)
 * To: ![alt](attachment://{attachmentId})
 */
export function replaceImageReferences(
  markdown: string,
  images: PDFImage[]
): string {
  // Find all markdown images: ![alt](url)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  let result = markdown;

  // Build maps for looking up images by various keys
  // Use image index to ensure uniqueness even with duplicate filenames
  const imageByFilename = new Map<string, PDFImage[]>();
  const imageById = new Map<string, PDFImage>();

  images.forEach((img, index) => {
    // Always map by ID (unique)
    imageById.set(img.id, img);

    if (img.originalFilename) {
      // Map by filename (may have duplicates)
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

  // Track which images have been matched to avoid reusing
  const usedImages = new Set<string>();

  // Process each image reference in the markdown
  result = result.replace(imageRegex, (fullMatch, alt, url) => {
    // Skip attachments that are already processed (attachment:// URLs) or external URLs
    if (url.startsWith('attachment://') || url.startsWith('http://') || url.startsWith('https://')) {
      return fullMatch;
    }

    // Try to find matching image by URL/filename
    let matchedImage: PDFImage | undefined;

    // First try by ID (if the URL is actually an ID)
    matchedImage = imageById.get(url);

    // If no match, try by filename
    if (!matchedImage) {
      const filename = url.split('/').pop() || url;
      const candidates = imageByFilename.get(filename);
      if (candidates && candidates.length > 0) {
        // Find first unused image
        matchedImage = candidates.find((img) => !usedImages.has(img.id));
      }
    }

    if (matchedImage) {
      // Mark this image as used to avoid duplicate matches
      usedImages.add(matchedImage.id);
      // Replace with custom syntax using the attachment's ID (will be database ID after storage)
      return `![${alt || ''}](attachment://${matchedImage.id})`;
    }

    // If no match found, log warning and keep original
    console.warn(`No matching attachment found for reference: ${url}`);
    return fullMatch;
  });

  return result;
}

/**
 * Parse markdown headings from text and build hierarchy
 */
export function parseMarkdownHeadings(
  markdown: string,
  pageNumber: number
): PDFSection[] {
  const lines = markdown.split("\n");
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
      const hierarchy = headingStack.map((h) => h.text).join(" > ");

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
 * Extract text and structured metadata from a PDF using Mistral OCR
 */
export const extractTextFromPdf = async (
  buf: Buffer
): Promise<PDFExtractionResult> => {
  if (!env.MISTRAL_API_KEY) {
    throw new Error(
      "MISTRAL_API_KEY environment variable is required for PDF extraction with Mistral OCR"
    );
  }

  const { Mistral } = await import("@mistralai/mistralai");

  const client = new Mistral({
    apiKey: env.MISTRAL_API_KEY,
  });

  const base64 = buf.toString("base64");

  const result = await client.ocr.process({
    model: "mistral-ocr-latest",
    document: {
      type: "document_url",
      documentUrl: `data:application/pdf;base64,${base64}`,
    },
    includeImageBase64: true, // Extract images for storage
  });

  // Step 1: Prepare all pages with raw markdown for cleanup
  const rawPages = result.pages.map((page) => ({
    markdown: page.markdown,
    pageNumber: page.index + 1,
    images: page.images,
    dimensions: page.dimensions,
  }));

  // Step 2: Batch cleanup all markdown to remove tables of contents, headers, etc.
  const cleanedMarkdownArray = await cleanupMarkdownBatch(
    rawPages.map((p) => ({ markdown: p.markdown, pageNumber: p.pageNumber }))
  );

  // Step 3: Process each page with cleaned markdown
  const pages: PDFPage[] = rawPages.map((rawPage, index) => {
    const pageNumber = rawPage.pageNumber;
    const cleanedMarkdown = cleanedMarkdownArray[index];

    // Parse images from Mistral response
    const images: PDFImage[] = (rawPage.images || []).map(
      (img: any, imgIndex: number) => ({
        id: img.id || `temp_page${pageNumber}_img${imgIndex}`, // Temporary ID, will be replaced with DB ID
        originalFilename: img.id || `img-${imgIndex}.jpeg`, // Preserve Mistral's filename for matching
        bbox: img.bbox,
        base64: img.imageBase64,
        pageNumber,
      })
    );

    // Replace image references in cleaned markdown with custom syntax
    const processedMarkdown = replaceImageReferences(cleanedMarkdown, images);

    // Parse sections from processed markdown
    const sections = parseMarkdownHeadings(processedMarkdown, pageNumber);

    return {
      pageNumber,
      markdown: processedMarkdown,
      images,
      sections,
      metadata: rawPage.dimensions
        ? {
            width: rawPage.dimensions.width,
            height: rawPage.dimensions.height,
            dpi: rawPage.dimensions.dpi,
          }
        : undefined,
    };
  });

  const structured: StructuredPDFContent = {
    pages,
    pageCount: pages.length,
  };

  // Combine all pages' cleaned markdown into a single string (backward compatible)
  const markdown = pages
    .map((page) => `<!-- Page ${page.pageNumber} -->\n${page.markdown}`)
    .join("\n\n");

  return {
    text: markdown,
    structured,
  };
};
