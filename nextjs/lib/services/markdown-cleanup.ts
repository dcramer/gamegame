import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { getModelForTask } from '@/lib/config/models';

/**
 * Preprocess LaTeX formatting that commonly appears in OCR output
 * Convert LaTeX symbols to their Unicode equivalents
 */
function preprocessLatex(markdown: string): string {
  let cleaned = markdown;

  // LaTeX superscript trademark: ${ }^{\text {m }}$ → ™
  cleaned = cleaned.replace(/\$\{\s*\}\s*\^\{\\text\s*\{\s*m\s*\}\s*\}\$/g, '™');

  // LaTeX superscript registered: ${ }^{\text {r }}$ → ®
  cleaned = cleaned.replace(/\$\{\s*\}\s*\^\{\\text\s*\{\s*r\s*\}\s*\}\$/g, '®');

  // LaTeX superscript copyright: ${ }^{\text {c }}$ → ©
  cleaned = cleaned.replace(/\$\{\s*\}\s*\^\{\\text\s*\{\s*c\s*\}\s*\}\$/g, '©');

  // Generic LaTeX superscript TM: $^{TM}$ or ^{TM} → ™
  cleaned = cleaned.replace(/\$?\^\{TM\}\$?/g, '™');

  // Generic LaTeX superscript R: $^{®}$ or ^{®} → ®
  cleaned = cleaned.replace(/\$?\^\{®\}\$?/g, '®');

  // LaTeX math mode empty: ${ }$ → (remove)
  cleaned = cleaned.replace(/\$\{\s*\}\$/g, '');

  // Multiple spaces to single space
  cleaned = cleaned.replace(/  +/g, ' ');

  return cleaned;
}

/**
 * Clean up markdown content using an LLM to remove unusable sections
 * while preserving the overall structure and useful content.
 *
 * This removes:
 * - Tables of contents
 * - Page headers/footers
 * - Copyright notices
 * - Promotional content
 * - Other boilerplate that isn't useful for RAG search
 *
 * But preserves:
 * - All headings and section structure
 * - Rule text and gameplay instructions
 * - Examples and clarifications
 * - Tables and diagrams (markdown syntax)
 * - Image references (must be preserved exactly!)
 */
