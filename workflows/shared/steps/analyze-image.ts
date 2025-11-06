/**
 * ANALYZE IMAGE Step - Run vision analysis with OpenAI GPT-4o
 *
 * Shared step that analyzes images and returns full analysis results.
 * Standardized across all workflows to ensure consistent analysis.
 */
'use step';

import type { ImageAnalysisContext, ImageAnalysisResult } from '@/lib/services/image-analysis';

export interface AnalyzeImageInput {
  buffer: Buffer;
  context: ImageAnalysisContext;
}

export interface AnalyzeImageResult {
  success: boolean;
  analysis?: ImageAnalysisResult;
  error?: string;
}

export async function analyzeImageStep(input: AnalyzeImageInput): Promise<AnalyzeImageResult> {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return {
        success: false,
        error: 'Missing OPENAI_API_KEY',
      };
    }

    const { analyzeImageQuality } = await import('@/lib/services/image-analysis');

    const analysis = await analyzeImageQuality(
      input.buffer,
      input.context,
      OPENAI_API_KEY
    );

    return {
      success: true,
      analysis,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Batch analyze multiple images
 */
export interface AnalyzeBatchInput {
  images: Array<{
    buffer: Buffer;
    context: ImageAnalysisContext;
  }>;
  batchSize?: number;
}

export interface AnalyzeBatchResult {
  success: boolean;
  analyses?: ImageAnalysisResult[];
  error?: string;
}

export async function analyzeBatchStep(input: AnalyzeBatchInput): Promise<AnalyzeBatchResult> {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return {
        success: false,
        error: 'Missing OPENAI_API_KEY',
      };
    }

    const { analyzeImagesBatch } = await import('@/lib/services/image-analysis');

    const analyses = await analyzeImagesBatch(
      input.images,
      OPENAI_API_KEY,
      { batchSize: input.batchSize || 3 }
    );

    return {
      success: true,
      analyses,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
