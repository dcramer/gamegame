/**
 * Answer Type Classification
 *
 * This module classifies fragments by the types of questions they can answer.
 * This metadata improves retrieval accuracy by allowing us to boost results
 * that match the user's question type.
 *
 * The intuition: Different content answers different types of questions.
 * By pre-labeling what questions each chunk can answer, we can more accurately
 * match user queries to relevant content.
 */

import type { Resource } from '../db/schema/d1';
import { getModel } from '../config/models';

/**
 * Answer type categories
 * These represent common question types players ask about board games
 */
export const ANSWER_TYPES = [
  // Metadata questions
  'player_count',
  'play_time',
  'age_rating',
  'game_overview',
  'publisher_info',

  // Rules questions
  'setup_instructions',
  'turn_structure',
  'win_conditions',
  'end_game',
  'scoring',

  // Component questions
  'component_list',
  'card_types',
  'resource_types',
  'board_layout',
  'token_types',

  // Gameplay questions
  'action_options',
  'combat_rules',
  'movement_rules',
  'trading_rules',
  'special_abilities',

  // Clarification questions
  'edge_case',
  'example',
  'faq',
  'timing',
  'rule_clarification',
] as const;

export type AnswerType = typeof ANSWER_TYPES[number];

export interface ClassificationOptions {
  /** Temperature for generation (default: 0.3 for consistency) */
  temperature?: number;
  /** Model to use (default: from environment config) */
  model?: string;
  /** Environment to determine model selection (development/production) */
  environment?: string;
}

const DEFAULT_OPTIONS: ClassificationOptions = {
  temperature: 0.3, // Lower temperature for more consistent classification
  // model determined at runtime from environment
};

/**
 * Classify what types of questions a fragment can answer
 *
 * Uses configured LLM (GPT-5 in prod, GPT-4o-mini in dev) to analyze
 * the fragment content and tag it with applicable answer types.
 */
export async function classifyFragmentAnswerTypes(
  fragment: {
    content: string;
    section?: string;
    pageNumber?: number;
  },
  resource: Pick<Resource, 'name' | 'description' | 'resourceType'>,
  openaiApiKey: string,
  options: ClassificationOptions = {}
): Promise<AnswerType[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Get model from config if not explicitly provided
  // Use 'classification' config key (falls back to default model)
  const model = opts.model || getModel('classification', opts.environment);

  const prompt = buildClassificationPrompt(fragment, resource);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: opts.temperature,
        max_completion_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const result = JSON.parse(data.choices[0].message.content);

    // Validate and return answer types
    if (!Array.isArray(result.answerTypes)) {
      throw new Error('Invalid response format: expected answerTypes array');
    }

    // Filter to only valid answer types
    return result.answerTypes.filter((type: unknown): type is AnswerType =>
      typeof type === 'string' && ANSWER_TYPES.includes(type as AnswerType)
    );
  } catch (error) {
    console.error('Error classifying fragment answer types:', error);
    // Return empty array rather than failing the entire processing
    return [];
  }
}

/**
 * Build the prompt for answer type classification
 */
function buildClassificationPrompt(
  fragment: { content: string; section?: string; pageNumber?: number },
  resource: Pick<Resource, 'name' | 'description' | 'resourceType'>
): string {
  const resourceType = resource.resourceType || 'rulebook';

  return `Analyze this content from a board game ${resourceType} and classify what types of questions it can answer.

Document: ${resource.name}
${resource.description ? `Description: ${resource.description}` : ''}
${fragment.section ? `Section: ${fragment.section}` : ''}
${fragment.pageNumber ? `Page: ${fragment.pageNumber}` : ''}

Content:
${fragment.content}

Available answer type categories:

**Metadata:**
- player_count: Number of players supported
- play_time: How long the game takes
- age_rating: Recommended age
- game_overview: High-level game description
- publisher_info: Publisher, designer, edition info

**Rules:**
- setup_instructions: How to set up the game
- turn_structure: How turns work
- win_conditions: How to win
- end_game: When/how the game ends
- scoring: How points are calculated

**Components:**
- component_list: What pieces are included
- card_types: Types of cards in the game
- resource_types: Types of resources/tokens
- board_layout: Board setup and areas
- token_types: Types of tokens/markers

**Gameplay:**
- action_options: Actions players can take
- combat_rules: How combat/conflict works
- movement_rules: How to move pieces
- trading_rules: How trading/exchange works
- special_abilities: Special powers or abilities

**Clarifications:**
- edge_case: Unusual situations
- example: Example of gameplay
- faq: Frequently asked question
- timing: When something happens
- rule_clarification: Clarifying a specific rule

Select 1-4 answer types that best match what questions this content can answer.
Be specific and conservative - only select types that are clearly answerable from this content.

Return ONLY a JSON object with an "answerTypes" array, nothing else.
Format: { "answerTypes": ["type1", "type2", ...] }`;
}

/**
 * Batch classify answer types for multiple fragments
 *
 * Processes fragments in parallel batches to avoid rate limiting
 */
export async function classifyFragmentsAnswerTypes(
  fragments: Array<{
    content: string;
    section?: string;
    pageNumber?: number;
  }>,
  resource: Pick<Resource, 'name' | 'description' | 'resourceType'>,
  openaiApiKey: string,
  options: ClassificationOptions & { batchSize?: number } = {}
): Promise<Array<AnswerType[]>> {
  const batchSize = options.batchSize || 5;
  const results: Array<AnswerType[]> = [];

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < fragments.length; i += batchSize) {
    const batch = fragments.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((fragment) =>
        classifyFragmentAnswerTypes(fragment, resource, openaiApiKey, options)
      )
    );

    results.push(...batchResults);

    // Small delay between batches to respect rate limits
    if (i + batchSize < fragments.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}
