/**
 * Image Quality Analysis
 *
 * This module analyzes images from PDFs using GPT-5 vision to:
 * 1. Generate detailed descriptions
 * 2. Determine quality (good/bad)
 * 3. Determine relevance (useful gameplay info vs decorative)
 * 4. Detect type (diagram, table, photo, icon, decorative)
 * 5. Extract OCR text from tables/diagrams
 */

import type { DetectedImageType } from '../db/schema/attachments';
import { getModel } from '../config/models';

export interface ImageAnalysisResult {
  description: string;
  quality: 'good' | 'bad';
  relevant: boolean;
  type: DetectedImageType;
  ocrText?: string;
}

export interface ImageAnalysisContext {
  pageNumber: number;
  gameName?: string;
  resourceName?: string;
  section?: string;
  caption?: string;
  surroundingText?: string;
}

export interface ImageAnalysisOptions {
  model?: string;
  maxTokens?: number;
  environment?: string;
}

const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_OPTIONS: ImageAnalysisOptions = {
  maxTokens: DEFAULT_MAX_TOKENS,
};

/**
 * Analyze an image using GPT-5 vision
 *
 * @param imageBuffer - The image data as Buffer
 * @param context - Context about where this image appears
 * @param openaiApiKey - OpenAI API key
 * @param options - Optional configuration
 * @returns Analysis results
 */
export async function analyzeImageQuality(
  imageBuffer: Buffer,
  context: ImageAnalysisContext,
  openaiApiKey: string,
  options: ImageAnalysisOptions = {}
): Promise<ImageAnalysisResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const model = opts.model || getModel('vision', opts.environment);
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;

  // Convert Buffer to base64 and detect MIME type
  const base64 = bufferToBase64(imageBuffer);
  const mimeType = detectImageMimeType(imageBuffer);

  const prompt = buildImageAnalysisPrompt(context);

  // Define the JSON schema for structured outputs
  const responseSchema = {
    type: 'object' as const,
    properties: {
      description: {
        type: 'string' as const,
        description: 'Detailed description of the image (2-3 sentences)',
      },
      quality: {
        type: 'string' as const,
        enum: ['good', 'bad'],
        description: 'Image quality - good (clear, readable) or bad (blurry, unclear)',
      },
      relevant: {
        type: 'boolean' as const,
        description: 'Whether the image contains useful gameplay information',
      },
      type: {
        type: 'string' as const,
        enum: ['diagram', 'table', 'photo', 'icon', 'decorative'],
        description: 'Type of image',
      },
      ocrText: {
        type: ['string', 'null'] as any,
        description: 'Extracted text from tables/diagrams, or null if none',
      },
    },
    required: ['description', 'quality', 'relevant', 'type', 'ocrText'],
    additionalProperties: false,
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'image_analysis',
            schema: responseSchema,
            strict: true,
          },
        },
        max_completion_tokens: maxTokens,
        temperature: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    // With structured outputs (strict: true), the response is guaranteed to be valid JSON
    // that conforms to our schema. No need for manual parsing/validation.
    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI API');
    }

    // Parse the structured output - guaranteed to match our schema
    const result = JSON.parse(content) as ImageAnalysisResult;

    // Normalize ocrText (null → undefined for consistency)
    return {
      ...result,
      ocrText: result.ocrText || undefined,
    };
  } catch (error) {
    console.error('Error analyzing image (page %d):', context.pageNumber, error);
    // Return a safe fallback rather than failing the entire pipeline
    return {
      description: '',
      quality: 'bad',
      relevant: false,
      type: 'decorative',
    };
  }
}

/**
 * Build the prompt for image analysis
 */
function buildImageAnalysisPrompt(context: ImageAnalysisContext): string {
  const details: string[] = [`- Page: ${context.pageNumber}`];
  if (context.gameName) {
    details.push(`- Game: ${context.gameName}`);
  }
  if (context.resourceName) {
    details.push(`- Resource: ${context.resourceName}`);
  }
  if (context.section) {
    details.push(`- Section: ${context.section}`);
  }
  if (context.caption) {
    details.push(`- Caption: ${context.caption}`);
  }

  const surroundingText = context.surroundingText
    ? `\nRelevant rulebook text (trust this over guesses):\n"""${sanitizeContextText(context.surroundingText)}"""`
    : '';

  return `Analyze this image from a board game rulebook. Use the textual context to ground your answer and avoid speculation.

Context:
${details.join('\n')}${surroundingText}

Provide a JSON response with:

1. **description**: A detailed description of what the image shows (2-3 sentences). Focus on:
   - What game elements are visible (cards, tokens, board, etc.)
   - What the image is demonstrating or teaching
   - Any visible text or labels
   - Spatial relationships and layout

2. **quality**: Is this a clear, readable image?
   - "good": Clear, high resolution, easy to understand
   - "bad": Blurry, low resolution, or unclear

3. **relevant**: Does this contain useful gameplay information?
   - true: Shows game components, setup, gameplay, rules clarification
   - false: Decorative art, marketing photos, or irrelevant content

4. **type**: What kind of image is this?
   - "diagram": Gameplay illustration showing how to play, setup, or use components
   - "table": Data table with rules, stats, or reference information
   - "photo": Product photo showing physical components
   - "icon": Small symbol or graphic element
   - "decorative": Art or decoration without gameplay relevance

5. **ocrText**: If this is a table or contains readable text/labels, extract it exactly. Otherwise, null.
   - For tables: Preserve structure with | separators and newlines
   - For labels: List them clearly
   - If no readable text: null

Return ONLY valid JSON in this exact format:
{
  "description": "string (2-3 sentences)",
  "quality": "good" | "bad",
  "relevant": true | false,
  "type": "diagram" | "table" | "photo" | "icon" | "decorative",
  "ocrText": "string or null"
}`;
}

function sanitizeContextText(text: string, limit = 900): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

/**
 * Detect image MIME type from buffer magic bytes
 */
function detectImageMimeType(buffer: Buffer): string {
  if (buffer.length < 12) return 'image/jpeg'; // Fallback

  // PNG: \x89PNG\r\n\x1a\n
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: \xFF\xD8\xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: RIFF....WEBP (check 'WEBP' at offset 8)
  if (
    buffer.length >= 12 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // GIF: GIF87a or GIF89a
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif';
  }

  // Default fallback
  return 'image/jpeg';
}

/**
 * Convert Buffer to base64 string
 */
function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Batch analyze multiple images
 *
 * Processes images in parallel batches to manage API rate limits
 */
export async function analyzeImagesBatch(
  images: Array<{
    buffer: Buffer;
    context: ImageAnalysisContext;
  }>,
  openaiApiKey: string,
  options: ImageAnalysisOptions & { batchSize?: number; onProgress?: (completed: number, total: number) => void | Promise<void> } = {}
): Promise<ImageAnalysisResult[]> {
  const batchSize = options.batchSize || 3; // Conservative batch size for vision API
  const results: ImageAnalysisResult[] = [];
  const total = images.length;

  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((img) => analyzeImageQuality(img.buffer, img.context, openaiApiKey, options))
    );

    results.push(...batchResults);

    // Report progress after each batch
    const completed = Math.min(i + batchSize, total);
    if (options.onProgress) {
      await options.onProgress(completed, total);
    }

    // Delay between batches to respect rate limits
    if (i + batchSize < images.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}
