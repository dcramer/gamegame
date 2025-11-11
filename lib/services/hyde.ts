/**
 * HyDE: Hypothetical Document Embeddings
 *
 * This module generates synthetic questions that a text fragment could answer.
 * These questions are embedded alongside the fragment content, improving query matching.
 *
 * The intuition: User queries ARE questions. By embedding questions similar to what
 * users might ask, we improve semantic search matching significantly.
 */

import type { Resource } from '../db/schema';
import { getModel } from '../config/models';

export interface QuestionGenerationOptions {
  /** Number of questions to generate (default: 3-5) */
  count?: number;
  /** Model to use (default: from environment config) */
  model?: string;
  /** Environment to determine model selection (development/production) */
  environment?: string;
}

const DEFAULT_OPTIONS: QuestionGenerationOptions = {
  count: 5,
  // model determined at runtime from environment
};

/**
 * Generate questions that a fragment could answer
 *
 * Uses configured LLM (GPT-5 in prod, GPT-5-mini in dev) to generate
 * natural language questions that players might ask, which this fragment
 * content can answer.
 */
export async function generateQuestionsForFragment(
  fragment: {
    content: string;
    section?: string | null;
    pageNumber?: number | null;
  },
  resource: Pick<Resource, 'name' | 'description' | 'resourceType'>,
  openaiApiKey: string,
  options: QuestionGenerationOptions = {}
): Promise<string[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Get model from config if not explicitly provided
  const model = opts.model || getModel('hyde', opts.environment);

  const prompt = buildQuestionGenerationPrompt(fragment, resource, opts.count!);

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
        temperature: 1,
        max_completion_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content?: unknown; parsed?: unknown } }>;
    };

    const choice = data.choices[0];
    const parsedPayload = choice?.message?.parsed as { questions?: unknown } | undefined;

    if (parsedPayload && Array.isArray(parsedPayload.questions)) {
      return parsedPayload.questions.filter(
        (q): q is string => typeof q === 'string' && q.trim().length > 0
      );
    }

    const content = extractMessageContent(choice?.message?.content);

    if (!content) {
      console.error('Error generating questions: Empty response from OpenAI', {
        fragment: {
          section: fragment.section,
          pageNumber: fragment.pageNumber,
          contentLength: fragment.content.length,
        },
        response: data,
      });
      return [];
    }

    let result: any;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error('Error generating questions: Invalid JSON payload', {
        fragment: {
          section: fragment.section,
          pageNumber: fragment.pageNumber,
          contentLength: fragment.content.length,
        },
        content,
        parseError,
      });
      return [];
    }

    // Validate and return questions
    if (!Array.isArray(result.questions)) {
      console.error('Error generating questions: Invalid response format', {
        fragment: {
          section: fragment.section,
          pageNumber: fragment.pageNumber,
          contentLength: fragment.content.length,
        },
        result,
      });
      return [];
    }

    return result.questions.filter(
      (q: unknown): q is string => typeof q === 'string' && q.trim().length > 0
    );
  } catch (error) {
    console.error('Error generating questions:', error, {
      fragment: {
        section: fragment.section,
        pageNumber: fragment.pageNumber,
        contentLength: fragment.content.length,
      },
    });
    // Return empty array rather than failing the entire processing
    return [];
  }
}

/**
 * Build the prompt for question generation
 */
function buildQuestionGenerationPrompt(
  fragment: { content: string; section?: string | null; pageNumber?: number | null },
  resource: Pick<Resource, 'name' | 'description' | 'resourceType'>,
  questionCount: number
): string {
  const resourceType = resource.resourceType || 'rulebook';

  return `Given this content from a board game ${resourceType}, generate ${questionCount} specific questions that this content directly answers.

Document: ${resource.name}
${resource.description ? `Description: ${resource.description}` : ''}
${fragment.section ? `Section: ${fragment.section}` : ''}
${fragment.pageNumber ? `Page: ${fragment.pageNumber}` : ''}

Content:
${fragment.content}

Generate questions that:
- Are specific and answerable from this content alone
- Use natural language (how players would actually ask)
- Cover different aspects or details mentioned in the content
- Include relevant game-specific terms and mechanics
- Are not overly broad or generic
- Focus on gameplay, rules, setup, or components

Examples of GOOD questions:
- "How many territory cards do I place during setup?"
- "What happens when a player runs out of action tokens?"
- "Can I move through enemy-occupied spaces?"

Examples of BAD questions:
- "How do I play this game?" (too broad)
- "What is this?" (too vague)
- "Is this fun?" (subjective, not rules-based)

Return ONLY a JSON object with a "questions" array, nothing else.
Format: { "questions": ["question 1", "question 2", ...] }`;
}

/**
 * Batch generate questions for multiple fragments
 *
 * Processes fragments in parallel batches to avoid rate limiting
 */
export async function generateQuestionsForFragments(
  fragments: Array<{
    content: string;
    section?: string | null;
    pageNumber?: number | null;
  }>,
  resource: Pick<Resource, 'name' | 'description' | 'resourceType'>,
  openaiApiKey: string,
  options: QuestionGenerationOptions & { batchSize?: number } = {}
): Promise<Array<string[]>> {
  const batchSize = options.batchSize || 5;
  const results: Array<string[]> = [];

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < fragments.length; i += batchSize) {
    const batch = fragments.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map((fragment) =>
        generateQuestionsForFragment(fragment, resource, openaiApiKey, options)
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

/**
 * Extract text content from ChatCompletion message payloads. Supports both
 * legacy string responses and the newer multi-part array format
 * ({ type: 'output_text', text: '...' }).
 */
function extractMessageContent(content: unknown): string | null {
  if (!content) {
    return null;
  }

  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object') {
          if (typeof (part as any).text === 'string') {
            return (part as any).text;
          }
          if (typeof (part as any).content === 'string') {
            return (part as any).content;
          }
        }
        return null;
      })
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);

    if (parts.length > 0) {
      return parts.join('\n').trim();
    }
  }

  return null;
}
