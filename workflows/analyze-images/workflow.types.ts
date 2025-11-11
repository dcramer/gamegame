/**
 * Types for analyze-images workflow
 */

export type AnalyzeImagesMode = 'batch-resource' | 'single-attachment';

export interface AnalyzeImagesInput {
  mode: AnalyzeImagesMode;

  // For single-attachment mode
  attachmentId?: string;
  gameId?: string;

  // For batch-resource mode
  resourceId?: string;
  gameName?: string;
  runId?: string;
}

export interface AnalyzeImagesResult {
  success: boolean;
  mode: AnalyzeImagesMode;
  attachmentId?: string;
  resourceId?: string;
  imagesProcessed?: number;
  error?: string;
}
