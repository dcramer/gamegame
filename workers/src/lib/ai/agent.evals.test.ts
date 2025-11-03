import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { setupTestDb, cleanupTestDb, createTestGame, createTestResource } from '@/test-utils/setup';
import { parseSSEResponse } from '@/test-utils/sse-parser';
import { judgeAnswer } from '@/test-utils/llm-judge';
import { smokeTestCases, type EvalCase } from '@/test-utils/eval-cases';
import { getDb, resources } from '@/lib/db';
import { eq } from 'drizzle-orm';
import type { Env, QueueMessage } from '@/types';
import type { StructuredPDFContent } from '../types/pdf';
import { runEmbedStage } from '@/lib/processing/pdf-processor';
import { createMockFetch, openAI, routeAPICalls } from '@/test-utils/api-mocks';

// Mock external APIs only
vi.mock('../ai/embeddings', () => ({
  generateEmbeddings: vi.fn(async (chunks: any[]) => {
    return [
      chunks.map(() => ({
        embedding: new Array(1536).fill(0).map(() => Math.random()),
        content: 'fake',
      })),
      3,
    ];
  }),
}));

// Save original fetch before any mocking
const originalFetch = globalThis.fetch;
const mockFetch = createMockFetch();

/**
 * Mock structured PDF content for eval tests
 * Simulates what Mistral OCR would return
 */
const mockStructuredPDF: StructuredPDFContent = {
  pageCount: 3,
  pages: [
    {
      pageNumber: 1,
      markdown: `# Overview

This game supports 2-4 players. A typical game takes about 60-90 minutes to complete.`,
      sections: [
        {
          level: 1,
          text: 'Overview',
          hierarchy: 'Overview',
          pageNumber: 1,
        },
      ],
      images: [],
    },
    {
      pageNumber: 2,
      markdown: `# Setup

Place the game board in the center. Each player takes a player board and 5 starting cards. Shuffle the deck and place it face-down.`,
      sections: [
        {
          level: 1,
          text: 'Setup',
          hierarchy: 'Setup',
          pageNumber: 2,
        },
      ],
      images: [],
    },
    {
      pageNumber: 3,
      markdown: `# Gameplay

## Card Management

When you run out of cards, immediately draw 5 new cards from the deck. If the deck is empty, shuffle the discard pile to form a new deck.`,
      sections: [
        {
          level: 1,
          text: 'Gameplay',
          hierarchy: 'Gameplay',
          pageNumber: 3,
        },
        {
          level: 2,
          text: 'Card Management',
          hierarchy: 'Gameplay > Card Management',
          pageNumber: 3,
        },
      ],
      images: [],
    },
  ],
};

const mockHydeResponses = [
  { questions: ['How many players can play?', 'How long does a game take?'] },
  { questions: ['How do I setup the game?', 'What do players start with?'] },
  { questions: ['What happens when I run out of cards?', 'How do I draw cards?'] },
];

