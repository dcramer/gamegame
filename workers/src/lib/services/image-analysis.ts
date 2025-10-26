/**
 * Image Quality Analysis
 *
 * This module analyzes images from PDFs using GPT-4o vision to:
 * 1. Generate detailed descriptions
 * 2. Determine quality (good/bad)
 * 3. Determine relevance (useful gameplay info vs decorative)
 * 4. Detect type (diagram, table, photo, icon, decorative)
 * 5. Extract OCR text from tables/diagrams
 */

import type { DetectedImageType } from '../db/schema/d1';

export interface ImageAnalysisResult {
  description: string;
  quality: 'good' | 'bad';
  relevant: boolean;
  type: DetectedImageType;
  ocrText?: string;
}

export interface ImageAnalysisContext {
  pageNumber: number;
  section?: string;
  caption?: string;
}

export interface ImageAnalysisOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_OPTIONS: ImageAnalysisOptions = {
  model: 'gpt-4o',
  maxTokens: 500,
  temperature: 0,
};

/**
 * Analyze an image using GPT-4o vision
 *
 * @param imageBuffer - The image data as ArrayBuffer
 * @param context - Context about where this image appears
 * @param openaiApiKey - OpenAI API key
 * @param options - Optional configuration
 * @returns Analysis results
 */
export async function analyzeImageQuality(
  imageBuffer: ArrayBuffer,
  context: ImageAnalysisContext,
  openaiApiKey: string,
  options: ImageAnalysisOptions = {}
): Promise<ImageAnalysisResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Convert ArrayBuffer to base64
  const base64 = arrayBufferToBase64(imageBuffer);

  const prompt = buildImageAnalysisPrompt(context);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
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
                  url: `data:image/jpeg;base64,${base64}`,
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const result = JSON.parse(data.choices[0].message.content);

    // Validate and normalize the response
    return validateAnalysisResult(result);
  } catch (error) {
    console.error('Error analyzing image:', error);
    // Return a safe fallback rather than failing the entire pipeline
    return {
      description: 'Image analysis failed',
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
  return `Analyze this image from a board game rulebook.

Context:
- Page: ${context.pageNumber}
${context.section ? `- Section: ${context.section}` : ''}
${context.caption ? `- Caption: ${context.caption}` : ''}

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

/**
 * Validate and normalize the API response
 */
function validateAnalysisResult(result: any): ImageAnalysisResult {
  // Validate required fields
  if (typeof result.description !== 'string' || !result.description.trim()) {
    throw new Error('Invalid description in analysis result');
  }

  if (!['good', 'bad'].includes(result.quality)) {
    throw new Error('Invalid quality in analysis result');
  }

  if (typeof result.relevant !== 'boolean') {
    throw new Error('Invalid relevant flag in analysis result');
  }

  const validTypes: DetectedImageType[] = ['diagram', 'table', 'photo', 'icon', 'decorative'];
  if (!validTypes.includes(result.type)) {
    throw new Error('Invalid type in analysis result');
  }

  // Normalize ocrText (null or string)
  const ocrText =
    result.ocrText && typeof result.ocrText === 'string' && result.ocrText.trim()
      ? result.ocrText.trim()
      : undefined;

  return {
    description: result.description.trim(),
    quality: result.quality,
    relevant: result.relevant,
    type: result.type,
    ocrText,
  };
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;

  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  // Use btoa for base64 encoding (available in Workers runtime)
  return btoa(binary);
}

/**
 * Batch analyze multiple images
 *
 * Processes images in parallel batches to manage API rate limits
 */
export async function analyzeImagesBatch(
  images: Array<{
    buffer: ArrayBuffer;
    context: ImageAnalysisContext;
  }>,
  openaiApiKey: string,
  options: ImageAnalysisOptions & { batchSize?: number } = {}
): Promise<ImageAnalysisResult[]> {
  const batchSize = options.batchSize || 3; // Conservative batch size for vision API
  const results: ImageAnalysisResult[] = [];

  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((img) => analyzeImageQuality(img.buffer, img.context, openaiApiKey, options))
    );

    results.push(...batchResults);

    // Delay between batches to respect rate limits
    if (i + batchSize < images.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}
