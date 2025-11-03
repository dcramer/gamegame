import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  analyzeImageQuality,
  analyzeImagesBatch,
  type ImageAnalysisContext,
} from './image-analysis';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

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

  beforeEach(() => {
    mockFetch.mockClear();
  });

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

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(mockApiResult),
            },
          },
        ],
      }),
    });

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
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('should send base64-encoded image to API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'Test',
                quality: 'good',
                relevant: true,
                type: 'diagram',
                ocrText: null,
              }),
            },
          },
        ],
      }),
    });

    const imageBuffer = createMockImageBuffer();
    await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const imageContent = callBody.messages[0].content.find((c: any) => c.type === 'image_url');

    expect(imageContent).toBeDefined();
    expect(imageContent.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('should include context in prompt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'Test',
                quality: 'good',
                relevant: true,
                type: 'diagram',
                ocrText: null,
              }),
            },
          },
        ],
      }),
    });

    const imageBuffer = createMockImageBuffer();
    await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const textContent = callBody.messages[0].content.find((c: any) => c.type === 'text');

    expect(textContent.text).toContain('Page: 5');
    expect(textContent.text).toContain('Section: Setup > Player Setup');
    expect(textContent.text).toContain('Caption: Setup diagram');
  });

  it('should use default options when not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'Test',
                quality: 'good',
                relevant: true,
                type: 'diagram',
                ocrText: null,
              }),
            },
          },
        ],
      }),
    });

    const imageBuffer = createMockImageBuffer();
    await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

    expect(callBody.model).toBe('gpt-4o');
    expect(callBody.max_completion_tokens).toBe(500);
    expect(callBody.temperature).toBe(0);
    expect(callBody.response_format).toEqual({ type: 'json_object' });
  });

  it('should respect custom options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'Test',
                quality: 'good',
                relevant: true,
                type: 'diagram',
                ocrText: null,
              }),
            },
          },
        ],
      }),
    });

    const imageBuffer = createMockImageBuffer();
    await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key', {
      model: 'gpt-4o-mini',
      maxTokens: 300,
      temperature: 0.5,
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

    expect(callBody.model).toBe('gpt-4o-mini');
    expect(callBody.max_completion_tokens).toBe(300);
    expect(callBody.temperature).toBe(0.5);
  });

  it('should handle context without optional fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'Test',
                quality: 'good',
                relevant: true,
                type: 'diagram',
                ocrText: null,
              }),
            },
          },
        ],
      }),
    });

    const minimalContext: ImageAnalysisContext = {
      pageNumber: 1,
    };

    const imageBuffer = createMockImageBuffer();
    await analyzeImageQuality(imageBuffer, minimalContext, 'test-api-key');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const textContent = callBody.messages[0].content.find((c: any) => c.type === 'text');

    expect(textContent.text).toContain('Page: 1');
    expect(textContent.text).not.toContain('Section:');
    expect(textContent.text).not.toContain('Caption:');
  });

  it('should normalize ocrText to undefined when null or empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'Test',
                quality: 'good',
                relevant: true,
                type: 'diagram',
                ocrText: null,
              }),
            },
          },
        ],
      }),
    });

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    expect(result.ocrText).toBeUndefined();
  });

  it('should preserve ocrText when provided', async () => {
    const ocrText = 'Player 1 | Player 2 | Player 3\nScore | 10 | 15 | 12';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'Table showing player scores',
                quality: 'good',
                relevant: true,
                type: 'table',
                ocrText,
              }),
            },
          },
        ],
      }),
    });

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    expect(result.ocrText).toBe(ocrText);
  });

  it('should handle API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    // Should return safe fallback
    expect(result.description).toBe('Image analysis failed');
    expect(result.quality).toBe('bad');
    expect(result.relevant).toBe(false);
    expect(result.type).toBe('decorative');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should handle invalid JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'not valid json',
            },
          },
        ],
      }),
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    expect(result.description).toBe('Image analysis failed');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should validate description field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: '', // Empty description
                quality: 'good',
                relevant: true,
                type: 'diagram',
                ocrText: null,
              }),
            },
          },
        ],
      }),
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    expect(result.description).toBe('Image analysis failed');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should validate quality field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'Test',
                quality: 'invalid', // Invalid quality
                relevant: true,
                type: 'diagram',
                ocrText: null,
              }),
            },
          },
        ],
      }),
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    expect(result.description).toBe('Image analysis failed');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should validate type field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'Test',
                quality: 'good',
                relevant: true,
                type: 'invalid_type', // Invalid type
                ocrText: null,
              }),
            },
          },
        ],
      }),
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const imageBuffer = createMockImageBuffer();
    const result = await analyzeImageQuality(imageBuffer, mockContext, 'test-api-key');

    expect(result.description).toBe('Image analysis failed');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe('analyzeImagesBatch', () => {
  const mockContext: ImageAnalysisContext = {
    pageNumber: 1,
  };

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should process multiple images', async () => {
    const images = [
      { buffer: createMockImageBuffer(), context: { ...mockContext, pageNumber: 1 } },
      { buffer: createMockImageBuffer(), context: { ...mockContext, pageNumber: 2 } },
      { buffer: createMockImageBuffer(), context: { ...mockContext, pageNumber: 3 } },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'Test',
                quality: 'good',
                relevant: true,
                type: 'diagram',
                ocrText: null,
              }),
            },
          },
        ],
      }),
    });

    const results = await analyzeImagesBatch(images, 'test-api-key');

    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should process in batches', async () => {
    const images = Array.from({ length: 7 }, (_, i) => ({
      buffer: createMockImageBuffer(),
      context: { ...mockContext, pageNumber: i },
    }));

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                description: 'Test',
                quality: 'good',
                relevant: true,
                type: 'diagram',
                ocrText: null,
              }),
            },
          },
        ],
      }),
    });

    await analyzeImagesBatch(images, 'test-api-key', { batchSize: 3 });

    // 7 images / 3 per batch = 3 batches
    expect(mockFetch).toHaveBeenCalledTimes(7);
  });

  it('should handle errors in individual images gracefully', async () => {
    const images = [
      { buffer: createMockImageBuffer(), context: mockContext },
      { buffer: createMockImageBuffer(), context: mockContext },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Error',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  description: 'Good image',
                  quality: 'good',
                  relevant: true,
                  type: 'diagram',
                  ocrText: null,
                }),
              },
            },
          ],
        }),
      });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const results = await analyzeImagesBatch(images, 'test-api-key');

    expect(results).toHaveLength(2);
    expect(results[0].description).toBe('Image analysis failed'); // Error fallback
    expect(results[1].description).toBe('Good image'); // Success

    consoleSpy.mockRestore();
  });
});
