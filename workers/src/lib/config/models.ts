/**
 * Model Configuration
 *
 * Centralizes model selection across the application.
 * Uses environment variables to switch between dev (cheap) and prod (quality) models.
 */

export type Environment = 'development' | 'production' | 'test';

export interface ModelConfig {
  /** Model for OCR text extraction */
  ocr: 'mistral' | 'custom';
  /** Model for vision/image analysis */
  vision: string;
  /** Model for text reasoning (cleanup, metadata, etc.) */
  reasoning: string;
  /** Model for synthetic question generation (HyDE) */
  hyde: string;
  /** Model for answer type classification */
  classification: string;
  /** Model for search result reranking */
  reranking: string;
  /** Model for embeddings */
  embedding: string;
}

/**
 * Development/Test models - optimized for cost and speed
 */
const DEV_MODELS: ModelConfig = {
  ocr: 'mistral',
  vision: 'gpt-5-mini',
  reasoning: 'gpt-5-mini',
  hyde: 'gpt-5-mini',
  classification: 'gpt-5-mini',
  reranking: 'gpt-5-mini',
  embedding: 'text-embedding-3-small',
};

/**
 * Production models - optimized for quality
 */
const PROD_MODELS: ModelConfig = {
  ocr: 'mistral',
  vision: 'gpt-5',
  reasoning: 'gpt-5',
  hyde: 'gpt-5',
  classification: 'gpt-5-mini', // Classification is simpler, mini is sufficient
  reranking: 'gpt-5-mini',
  embedding: 'text-embedding-3-small',
};

/**
 * Get the current environment from env variable
 */
function getEnvironment(envVar?: string): Environment {
  const env = envVar?.toLowerCase();

  if (env === 'production' || env === 'prod') {
    return 'production';
  }

  if (env === 'test') {
    return 'test';
  }

  return 'development';
}

/**
 * Get model configuration based on environment
 */
export function getModelConfig(environment?: string): ModelConfig {
  const env = getEnvironment(environment);

  // Test and development use the same cheap models
  if (env === 'development' || env === 'test') {
    return DEV_MODELS;
  }

  return PROD_MODELS;
}

/**
 * Get a specific model for a task
 */
export function getModel(task: keyof ModelConfig, environment?: string): string {
  const config = getModelConfig(environment);
  return config[task];
}
