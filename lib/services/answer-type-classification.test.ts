import { describe, it, expect, vi } from 'vitest';
import { ANSWER_TYPES, classifyFragmentAnswerTypes } from './answer-type-classification';
import { mockOpenAIError } from '@/tests/mocks/network';

describe('answer-type-classification', () => {
  it('should export 25 answer type categories', () => {
    expect(ANSWER_TYPES.length).toBe(25);

    // Verify all expected categories are present
    const expectedCategories = [
      'player_count', 'play_time', 'age_rating', 'game_overview', 'publisher_info',
      'setup_instructions', 'turn_structure', 'win_conditions', 'end_game', 'scoring',
      'component_list', 'card_types', 'resource_types', 'board_layout', 'token_types',
      'action_options', 'combat_rules', 'movement_rules', 'trading_rules', 'special_abilities',
      'edge_case', 'example', 'faq', 'timing', 'rule_clarification'
    ];

    expectedCategories.forEach(category => {
      expect(ANSWER_TYPES).toContain(category);
    });
  });

  it('should have correct type definition', () => {
    // TypeScript compile-time check - if this compiles, the type is correct
    const validType: typeof ANSWER_TYPES[number] = 'player_count';
    expect(validType).toBe('player_count');
  });

  it('classifyFragmentAnswerTypes should return empty array on API error', async () => {
    const fragment = {
      content: 'Test content',
      section: 'Test Section',
      pageNumber: 1,
    };

    const resource = {
      name: 'Test Resource',
      description: 'Test Description',
      resourceType: 'rulebook' as const,
    };

    // Mock API error
    mockOpenAIError(500, 'Internal Server Error');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await classifyFragmentAnswerTypes(
      fragment,
      resource,
      'test-api-key'
    );

    // Should gracefully return empty array instead of throwing
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);

    consoleSpy.mockRestore();
  });
});
