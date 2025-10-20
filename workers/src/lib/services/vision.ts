import type { StructuredPDFContent, PDFImage } from '../types/pdf';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export interface VisionAnalysisResult {
  description: string;
  isGoodQuality: 'good' | 'bad';
}

/**
 * Retry helper for vision API calls
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 5000,
    operationName = 'operation',
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
        console.log(
          `${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`,
          lastError.message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Analyze an image using GPT-4 Vision to generate a description and quality assessment
 * @param base64Image Base64-encoded image data (with or without data URI prefix)
 * @param surroundingText Text content surrounding the image for context
 * @param context Optional context (game name, section hierarchy)
 * @param metadata Optional metadata for logging (e.g., page number, image index)
 * @param openaiApiKey OpenAI API key
 * @returns Description and quality assessment
 */
export async function analyzeImageWithVision(
  base64Image: string,
  surroundingText: string,
  openaiApiKey: string,
  context?: { gameName?: string; sectionHierarchy?: string },
  metadata?: { pageNumber?: number; imageIndex?: number; imageId?: string }
): Promise<VisionAnalysisResult> {
  console.log('Starting vision analysis', {
    contextLength: surroundingText.length,
    ...metadata,
  });

  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY is required for vision analysis');
  }

  // Strip data URI prefix if present, then re-add to ensure consistency
  let base64Data = base64Image;
  const dataUriMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    base64Data = dataUriMatch[2];
  }

  // Build context-aware prompt with game name and section
  let contextInfo = '';
  if (context?.gameName) {
    contextInfo += `Game: ${context.gameName}\n`;
  }
  if (context?.sectionHierarchy) {
    contextInfo += `Section: ${context.sectionHierarchy}\n`;
  }
  if (surroundingText.trim()) {
    contextInfo += `\nSurrounding text:\n${surroundingText.substring(0, 800)}${
      surroundingText.length > 800 ? '...' : ''
    }\n`;
  }

  const prompt = `${contextInfo ? `${contextInfo}\n` : ''}Describe this rulebook image in ONE SHORT sentence. Focus on what game elements it shows and what it's used for (e.g., "Player board showing resource tracks" or "Card back design"). Be specific and concise.

Also assess quality: Mark as "BAD" only if severely cropped, extremely blurry, corrupted, or missing critical parts. Minor issues are "GOOD".

Format as JSON:
{
  "description": "One sentence description",
  "quality": "GOOD" or "BAD"
}`;

  const openai = createOpenAI({ apiKey: openaiApiKey });

  const result = await withRetry(
    async () => {
      const { text } = await generateText({
        model: openai('gpt-4o'), // gpt-4o has vision capabilities
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image',
                image: `data:image/jpeg;base64,${base64Data}`,
              },
            ],
          },
        ],
        temperature: 0.3, // Lower temperature for consistent structured output
      });

      if (!text) {
        throw new Error('No response from vision model');
      }

      return text;
    },
    {
      operationName: 'gpt-4-vision',
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 5000,
    }
  );

  // Parse JSON response
  let parsed: { description: string; quality: 'GOOD' | 'BAD' };
  try {
    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = result.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : result;
    parsed = JSON.parse(jsonText);
  } catch (error) {
    console.warn('Failed to parse vision response as JSON', { error, response: result });
    // Fallback: extract description and quality from text
    const descMatch = result.match(/description['":\s]+([^"]+)/i);
    const qualityMatch = result.match(/quality['":\s]+(GOOD|BAD)/i);

    parsed = {
      description: descMatch?.[1]?.trim() || result.substring(0, 200),
      quality: (qualityMatch?.[1]?.toUpperCase() as 'GOOD' | 'BAD') || 'GOOD',
    };
  }

  console.log('Vision analysis completed', {
    quality: parsed.quality,
    descriptionLength: parsed.description.length,
  });

  return {
    description: parsed.description,
    isGoodQuality: parsed.quality === 'GOOD' ? 'good' : 'bad',
  };
}

/**
 * Batch analyze multiple images with surrounding context
 * Processes images in parallel with rate limiting
 */
export async function batchAnalyzeImages(
  images: Array<{
    base64: string;
    surroundingText: string;
    context?: { gameName?: string; sectionHierarchy?: string };
    metadata?: { pageNumber?: number; imageIndex?: number; imageId?: string };
  }>,
  openaiApiKey: string,
  options: {
    maxConcurrency?: number;
  } = {}
): Promise<VisionAnalysisResult[]> {
  const { maxConcurrency = 5 } = options;
  console.log('Starting batch vision analysis', {
    imageCount: images.length,
    maxConcurrency,
  });

  const results: VisionAnalysisResult[] = [];

  // Process in batches to avoid rate limits
  for (let i = 0; i < images.length; i += maxConcurrency) {
    const batch = images.slice(i, i + maxConcurrency);
    const batchResults = await Promise.all(
      batch.map((img) =>
        analyzeImageWithVision(img.base64, img.surroundingText, openaiApiKey, img.context, img.metadata)
      )
    );
    results.push(...batchResults);

    console.log('Batch completed', { processed: i + batch.length, total: images.length });
  }

  console.log('Batch vision analysis completed', { imageCount: images.length });

  return results;
}

/**
 * Enrich all images in structured PDF content with vision analysis
 * Mutates the PDFImage objects in place to add description and isGoodQuality
 */
export async function enrichPDFImagesWithVision(
  structured: StructuredPDFContent,
  openaiApiKey: string,
  gameName?: string,
  options: {
    maxConcurrency?: number;
  } = {}
): Promise<void> {
  console.log('Starting PDF image enrichment', {
    pageCount: structured.pages.length,
    gameName,
  });

  // Collect all images with their page context and section hierarchy
  const imagesToAnalyze: Array<{
    image: PDFImage;
    pageMarkdown: string;
    pageNumber: number;
    imageIndex: number;
    sectionHierarchy?: string;
  }> = [];

  for (const page of structured.pages) {
    // Get the last section on this page (most specific context for images)
    const lastSection =
      page.sections.length > 0 ? page.sections[page.sections.length - 1].hierarchy : undefined;

    page.images.forEach((image, imageIndex) => {
      if (image.base64) {
        imagesToAnalyze.push({
          image,
          pageMarkdown: page.markdown,
          pageNumber: page.pageNumber,
          imageIndex,
          sectionHierarchy: lastSection,
        });
      }
    });
  }

  if (imagesToAnalyze.length === 0) {
    console.log('No images to analyze');
    return;
  }

  console.log('Analyzing images', { imageCount: imagesToAnalyze.length });

  // Analyze all images in batches
  const analyses = await batchAnalyzeImages(
    imagesToAnalyze.map((item) => ({
      base64: item.image.base64!,
      surroundingText: item.pageMarkdown,
      context: {
        gameName,
        sectionHierarchy: item.sectionHierarchy,
      },
      metadata: {
        pageNumber: item.pageNumber,
        imageIndex: item.imageIndex,
        imageId: item.image.id,
      },
    })),
    openaiApiKey,
    options
  );

  // Mutate the original image objects with analysis results
  imagesToAnalyze.forEach((item, index) => {
    const analysis = analyses[index];
    item.image.description = analysis.description;
    item.image.isGoodQuality = analysis.isGoodQuality;
  });

  const goodQualityCount = analyses.filter((a) => a.isGoodQuality === 'good').length;
  const badQualityCount = analyses.filter((a) => a.isGoodQuality === 'bad').length;

  console.log('PDF image enrichment completed', {
    imageCount: imagesToAnalyze.length,
    goodQualityCount,
    badQualityCount,
  });

  // Filter out bad quality images from page markdown
  if (badQualityCount > 0) {
    console.log('Removing bad quality images from markdown', { badQualityCount });
    const { removeBadQualityImages } = await import('../pdf');

    for (const page of structured.pages) {
      page.markdown = removeBadQualityImages(page.markdown, page.images);
    }
  }
}