describe('Agent Performance Evals', () => {
  let testGameId: string;
  let testGameSlug: string;
  let resourceId: string;

  beforeAll(async () => {
    await setupTestDb();

    // Create test game and resource
    const game = await createTestGame({
      name: 'Test Board Game',
      slug: 'test-game',
    });
    testGameId = game.id;
    testGameSlug = game.slug!;

    const resource = await createTestResource(testGameId, {
      name: 'Test Rulebook',
      originalFilename: 'test.pdf',
    });
    resourceId = resource.id;

    // Store structured PDF in R2
    const structuredKey = `resources/${resourceId}/structured.json`;
    await env.FILES.put(structuredKey, JSON.stringify(mockStructuredPDF));

    // Create job in KV
    await env.JOB_STATUS_KV.put(
      `job:test-job-evals`,
      JSON.stringify({
        jobId: 'test-job-evals',
        resourceId: resource.id,
        gameId: testGameId,
        status: 'processing',
        currentStep: 'Embedding content',
        progress: 80,
        createdAt: Date.now(),
        startedAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    // Update resource metadata
    const db = getDb(env.DB);
    await db
      .update(resources)
      .set({
        processingMetadata: JSON.stringify({
          structuredKey,
          stages: {
            ingest: true,
            vision: true,
            cleanup: true,
            metadata: true,
            embed: false,
          },
        }),
        currentJobId: 'test-job-evals',
      })
      .where(eq(resources.id, resourceId));

    // Setup API routing ONLY for processing pipeline
    // Agent and judge will use REAL OpenAI API calls
    // IMPORTANT: Do this AFTER resource setup, BEFORE processing
    vi.clearAllMocks();

    // Track which calls are during processing vs during eval
    let processingComplete = false;
    let hydeCallCount = 0;

    routeAPICalls(mockFetch, {
      // HyDE question generation during processing ONLY
      'api.openai.com/v1/chat/completions': (url: string, options?: any) => {
        if (processingComplete) {
          // After processing, let real API calls through
          return originalFetch(url, options);
        }

        // During processing: mock HyDE calls
        const response = mockHydeResponses[hydeCallCount % mockHydeResponses.length];
        hydeCallCount++;
        return openAI.chatCompletion(response);
      },

      // Let agent calls through to real OpenAI
      'api.openai.com/v1/responses': (url: string, options?: any) => {
        // Always use real API for agent and judge
        return originalFetch(url, options);
      },

      // Mock embeddings ONLY during processing
      'api.openai.com/v1/embeddings': (url: string, options?: any) => {
        if (processingComplete) {
          // After processing, let real API calls through (agent search)
          return originalFetch(url, options);
        }

        // During processing: mock embeddings
        return openAI.embeddings(['test']);
      },
    });

    // Run the REAL processing pipeline to properly index fragments
    const testEnv: Env = {
      DB: env.DB,
      VECTORIZE: env.VECTORIZE,
      FILES: env.FILES,
      JOB_STATUS_KV: env.JOB_STATUS_KV,
      RATE_LIMIT_KV: env.RATE_LIMIT_KV,
      OPENAI_API_KEY: env.OPENAI_API_KEY || 'test-key',
      MISTRAL_API_KEY: 'test-key',
      JWT_SECRET: 'test-secret',
    };

    const testTask: QueueMessage = {
      jobId: 'test-job-evals',
      resourceId: resource.id,
      gameId: testGameId,
      name: 'Test Rulebook',
      type: 'EMBED',
      gameName: 'Test Board Game',
    };

    await runEmbedStage(testTask, testEnv);

    // Mark processing complete - subsequent API calls will use real OpenAI
    processingComplete = true;

    console.log(`\nTest game created: ${testGameSlug} (${testGameId})`);
    console.log(`Resource processed: ${resourceId}\n`);
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  // Use smoke test cases for now (faster, fewer)
  const evalCases: EvalCase[] = smokeTestCases;

  evalCases.forEach((testCase, idx) => {
    it(
      `Eval ${idx + 1}: ${testCase.question}`,
      async () => {
        const startTime = Date.now();

        // Call the chat endpoint
        const response = await SELF.fetch(`http://localhost/api/games/${testGameSlug}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                parts: [
                  {
                    type: 'text',
                    text: testCase.question,
                  },
                ],
                id: `eval-${idx}-${Date.now()}`,
              },
            ],
          }),
        });

        // Parse SSE response
        const { answer, performance, structured } = await parseSSEResponse(response);

        // 1. JUDGE ANSWER QUALITY (uses real OpenAI API)
        const judgment = await judgeAnswer({
          question: testCase.question,
          answer,
          criteria: testCase.criteria,
          apiKey: env.OPENAI_API_KEY,
        });

        // 2. REPORT METRICS (for trend tracking) - print BEFORE assertions so we see it on failure
        const report = {
          evalId: idx + 1,
          question: testCase.question,
          judgment: {
            pass: judgment.pass,
            score: judgment.score,
            reasoning: judgment.reasoning,
            missing: judgment.missing,
            incorrect: judgment.incorrect,
          },
          performance: {
            tokens: {
              total: performance.totalTokens.total,
              prompt: performance.totalTokens.prompt,
              completion: performance.totalTokens.completion,
              reasoning: performance.totalTokens.reasoning,
            },
            durationMs: performance.totalDurationMs,
            steps: performance.steps.length,
            toolCalls: performance.toolCallCount,
            avgToolDurationMs: performance.avgToolDurationMs,
          },
          structured: {
            confidence: structured?.confidence,
            citationCount: structured?.citations?.length ?? 0,
            followUpCount: structured?.followUps?.length ?? 0,
          },
        };

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📊 EVAL REPORT #${report.evalId}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(JSON.stringify(report, null, 2));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // 3. ASSERT PERFORMANCE BUDGETS
        expect(performance.totalTokens.total).toBeLessThanOrEqual(testCase.budget.maxTokens);
        expect(performance.totalDurationMs).toBeLessThanOrEqual(testCase.budget.maxDurationMs);

        if (testCase.budget.maxToolCalls !== undefined) {
          expect(performance.toolCallCount).toBeLessThanOrEqual(testCase.budget.maxToolCalls);
        }

        // 4. ASSERT ACCURACY
        expect(judgment.pass).toBe(true);
        expect(judgment.score).toBeGreaterThanOrEqual(80); // 80+ = passing

        // Fail with helpful context if judgment failed
        if (!judgment.pass) {
          const errorMessage = [
            `Answer failed evaluation:`,
            `Score: ${judgment.score}/100`,
            `Reasoning: ${judgment.reasoning}`,
            judgment.missing?.length ? `Missing: ${judgment.missing.join(', ')}` : '',
            judgment.incorrect?.length ? `Incorrect: ${judgment.incorrect.join(', ')}` : '',
            '',
            `Answer received:`,
            answer,
          ]
            .filter(Boolean)
            .join('\n');

          throw new Error(errorMessage);
        }
      },
      60000
    ); // 60s timeout for LLM judge + agent execution
  });
});
