import type { EvalCriteria } from './llm-judge';

export interface EvalCase {
  /** The question to ask the agent */
  question: string;
  /** Evaluation criteria for judging the answer */
  criteria: EvalCriteria;
  /** Performance budgets */
  budget: {
    maxTokens: number;
    maxDurationMs: number;
    maxToolCalls?: number;
  };
}

/**
 * Standard eval test cases for agent performance testing
 *
 * These cover common question patterns:
 * - Simple factual questions (player count, game length)
 * - Setup instructions
 * - Rule clarifications
 * - Complex multi-step queries
 */
export const standardEvalCases: EvalCase[] = [
  {
    question: 'How many players can play this game?',
    criteria: {
      accuracy: 'Must state the correct player count from the rulebook',
      completeness: 'Should be concise - just the player count range',
      mustInclude: ['player'],
    },
    budget: {
      maxTokens: 500,
      maxDurationMs: 5000,
      maxToolCalls: 2,
    },
  },
  {
    question: 'How long does a typical game take?',
    criteria: {
      accuracy: 'Must provide the correct playtime from the rulebook',
      completeness: 'Should mention playtime and optionally note variance by player count',
      mustInclude: ['minutes', 'time'],
    },
    budget: {
      maxTokens: 600,
      maxDurationMs: 5000,
      maxToolCalls: 2,
    },
  },
  {
    question: 'How do I setup the game?',
    criteria: {
      accuracy: 'Must provide accurate setup steps from the rulebook',
      completeness: 'Should include all major setup steps in correct order',
      mustInclude: ['setup'],
      tone: 'Clear and instructional',
    },
    budget: {
      maxTokens: 2000,
      maxDurationMs: 8000,
      maxToolCalls: 3,
    },
  },
  {
    question: 'What happens when I run out of cards?',
    criteria: {
      accuracy: 'Must correctly explain the rule from the rulebook',
      completeness: 'Should cover all relevant scenarios and consequences',
      mustNotInclude: ['I don\'t know', 'cannot find'],
    },
    budget: {
      maxTokens: 1500,
      maxDurationMs: 8000,
      maxToolCalls: 3,
    },
  },
  {
    question: 'Can you show me what the game board looks like?',
    criteria: {
      accuracy: 'Must attempt to find and reference visual aids from the rulebook',
      completeness: 'Should either provide image references or explain that images are available',
      mustInclude: ['board', 'image', 'diagram', 'visual', 'photo'].some(word => true)
        ? [] // At least one of these words
        : ['board'],
      tone: 'Helpful and descriptive',
    },
    budget: {
      maxTokens: 1000,
      maxDurationMs: 8000,
      maxToolCalls: 3,
    },
  },
];

/**
 * Quick smoke test cases for fast validation
 * These are minimal questions to verify the agent is working
 */
export const smokeTestCases: EvalCase[] = [
  {
    question: 'How many players?',
    criteria: {
      accuracy: 'Must state correct player count',
      completeness: 'Can be brief',
    },
    budget: {
      maxTokens: 400,
      maxDurationMs: 5000,
    },
  },
  {
    question: 'What are the rules?',
    criteria: {
      accuracy: 'Must provide relevant rules information',
      completeness: 'Should give a high-level overview or direct to specific sections',
    },
    budget: {
      maxTokens: 1500,
      maxDurationMs: 8000,
    },
  },
];
