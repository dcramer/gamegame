import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

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

  try {
    const openai = createOpenAI({ apiKey: openaiApiKey });

    const response = await generateText({
      model: openai('gpt-4o'), // Best model for accurate cleanup
      system: `You are a markdown cleanup assistant for board game rulebook extraction. Your job is to remove unusable content while preserving all useful rule information and the document structure.

CRITICAL RULES:
1. PRESERVE ALL IMAGE REFERENCES EXACTLY - Do not modify any markdown images like ![alt](url)
2. PRESERVE ALL HEADINGS - Keep the section structure intact
3. PRESERVE ALL RULE TEXT - Keep gameplay instructions, examples, and clarifications
4. REMOVE tables of contents (lists of sections with page numbers)
5. REMOVE page headers/footers (copyright, version numbers, page numbers)
6. REMOVE promotional content and advertisements
7. REMOVE redundant navigation elements

OUTPUT FORMAT:
- Return only the cleaned markdown
- Keep the same markdown structure (headings, lists, tables, images)
- Do not add any commentary or explanations
- If the entire page is just a table of contents or cover page, return an empty string
- Preserve blank lines between sections for readability`,
      prompt: `Clean up this markdown from page ${pageNumber} of a board game rulebook:\n\n${markdown}`,
    });

    const cleaned = response.text.trim() || '';

    // Safety check: if the LLM removed too much content (>80% reduction),
    // return original to avoid data loss
    if (cleaned.length > 0 && cleaned.length < markdown.length * 0.2) {
      console.log(
        JSON.stringify({
          module: 'markdown-cleanup',
          event: 'excessive_reduction',
          pageNumber,
          originalLength: markdown.length,
          cleanedLength: cleaned.length,
          reductionPercent: Math.round((1 - cleaned.length / markdown.length) * 100),
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

/**
 * Batch cleanup multiple pages of markdown in parallel
 * @param pages Array of markdown strings with their page numbers
 * @param openaiApiKey OpenAI API key
 * @returns Array of cleaned markdown strings in the same order
 */
export async function cleanupMarkdownBatch(
  pages: Array<{ markdown: string; pageNumber: number }>,
  openaiApiKey: string
): Promise<string[]> {
  // Process pages in parallel for efficiency
  const promises = pages.map((page) => cleanupMarkdown(page.markdown, page.pageNumber, openaiApiKey));

  return Promise.all(promises);
}
