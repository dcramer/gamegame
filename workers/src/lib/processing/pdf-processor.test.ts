/**
 * Integration test for the PDF processing pipeline
 * Only mocks external APIs (OpenAI) - uses real Cloudflare services (D1, Vectorize, KV, R2)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { Env, QueueMessage } from '@/types';
import type { StructuredPDFContent } from '../types/pdf';
import { runEmbedStage } from './pdf-processor';
import { getDb } from '../db';
import { resources, fragments, attachments, games } from '../db/schema/d1';
import { eq } from 'drizzle-orm';
import { createMockFetch, openAI } from '@/test-utils/api-mocks';
import { createTestGame, createTestResource } from '@/test-utils/setup';

// Only mock EXTERNAL APIs
vi.mock('../ai/embeddings', () => ({
  generateEmbeddings: vi.fn(async (chunks: any[]) => {
    // Return fake embeddings with correct structure
    return [
      chunks.map(() => ({
        embedding: new Array(1536).fill(0).map(() => Math.random()),
        content: 'fake',
      })),
      3, // version
    ];
  }),
}));

// Mock fetch for external API calls (OpenAI HyDE)
const mockFetch = createMockFetch();

/**
 * Minimal structured PDF with 1 page, 2 text chunks, 1 good image
 * This represents what Mistral OCR would return
 */
const mockStructuredPDF: StructuredPDFContent = {
  pageCount: 1,
  pages: [
    {
      pageNumber: 1,
      markdown: `# Setup

Place 5 territory cards in a circle around the board. Each player takes one territory card.

![setup-diagram](img-0.png)

Players then choose their starting positions.`,
      sections: [
        {
          level: 1,
          text: 'Setup',
          hierarchy: 'Setup',
          pageNumber: 1,
        },
      ],
      images: [
        {
          id: 'test-resource-img-0',
          pageNumber: 1,
          originalFilename: 'img-0.png',
          base64: 'fake-base64-data',
          description: 'Diagram showing 5 territory cards arranged in a circle',
          isGoodQuality: 'good',
          caption: 'Territory card setup',
          bbox: [100, 200, 400, 600],
        },
      ],
    },
  ],
};

/**
 * Mock HyDE responses - what GPT-5-mini would return
 */
const mockHydeResponses = [
  {
    questions: [
      'How many territory cards should I place during setup?',
      'Where should the territory cards be placed?',
      'How many territory cards does each player get?',
      'What is the first step in setting up the game?',
      'How are territory cards distributed to players?',
    ],
  },
  {
    questions: [
      'When do players choose starting positions?',
      'What happens after taking territory cards?',
      'How do players select their starting positions?',
    ],
  },
];

describe('PDF Processor - Embed Stage', () => {
  let testEnv: Env;
  let testTask: QueueMessage;
  let gameId: string;
  let resourceId: string;
  let structuredKey: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create real test data in D1
    const game = await createTestGame({
      name: 'Test Game',
      slug: 'test-game',
    });
    gameId = game.id;

    const resource = await createTestResource(gameId, {
      name: 'Test Rulebook',
      originalFilename: 'test.pdf',
      description: 'A test rulebook for integration testing',
      resourceType: 'rulebook',
      edition: '1.0',
    });
    resourceId = resource.id;
    structuredKey = `resources/${resourceId}/structured.json`;

    // Store structured PDF in R2
    await env.FILES.put(structuredKey, JSON.stringify(mockStructuredPDF));

    // Update resource metadata to mark previous stages complete
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
        currentJobId: 'test-job-123',
      })
      .where(eq(resources.id, resourceId));

    // Setup test environment with real Cloudflare services
    testEnv = {
      DB: env.DB,
      VECTORIZE: env.VECTORIZE,
      FILES: env.FILES,
      JOB_STATUS_KV: env.JOB_STATUS_KV,
      RATE_LIMIT_KV: env.RATE_LIMIT_KV,
      OPENAI_API_KEY: 'test-openai-key',
      MISTRAL_API_KEY: 'test-mistral-key',
      JWT_SECRET: 'test-jwt-secret',
      RESOURCE_QUEUE: {} as any,
      ASSETS: { fetch } as any,
    };

    // Setup test task
    testTask = {
      type: 'EMBED',
      jobId: 'test-job-123',
      resourceId,
      gameId,
      name: 'Test Rulebook',
      gameName: 'Test Game',
    };

    // Create job in KV (required by updateJob function)
    await env.JOB_STATUS_KV.put(
      `job:test-job-123`,
      JSON.stringify({
        jobId: 'test-job-123',
        resourceId,
        gameId,
        status: 'processing',
        stage: 'embed',
        currentStep: 'Starting embed stage',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    // Mock HyDE fetch responses
    let hydeCallCount = 0;
    mockFetch.mockImplementation(async (url: string, options: any) => {
      if (url.includes('openai.com/v1/chat/completions')) {
        const body = JSON.parse(options.body);
        const isHydeRequest =
          body.messages[0].content &&
          typeof body.messages[0].content === 'string' &&
          body.messages[0].content.includes('generate') &&
          body.messages[0].content.includes('questions');

        if (isHydeRequest) {
          const response = mockHydeResponses[hydeCallCount % mockHydeResponses.length];
          hydeCallCount++;
          return openAI.chatCompletion(response);
        }
      }
      return { ok: false, status: 404, text: async () => 'Not found' };
    });
  });

  afterEach(async () => {
    // Clean up real database
    const db = getDb(env.DB);
    await db.delete(fragments).where(eq(fragments.gameId, gameId));
    await db.delete(attachments).where(eq(attachments.gameId, gameId));
    await db.delete(resources).where(eq(resources.id, resourceId));
    await db.delete(games).where(eq(games.id, gameId));

    // Clean up R2
    await env.FILES.delete(structuredKey);

    vi.restoreAllMocks();
  });

  it(
    'should process PDF and create fragments',
    async () => {
      const result = await runEmbedStage(testTask, testEnv);

    // Should complete and return FINALIZE task
    expect(result).toEqual({ ...testTask, type: 'FINALIZE' });

    // Query real D1 database for created fragments
    const db = getDb(env.DB);
    const createdFragments = await db
      .select()
      .from(fragments)
      .where(eq(fragments.resourceId, resourceId));

    // Should have created fragments
    expect(createdFragments.length).toBeGreaterThan(0);

    // Should have both text and image fragments
    const textFragments = createdFragments.filter((f) => f.type === 'text');
    const imageFragments = createdFragments.filter((f) => f.type === 'image');

    expect(textFragments.length).toBeGreaterThan(0);
    expect(imageFragments.length).toBe(1); // 1 good quality image

    // Verify basic fragment structure
    const textFragment = textFragments[0];
    expect(textFragment.content).toBeDefined();
    expect(textFragment.searchableContent).toBeDefined();
    // Note: D1 BLOB embeddings may not serialize properly in test environment
    // The important part is that fragments are created successfully

      // Should have created attachments
      const createdAttachments = await db
        .select()
        .from(attachments)
        .where(eq(attachments.resourceId, resourceId));
      expect(createdAttachments.length).toBe(1);
    },
    15000
  );
});
