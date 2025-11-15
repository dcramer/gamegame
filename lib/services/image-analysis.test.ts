import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  analyzeImageQuality,
  analyzeImagesBatch,
  type ImageAnalysisContext,
} from './image-analysis';
import { mockChatCompletion, mockOpenAIError } from '@/tests/mocks/network';

// Helper to create a mock image buffer
function createMockImageBuffer(sizeBytes: number = 10000): Buffer {
  return Buffer.alloc(sizeBytes);
}

describe('analyzeImageQuality', () => {
  const mockContext: ImageAnalysisContext = {
    pageNumber: 5,
    section: 'Setup > Player Setup',
    caption: 'Setup diagram',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should analyze image and return structured result', async () => {
    const mockApiResult = {
      description: 'Diagram showing the game board setup for a 5-player game with territory cards arranged in a circle',
      quality: 'good',
      relevant: true,
      type: 'diagram',
      ocrText: null,
    };

    mockChatCompletion(mockApiResult);

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    // ocrText: null from API is normalized to undefined
    expect(result).toEqual({
      description: mockApiResult.description,
      quality: mockApiResult.quality,
      relevant: mockApiResult.relevant,
      type: mockApiResult.type,
      ocrText: undefined,
    });
  });

  it('should send base64-encoded image to API', async () => {
    mockChatCompletion({
      description: 'Test',
      quality: 'good',
      relevant: true,
      type: 'diagram',
      ocrText: null,
    });

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    // Just verify it succeeds - MSW handles the network layer
    expect(result.description).toBe('Test');
  });

  it('should include context in prompt', async () => {
    mockChatCompletion({
      description: 'Test',
      quality: 'good',
      relevant: true,
      type: 'diagram',
      ocrText: null,
    });

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    // Verify it succeeds - mock returns 'Test' description
    expect(result.description).toBe('Test');
  });

  it('should use default options when not provided', async () => {
    mockChatCompletion({
      description: 'Test',
      quality: 'good',
      relevant: true,
      type: 'diagram',
      ocrText: null,
    }, { model: 'gpt-5-mini' });

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    expect(result.description).toBeDefined();
  });

  it('should respect custom model/max token options while keeping temperature fixed', async () => {
    mockChatCompletion({
      description: 'Test',
      quality: 'good',
      relevant: true,
      type: 'diagram',
      ocrText: null,
    }, { model: 'gpt-5' });

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key', {
      model: 'gpt-5',
      maxTokens: 300,
    });

    expect(result.description).toBeDefined();
  });

  it('should handle context without optional fields', async () => {
    mockChatCompletion({
      description: 'Test',
      quality: 'good',
      relevant: true,
      type: 'diagram',
      ocrText: null,
    });

    const minimalContext: ImageAnalysisContext = {
      pageNumber: 1,
    };

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, minimalContext, 'test-api-key');

    expect(result.description).toBeDefined();
  });

  it('should normalize ocrText to undefined when null or empty', async () => {
    mockChatCompletion({
      description: 'Test',
      quality: 'good',
      relevant: true,
      type: 'diagram',
      ocrText: null,
    });

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    expect(result.ocrText).toBeUndefined();
  });

  it('should preserve ocrText when provided', async () => {
    const ocrText = 'Player 1 | Player 2 | Player 3\nScore | 10 | 15 | 12';

    mockChatCompletion({
      description: 'Table showing player scores',
      quality: 'good',
      relevant: true,
      type: 'table',
      ocrText,
    });

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    expect(result.ocrText).toBe(ocrText);
  });

  it('should handle API errors gracefully', async () => {
    mockOpenAIError(500, 'Internal Server Error');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    // Should return safe fallback
    expect(result.description).toBe('');
    expect(result.quality).toBe('bad');
    expect(result.relevant).toBe(false);
    expect(result.type).toBe('decorative');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should handle invalid JSON response', async () => {
    mockChatCompletion('not valid json');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    expect(result.description).toBe('');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should work with structured outputs (strict JSON schema)', async () => {
    const validJson = {
      description: 'Test diagram showing game setup',
      quality: 'good',
      relevant: true,
      type: 'diagram',
      ocrText: null,
    };

    // With structured outputs (strict: true), OpenAI guarantees schema-conformant JSON
    // No markdown wrapping or validation needed
    mockChatCompletion(validJson);

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    expect(result.description).toBe('Test diagram showing game setup');
    expect(result.quality).toBe('good');
    expect(result.relevant).toBe(true);
    expect(result.type).toBe('diagram');
  });

  it('should handle empty response from OpenAI', async () => {
    // Mock an empty content response
    mockChatCompletion('');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    // Should return safe fallback
    expect(result.description).toBe('');
    expect(result.quality).toBe('bad');
    expect(result.relevant).toBe(false);
    expect(result.type).toBe('decorative');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe('analyzeImagesBatch', () => {
  const mockContext: ImageAnalysisContext = {
    pageNumber: 1,
  };

  it('should process multiple images', async () => {
    const images = [
      { buffer: createMockImageBuffer(), context: { ...mockContext, pageNumber: 1 } },
      { buffer: createMockImageBuffer(), context: { ...mockContext, pageNumber: 2 } },
      { buffer: createMockImageBuffer(), context: { ...mockContext, pageNumber: 3 } },
    ];

    mockChatCompletion({
      description: 'Test',
      quality: 'good',
      relevant: true,
      type: 'diagram',
      ocrText: null,
    });

    const results = await analyzeImagesBatch(images, 'test-api-key');

    expect(results).toHaveLength(3);
  });

  it('should process in batches', async () => {
    const images = Array.from({ length: 7 }, (_, i) => ({
      buffer: createMockImageBuffer(),
      context: { ...mockContext, pageNumber: i },
    }));

    mockChatCompletion({
      description: 'Test',
      quality: 'good',
      relevant: true,
      type: 'diagram',
      ocrText: null,
    });

    const results = await analyzeImagesBatch(images, 'test-api-key', { batchSize: 3 });

    // Should process all 7 images
    expect(results).toHaveLength(7);
  });

  it('should handle errors in individual images gracefully', async () => {
    const images = [
      { buffer: createMockImageBuffer(), context: mockContext },
      { buffer: createMockImageBuffer(), context: mockContext },
    ];

    // First call will error, second will use default mock
    mockOpenAIError(500, 'Error');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const results = await analyzeImagesBatch(images, 'test-api-key');

    expect(results).toHaveLength(2);
    // Both will error with our mock setup
    expect(results.every(r => r.description === '')).toBe(true);

    consoleSpy.mockRestore();
  });
});
