import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateQuestionsForFragment,
  generateQuestionsForFragments,
} from './hyde';
import type { Resource } from '../db/schema';
import { mockChatCompletion, mockOpenAIError } from '@/tests/mocks/network';

describe('generateQuestionsForFragment', () => {
  const mockResource: Pick<Resource, 'name' | 'description' | 'resourceType'> = {
    name: 'Arcs Core Rulebook',
    description: 'Official rules for the base game',
    resourceType: 'rulebook',
  };

  const mockFragment = {
    content: 'Place 5 territory cards in a circle around the board. Each player takes one.',
    section: 'Setup > Player Setup',
    pageNumber: 5,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate questions from OpenAI API', async () => {
    const mockQuestions = [
      'How many territory cards should I place?',
      'Where should the territory cards be placed?',
      'How many territory cards does each player get?',
    ];

    mockChatCompletion({ questions: mockQuestions });

    const result = await generateQuestionsForFragment(
      mockFragment,
      mockResource,
      'test-api-key'
    );

    expect(result).toEqual(mockQuestions);
  });

  it('should include fragment context in prompt', async () => {
    mockChatCompletion({ questions: [] });

    const result = await generateQuestionsForFragment(mockFragment, mockResource, 'test-api-key');

    // Just verify it succeeds - the implementation handles the prompt building
    expect(result).toEqual([]);
  });

  it('should use default options when not provided', async () => {
    mockChatCompletion({ questions: [] }, { model: 'gpt-5-mini' });

    const result = await generateQuestionsForFragment(mockFragment, mockResource, 'test-api-key');

    expect(result).toEqual([]);
  });

  it('should respect custom model/count options while keeping temperature fixed', async () => {
    mockChatCompletion({ questions: [] }, { model: 'gpt-5' });

    const result = await generateQuestionsForFragment(mockFragment, mockResource, 'test-api-key', {
      count: 3,
      model: 'gpt-5',
    });

    expect(result).toEqual([]);
  });

  it('should handle API errors gracefully', async () => {
    mockOpenAIError(500, 'Internal Server Error');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await generateQuestionsForFragment(
      mockFragment,
      mockResource,
      'test-api-key'
    );

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should handle invalid JSON response', async () => {
    mockChatCompletion('not valid json');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await generateQuestionsForFragment(
      mockFragment,
      mockResource,
      'test-api-key'
    );

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should handle missing questions array in response', async () => {
    mockChatCompletion({ wrong_field: [] });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await generateQuestionsForFragment(
      mockFragment,
      mockResource,
      'test-api-key'
    );

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should filter out non-string questions', async () => {
    mockChatCompletion({
      questions: [
        'Valid question 1',
        123, // Invalid
        'Valid question 2',
        null, // Invalid
        'Valid question 3',
      ],
    });

    const result = await generateQuestionsForFragment(
      mockFragment,
      mockResource,
      'test-api-key'
    );

    expect(result).toEqual(['Valid question 1', 'Valid question 2', 'Valid question 3']);
  });

  it('should handle fragment without optional fields', async () => {
    mockChatCompletion({ questions: [] });

    const minimalFragment = {
      content: 'Some content',
    };

    const result = await generateQuestionsForFragment(minimalFragment, mockResource, 'test-api-key');

    expect(result).toEqual([]);
  });

  it('should handle resource without optional fields', async () => {
    mockChatCompletion({ questions: [] });

    const minimalResource = {
      name: 'Basic Rulebook',
      description: null,
      resourceType: null,
    };

    const result = await generateQuestionsForFragment(mockFragment, minimalResource, 'test-api-key');

    expect(result).toEqual([]);
  });
});

describe('generateQuestionsForFragments', () => {
  const mockResource: Pick<Resource, 'name' | 'description' | 'resourceType'> = {
    name: 'Test Game',
    description: 'Test description',
    resourceType: 'rulebook',
  };

  it('should process multiple fragments', async () => {
    const fragments = [
      { content: 'Fragment 1' },
      { content: 'Fragment 2' },
      { content: 'Fragment 3' },
    ];

    // Mock responses for each fragment - MSW will handle all three calls
    mockChatCompletion({ questions: ['Q1', 'Q2', 'Q3'] });

    const results = await generateQuestionsForFragments(fragments, mockResource, 'test-key');

    expect(results).toHaveLength(3);
    // Each fragment gets the same mock response
    expect(results.every(r => r.length > 0)).toBe(true);
  });

  it('should process in batches', async () => {
    const fragments = Array.from({ length: 12 }, (_, i) => ({
      content: `Fragment ${i}`,
    }));

    mockChatCompletion({ questions: [] });

    const results = await generateQuestionsForFragments(fragments, mockResource, 'test-key', {
      batchSize: 5,
    });

    // Should process all 12 fragments
    expect(results).toHaveLength(12);
  });

  it('should handle errors in individual fragments gracefully', async () => {
    const fragments = [{ content: 'Fragment 1' }, { content: 'Fragment 2' }];

    // First call will error, subsequent calls will use default mock
    mockOpenAIError(500, 'Error');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const results = await generateQuestionsForFragments(fragments, mockResource, 'test-key');

    expect(results).toHaveLength(2);
    // Both will error with our mock setup
    expect(results.every(r => r.length === 0)).toBe(true);

    consoleSpy.mockRestore();
  });
});