export async function cleanupMarkdown(
  markdown: string,
  pageNumber: number,
  openaiApiKey: string
): Promise<string> {
  if (!markdown.trim()) {
    return markdown;
  }

  // First preprocess LaTeX formatting
  markdown = preprocessLatex(markdown);

  try {
    const openai = createOpenAI({ apiKey: openaiApiKey });
    const model = getModelForTask('cleanup');

    const response = await generateText({
      model: openai(model),
      system: `You are cleaning markdown that was OCR'd from a board-game rulebook. Your job is to delete obvious filler while leaving every piece of gameplay instruction untouched.

Guard rails (obey all of them):
1. If you're unsure whether something is rules content or filler, KEEP IT.
2. KEEP every heading, subheading, list item, numbered step, example, note, callout, and table. Do not rewrite or reorder them.
3. KEEP every dice icon, symbol, cost, stat block, card text, setup diagram reference, and timing window.
4. KEEP markdown images exactly as written – never rename or remove ![alt](url).
5. REMOVE only obvious navigation scaffolding such as pure tables of contents, printer marks, blank pages, repeated page headers/footers, legal boilerplate, and marketing blurbs.
6. REMOVE standalone page numbers or running headers/footers only when they are not embedded in rule text.
7. Do not paraphrase, summarise, or reformat; output must remain valid markdown representing the same rule content.

What to REMOVE (be aggressive with these):
- Table of contents pages (lists of sections with page numbers like "Setup ... 5", "Gameplay ... 12", etc.)
- Lists of headings with dots/leaders and page numbers (e.g., "Rules Overview.....3")
- Pure navigation sections that just list where to find information
- Copyright/credits pages with no gameplay content
- Publisher information and marketing text
- Page numbers that appear alone or as running headers/footers

Output requirements:
- Return ONLY the cleaned markdown (no explanations, no code fences).
- Preserve blank lines between sections to keep structure readable.
- Never introduce new headings or sections.
- If the entire page was just non-content (e.g. a cover or empty TOC), return an empty string.`,
      prompt: `Clean up this markdown from page ${pageNumber} of a board game rulebook:\n\n${markdown}`,
    });

    const cleaned = response.text.trim() || '';

    const isNonContentPage = isLikelyNonContentPage(markdown);
    const looksSubstantial = isSubstantialContent(cleaned);
    const reductionPercent = markdown.length > 0 ? Math.round((1 - cleaned.length / markdown.length) * 100) : 0;

    // Log cleanup results for debugging
    console.log(
      JSON.stringify({
        module: 'markdown-cleanup',
        event: 'page_cleaned',
        pageNumber,
        originalLength: markdown.length,
        cleanedLength: cleaned.length,
        reductionPercent,
        isNonContentPage,
        looksSubstantial,
        wasEmptied: cleaned.length === 0,
      })
    );

    // Safety check: if the LLM removed too much content (>80% reduction),
    // return original to avoid data loss unless the cleaned output still looks substantial
    if (!isNonContentPage && !looksSubstantial && cleaned.length > 0 && cleaned.length < markdown.length * 0.2) {
      console.log(
        JSON.stringify({
          module: 'markdown-cleanup',
          event: 'excessive_reduction_reverted',
          pageNumber,
          reason: 'Cleaned content too small and not substantial',
        })
      );
      return markdown;
    }

    return cleaned;
  } catch (error) {
    console.log(
      JSON.stringify({
        module: 'markdown-cleanup',
        event: 'cleanup_error',
        pageNumber,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    // On error, return original markdown rather than failing the entire extraction
    return markdown;
  }
}

function isLikelyNonContentPage(markdown: string): boolean {
  const lower = markdown.toLowerCase();
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return true;
  }

  const tocKeywords = ['table of contents', 'contents', 'index'];
  const hasTocKeyword = tocKeywords.some((keyword) => lower.includes(keyword));

  const tocLikeLines = lines.filter((line) => {
    // Lines that end with page numbers or have dotted leaders
    const hasPageNumber = /\b\d{1,3}\s*$/.test(line);
    const dottedLeader = /\.{2,}\s*\d+$/.test(line);
    const cleanedLine = line.replace(/^[-*•\d.\s]+/, '').trim();
    const shortEnough = cleanedLine.length <= 80;
    return shortEnough && (hasPageNumber || dottedLeader);
  });

  const tocRatio = tocLikeLines.length / Math.max(lines.length, 1);
  const isTableOfContents = (hasTocKeyword && tocRatio >= 0.3) || tocRatio >= 0.6;

  const coverKeywords = ['copyright', 'all rights reserved', 'credits', 'published by'];
  const coverIndicators = coverKeywords.filter((keyword) => lower.includes(keyword)).length;
  const isCoverPage = coverIndicators > 0 && lines.length <= 60;

  return isTableOfContents || isCoverPage;
}

function isSubstantialContent(markdown: string): boolean {
  if (markdown.length >= 1000) {
    return true;
  }

  const lines = markdown.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return false;
  }

  const headingCount = lines.filter((line) => /^#+\s+/.test(line)).length;
  if (headingCount >= 2) {
    return true;
  }

  const bulletCount = lines.filter((line) => /^[-*•]\s+/.test(line)).length;
  if (bulletCount >= 4) {
    return true;
  }

  const tableLineCount = lines.filter((line) => line.includes('|')).length;
  if (tableLineCount >= 4) {
    return true;
  }

  const sentenceMatches = markdown.match(/[.!?]\s+[A-Z]/g);
  if (sentenceMatches && sentenceMatches.length >= 3) {
    return true;
  }

  return false;
}

/**
 * Batch cleanup multiple pages of markdown in parallel
 * @param pages Array of markdown strings with their page numbers
 * @param openaiApiKey OpenAI API key
 * @param options Optional configuration including progress callback
 * @returns Array of cleaned markdown strings in the same order
 */
export async function cleanupMarkdownBatch(
  pages: Array<{ markdown: string; pageNumber: number }>,
  openaiApiKey: string,
  options?: {
    onProgress?: (processed: number, total: number) => Promise<void>;
  }
): Promise<string[]> {
  if (pages.length === 0) {
    return [];
  }

  const { onProgress } = options ?? {};
  const MAX_CONCURRENCY = 5;
  const results: string[] = new Array(pages.length);
  let cursor = 0;
  let completed = 0;

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= pages.length) {
        break;
      }

      const page = pages[index];
      results[index] = await cleanupMarkdown(page.markdown, page.pageNumber, openaiApiKey);

      // Report progress after each page is completed
      completed++;
      if (onProgress) {
        await onProgress(completed, pages.length);
      }
    }
  };

  const workerCount = Math.min(MAX_CONCURRENCY, pages.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}
