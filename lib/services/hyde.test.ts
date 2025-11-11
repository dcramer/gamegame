import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateQuestionsForFragment,
  generateQuestionsForFragments,
} from './hyde';
import type { Resource } from '../db/schema';
import { createMockFetch, openAI } from '@/tests/api-mocks';

// Mock fetch for external OpenAI API calls only
const mockFetch = createMockFetch();

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

  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate questions from OpenAI API', async () => {
    const mockQuestions = [
      'How many territory cards should I place?',
      'Where should the territory cards be placed?',
      'How many territory cards does each player get?',
    ];

    mockFetch.mockResolvedValueOnce(openAI.chatCompletion({ questions: mockQuestions }));

    const result = await generateQuestionsForFragment(
      mockFragment,
      mockResource,
      'test-api-key'
    );

    expect(result).toEqual(mockQuestions);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('should include fragment context in prompt', async () => {
    mockFetch.mockResolvedValueOnce(openAI.chatCompletion({ questions: [] }));

    await generateQuestionsForFragment(mockFragment, mockResource, 'test-api-key');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = callBody.messages[0].content;

    expect(prompt).toContain('Document: Arcs Core Rulebook');
    expect(prompt).toContain('Section: Setup > Player Setup');
    expect(prompt).toContain('Page: 5');
    expect(prompt).toContain('Place 5 territory cards in a circle');
  });

  it('should use default options when not provided', async () => {
    mockFetch.mockResolvedValueOnce(openAI.chatCompletion({ questions: [] }));

    await generateQuestionsForFragment(mockFragment, mockResource, 'test-api-key');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

    expect(callBody.model).toBe('gpt-5-mini');
    expect(callBody.temperature).toBe(1);
    expect(callBody.response_format).toEqual({ type: 'json_object' });
  });

  it('should respect custom model/count options while keeping temperature fixed', async () => {
    mockFetch.mockResolvedValueOnce(openAI.chatCompletion({ questions: [] }));

    await generateQuestionsForFragment(mockFragment, mockResource, 'test-api-key', {
      count: 3,
      model: 'gpt-5',
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

    expect(callBody.model).toBe('gpt-5');
    expect(callBody.temperature).toBe(1);

    const prompt = callBody.messages[0].content;
    expect(prompt).toContain('generate 3 specific questions');
  });

  it('should handle API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce(openAI.error(500, 'Internal Server Error'));

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
    mockFetch.mockResolvedValueOnce(openAI.chatCompletion('not valid json'));

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
    mockFetch.mockResolvedValueOnce(openAI.chatCompletion({ wrong_field: [] }));

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
    mockFetch.mockResolvedValueOnce(
      openAI.chatCompletion({
        questions: [
          'Valid question 1',
          123, // Invalid
          'Valid question 2',
          null, // Invalid
          'Valid question 3',
        ],
      })
    );

    const result = await generateQuestionsForFragment(
      mockFragment,
      mockResource,
      'test-api-key'
    );

    expect(result).toEqual(['Valid question 1', 'Valid question 2', 'Valid question 3']);
  });

  it('should handle fragment without optional fields', async () => {
    mockFetch.mockResolvedValueOnce(openAI.chatCompletion({ questions: [] }));

    const minimalFragment = {
      content: 'Some content',
    };

    await generateQuestionsForFragment(minimalFragment, mockResource, 'test-api-key');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = callBody.messages[0].content;

    expect(prompt).not.toContain('Section:');
    expect(prompt).not.toContain('Page:');
    expect(prompt).toContain('Some content');
  });

  it('should handle resource without optional fields', async () => {
    mockFetch.mockResolvedValueOnce(openAI.chatCompletion({ questions: [] }));

    const minimalResource = {
      name: 'Basic Rulebook',
      description: null,
      resourceType: null,
    };

    await generateQuestionsForFragment(mockFragment, minimalResource, 'test-api-key');

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt = callBody.messages[0].content;

    expect(prompt).toContain('board game rulebook'); // Default type
    expect(prompt).not.toContain('Description:');
  });
});

describe('generateQuestionsForFragments', () => {
  const mockResource: Pick<Resource, 'name' | 'description' | 'resourceType'> = {
    name: 'Test Game',
    description: 'Test description',
    resourceType: 'rulebook',
  };

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should process multiple fragments', async () => {
    const fragments = [
      { content: 'Fragment 1' },
      { content: 'Fragment 2' },
      { content: 'Fragment 3' },
    ];

    // Mock responses for each fragment
    mockFetch
      .mockResolvedValueOnce(openAI.chatCompletion({ questions: ['Q1'] }))
      .mockResolvedValueOnce(openAI.chatCompletion({ questions: ['Q2'] }))
      .mockResolvedValueOnce(openAI.chatCompletion({ questions: ['Q3'] }));

    const results = await generateQuestionsForFragments(fragments, mockResource, 'test-key');

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual(['Q1']);
    expect(results[1]).toEqual(['Q2']);
    expect(results[2]).toEqual(['Q3']);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should process in batches', async () => {
    const fragments = Array.from({ length: 12 }, (_, i) => ({
      content: `Fragment ${i}`,
    }));

    mockFetch.mockResolvedValue(openAI.chatCompletion({ questions: [] }));

    await generateQuestionsForFragments(fragments, mockResource, 'test-key', {
      batchSize: 5,
    });

    // 12 fragments / 5 per batch = 3 batches
    expect(mockFetch).toHaveBeenCalledTimes(12);
  });

  it('should handle errors in individual fragments gracefully', async () => {
    const fragments = [{ content: 'Fragment 1' }, { content: 'Fragment 2' }];

    mockFetch
      .mockResolvedValueOnce(openAI.error(500, 'Error'))
      .mockResolvedValueOnce(openAI.chatCompletion({ questions: ['Q2'] }));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const results = await generateQuestionsForFragments(fragments, mockResource, 'test-key');

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual([]); // Error returns empty array
    expect(results[1]).toEqual(['Q2']);

    consoleSpy.mockRestore();
  });
});
