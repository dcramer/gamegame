import { RecursiveCharacterTextSplitter } from './text-splitter';
import type {
  StructuredPDFContent,
  PDFChunk,
  PDFSection,
  PDFPage,
} from '../types/pdf';

const splitter = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
  chunkSize: 1000,
  chunkOverlap: 100,
});

/**
 * Find the current section hierarchy for a given page
 */
function getCurrentSection(
  page: PDFPage,
  sections: PDFSection[]
): string | undefined {
  // Find all sections on or before this page
  const relevantSections = sections.filter(
    (s) => s.pageNumber <= page.pageNumber
  );

  if (relevantSections.length === 0) {
    return undefined;
  }

  // Get the last section (most recent)
  return relevantSections[relevantSections.length - 1].hierarchy;
}

/**
 * Find images relevant to a chunk of content
 */
function getRelevantImages(
  page: PDFPage
): Array<{ id: string; url: string; bbox?: number[]; caption?: string }> {
  // Include all images from the page that have URLs
  return page.images
    .filter((img): img is typeof img & { url: string } => !!img.url)
    .map((img) => ({
      id: img.id,
      url: img.url,
      bbox: img.bbox,
      caption: img.caption,
    }));
}

/**
 * Chunk a single page with metadata preservation
 */
async function chunkPage(
  page: PDFPage,
  allSections: PDFSection[]
): Promise<PDFChunk[]> {
  const chunks: PDFChunk[] = [];
  const pageSections = page.sections;
  const images = getRelevantImages(page);

  async function addRange(
    start: number,
    end: number,
    section: string | undefined
  ): Promise<void> {
    const slice = page.markdown.slice(start, end);
    const trimmed = slice.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed.length < 1500) {
      chunks.push({
        content: trimmed,
        pageNumber: page.pageNumber,
        section,
        images,
      });
      return;
    }

    const subChunks = await splitter.createDocuments([trimmed]);
    for (const subChunk of subChunks) {
      chunks.push({
        content: subChunk.pageContent,
        pageNumber: page.pageNumber,
        section,
        images,
      });
    }
  }

  // If the page content is small enough, keep it as one chunk
  if (page.markdown.length < 1500 && pageSections.length <= 1) {
    const section = getCurrentSection(page, allSections);
    await addRange(0, page.markdown.length, section);

    return chunks;
  }

  // For larger pages or pages with multiple sections, split intelligently
  if (pageSections.length > 0) {
    const sectionTexts: Array<{
      text: string;
      section: string;
      start: number;
      end: number;
    }> = [];

    // Split content by sections
    for (let i = 0; i < pageSections.length; i++) {
      const section = pageSections[i];
      const nextSection = pageSections[i + 1];

      // Find the text between this section and the next
      const headingRegex = new RegExp(
        `^#{${section.level}}\\s+${section.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'm'
      );
      const match = page.markdown.match(headingRegex);

      if (match && match.index !== undefined) {
        const start = match.index;
        let end = page.markdown.length;

        if (nextSection) {
          const nextHeadingRegex = new RegExp(
            `^#{${nextSection.level}}\\s+${nextSection.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
            'm'
          );
          const nextMatch = page.markdown.match(nextHeadingRegex);
          if (nextMatch && nextMatch.index !== undefined) {
            end = nextMatch.index;
          }
        }

        sectionTexts.push({
          text: page.markdown.substring(start, end),
          section: section.hierarchy,
          start,
          end,
        });
      }
    }

    // Chunk each section
    for (const sectionText of sectionTexts) {
      await addRange(sectionText.start, sectionText.end, sectionText.section);
    }

    // Capture any gaps not covered by section headings (preamble or trailing text)
    const sortedSections = sectionTexts
      .map((sectionText) => ({
        start: sectionText.start,
        end: sectionText.end,
        section: sectionText.section,
      }))
      .sort((a, b) => a.start - b.start);

    const defaultSection = getCurrentSection(page, allSections);
    let cursor = 0;
    let lastSection = defaultSection;

    for (const range of sortedSections) {
      if (range.start > cursor) {
        await addRange(cursor, range.start, lastSection);
      }
      cursor = Math.max(cursor, range.end);
      lastSection = range.section;
    }

    if (cursor < page.markdown.length) {
      await addRange(cursor, page.markdown.length, lastSection);
    }
  } else {
    // No sections, just split the whole page
    const section = getCurrentSection(page, allSections);
    await addRange(0, page.markdown.length, section);
  }

  return chunks;
}

/**
 * Chunk structured PDF content while preserving metadata
 */
export async function chunkStructuredPDF(
  structured: StructuredPDFContent
): Promise<PDFChunk[]> {
  const allChunks: PDFChunk[] = [];

  // Collect all sections across all pages for hierarchy tracking
  const allSections: PDFSection[] = structured.pages.flatMap(
    (page) => page.sections
  );

  // Process each page
  for (const page of structured.pages) {
    const pageChunks = await chunkPage(page, allSections);
    allChunks.push(...pageChunks);
  }

  return allChunks;
}

/**
 * Calculate resource statistics from content
 */
export function calculateResourceStats(
  content: string,
  structured?: StructuredPDFContent
): {
  pageCount: number | null;
  imageCount: number;
  wordCount: number;
} {
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  if (structured) {
    const imageCount = structured.pages.reduce(
      (acc, page) => acc + page.images.length,
      0
    );

    return {
      pageCount: structured.pageCount,
      imageCount,
      wordCount,
    };
  }

  return {
    pageCount: null,
    imageCount: 0,
    wordCount,
  };
}
