/**
 * Integration test for the PDF processing pipeline
 * Uses mocked API responses to avoid costs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Env, QueueMessage } from '@/types';
import type { StructuredPDFContent } from '../types/pdf';
import { runEmbedStage } from './pdf-processor';

// Mock all external dependencies
vi.mock('../db', () => ({
  getDb: vi.fn(() => mockDb),
  resources: {
    id: 'id',
    name: 'name',
    originalFilename: 'originalFilename',
    description: 'description',
    resourceType: 'resourceType',
    edition: 'edition',
    processingMetadata: 'processingMetadata',
    currentJobId: 'currentJobId',
    content: 'content',
    version: 'version',
    pdfExtractor: 'pdfExtractor',
    processedAt: 'processedAt',
    processingStage: 'processingStage',
    pageCount: 'pageCount',
    imageCount: 'imageCount',
    wordCount: 'wordCount',
    updatedAt: 'updatedAt',
  },
  fragments: {
    id: 'id',
    resourceId: 'resourceId',
  },
  attachments: {
    id: 'id',
    resourceId: 'resourceId',
  },
}));

vi.mock('../ai/embeddings', () => ({
  generateEmbeddings: vi.fn(async (chunks: any[]) => {
    // Return fake embeddings with the same structure
    return [
      chunks.map(() => ({
        embedding: new Array(1536).fill(0).map(() => Math.random()),
        content: 'fake',
      })),
      3, // version
    ];
  }),
}));

vi.mock('../ai/vectorize', () => ({
  insertEmbeddings: vi.fn(async () => {}),
  deleteEmbeddings: vi.fn(async () => {}),
}));

vi.mock('../jobs/status', () => ({
  updateJob: vi.fn(async () => {}),
}));

vi.mock('../services/r2-storage', () => ({
  uploadPDFImages: vi.fn(async (bucket, resourceId, images) => {
    return images.map((img: any) => ({
      id: img.id,
      r2Key: `resources/${resourceId}/attachments/${img.id}.png`,
      mimeType: 'image/png',
      caption: img.caption,
    }));
  }),
  extractR2KeyFromUrl: vi.fn((url: string) => null),
  r2KeyToUrl: vi.fn((key: string) => `https://example.com/${key}`),
  bulkDeleteFromR2: vi.fn(async () => {}),
}));

// Mock fetch for HyDE API calls
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Storage for inserted data
let allInserts: any[] = [];

// Create a minimal mock database with proper insert tracking
const mockDb = {
  select: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  where: vi.fn(() => mockDb),
  limit: vi.fn(() => mockDb),
  all: vi.fn(async () => []),
  insert: vi.fn(() => mockDb),
  values: vi.fn((data: any) => {
    // Store all inserted values
    const values = Array.isArray(data) ? data : [data];
    allInserts.push(...values);
    return mockDb;
  }),
  delete: vi.fn(() => mockDb),
  update: vi.fn(() => mockDb),
  set: vi.fn(() => mockDb),
};

// Mock R2 bucket
const mockR2Bucket = {
  get: vi.fn(async (key: string) => {
    if (key.includes('structured.json')) {
      return {
        text: async () => JSON.stringify(mockStructuredPDF),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    return null;
  }),
  put: vi.fn(async () => {}),
  delete: vi.fn(async () => {}),
};

// Mock Vectorize index
const mockVectorizeIndex = {
  query: vi.fn(async () => ({ matches: [] })),
  insert: vi.fn(async () => {}),
  deleteByIds: vi.fn(async () => {}),
};

// Mock KV namespace
const mockKV = {
  get: vi.fn(async () => null),
  put: vi.fn(async () => {}),
};

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
 * Mock HyDE responses - what GPT-4o-mini would return
 */
const mockHydeResponses = [
  // For chunk 1 (first paragraph)
  {
    questions: [
      'How many territory cards should I place during setup?',
      'Where should the territory cards be placed?',
      'How many territory cards does each player get?',
      'What is the first step in setting up the game?',
      'How are territory cards distributed to players?',
    ],
  },
  // For chunk 2 (second paragraph)
  {
    questions: [
      'When do players choose starting positions?',
      'What happens after taking territory cards?',
      'How do players select their starting positions?',
    ],
  },
];

describe('PDF Processor Integration', () => {
  let mockEnv: Env;
  let mockTask: QueueMessage;

  beforeEach(() => {
    vi.clearAllMocks();

    // Clear inserted data
    allInserts = [];

    // Setup mock environment
    mockEnv = {
      DB: {} as any,
      FILES: mockR2Bucket as any,
      VECTORIZE: mockVectorizeIndex as any,
      JOB_STATUS_KV: mockKV as any,
      OPENAI_API_KEY: 'test-openai-key',
      MISTRAL_API_KEY: 'test-mistral-key',
      RESOURCE_QUEUE: {} as any,
    };

    // Setup mock task
    mockTask = {
      type: 'EMBED',
      jobId: 'test-job-123',
      resourceId: 'test-resource',
      gameId: 'test-game',
      name: 'Test Rulebook',
      gameName: 'Test Game',
    };

    // Mock database responses
    mockDb.all.mockResolvedValue([]);
    mockDb.limit.mockImplementation(function (this: any) {
      // For the metadata query
      return Promise.resolve([
        {
          metadata: JSON.stringify({
            structuredKey: 'resources/test-resource/structured.json',
            stages: {
              ingest: true,
              vision: true,
              cleanup: true,
              metadata: true,
              embed: false,
            },
          }),
          currentJobId: 'test-job-123',
          name: 'Test Rulebook',
          originalFilename: 'test.pdf',
          description: 'A test rulebook for integration testing',
          resourceType: 'rulebook',
          edition: '1.0',
        },
      ]);
    });

    // Mock HyDE fetch responses
    let hydeCallCount = 0;
    mockFetch.mockImplementation(async (url: string, options: any) => {
      if (url.includes('openai.com/v1/chat/completions')) {
        const body = JSON.parse(options.body);

        // Check if this is a HyDE request (no image in content)
        const isHydeRequest =
          body.messages[0].content &&
          typeof body.messages[0].content === 'string' &&
          body.messages[0].content.includes('generate') &&
          body.messages[0].content.includes('questions');

        if (isHydeRequest) {
          const response = mockHydeResponses[hydeCallCount % mockHydeResponses.length];
          hydeCallCount++;

          return {
            ok: true,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify(response),
                  },
                },
              ],
            }),
          };
        }
      }

      return { ok: false, status: 404, text: async () => 'Not found' };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should process a minimal PDF and create text + image fragments', async () => {
    const result = await runEmbedStage(mockTask, mockEnv);

    // Should return FINALIZE task
    expect(result).toEqual({ ...mockTask, type: 'FINALIZE' });

    // Should have inserted data
    expect(allInserts.length).toBeGreaterThan(0);

    // Filter fragments (have 'searchableContent' field) from attachments (have 'r2Key' field)
    const insertedFragments = allInserts.filter((i: any) => 'searchableContent' in i);
    const insertedAttachments = allInserts.filter((i: any) => 'r2Key' in i);

    // Should have inserted attachments (1 image)
    expect(insertedAttachments.length).toBe(1);

    // Should have inserted fragments
    expect(insertedFragments.length).toBeGreaterThan(0);

    // Should have both text and image fragments
    const textFragments = insertedFragments.filter((f: any) => f?.type === 'text');
    const imageFragments = insertedFragments.filter((f: any) => f?.type === 'image');

    expect(textFragments.length).toBeGreaterThan(0);
    expect(imageFragments.length).toBe(1); // 1 good quality image

    // Verify text fragment structure
    const sampleTextFragment = textFragments[0];
    expect(sampleTextFragment).toMatchObject({
      type: 'text',
      gameId: 'test-game',
      resourceId: 'test-resource',
      attachmentId: null,
      version: 3,
      resourceName: 'Test Rulebook',
      resourceDescription: 'A test rulebook for integration testing',
      resourceType: 'rulebook',
    });

    // Should have content (clean, for display)
    expect(sampleTextFragment.content).toBeTruthy();
    expect(sampleTextFragment.content.length).toBeGreaterThan(0);

    // Should have searchableContent (enriched, for embeddings)
    expect(sampleTextFragment.searchableContent).toBeTruthy();
    expect(sampleTextFragment.searchableContent).toContain('--- DOCUMENT CONTEXT ---');
    expect(sampleTextFragment.searchableContent).toContain('Title: Test Rulebook');
    expect(sampleTextFragment.searchableContent).toContain('Type: rulebook');
    expect(sampleTextFragment.searchableContent).toContain('--- CONTENT ---');

    // Should have synthetic questions (HyDE)
    expect(sampleTextFragment.syntheticQuestions).toBeTruthy();
    const questions = JSON.parse(sampleTextFragment.syntheticQuestions);
    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(5);

    // Verify image fragment structure
    const imageFragment = imageFragments[0];
    expect(imageFragment).toMatchObject({
      type: 'image',
      gameId: 'test-game',
      resourceId: 'test-resource',
      version: 3,
      pageNumber: 1,
      attachmentId: 'test-resource-img-0',
    });

    // Image fragment should have searchable content with image context
    expect(imageFragment.searchableContent).toContain('--- DOCUMENT CONTEXT ---');
    expect(imageFragment.searchableContent).toContain('--- IMAGE CONTEXT ---');
    expect(imageFragment.searchableContent).toContain('--- DESCRIPTION ---');
    expect(imageFragment.searchableContent).toContain('Diagram showing 5 territory cards');

    // Should have called embeddings API
    const { generateEmbeddings } = await import('../ai/embeddings');
    expect(generateEmbeddings).toHaveBeenCalledOnce();

    // Should have inserted embeddings to Vectorize
    const { insertEmbeddings } = await import('../ai/vectorize');
    expect(insertEmbeddings).toHaveBeenCalledOnce();

    const vectorizeCall = (insertEmbeddings as any).mock.calls[0];
    const vectorInserts = vectorizeCall[1];

    // Should have embeddings for:
    // - Text fragment content (1)
    // - Text fragment questions (5 questions per text fragment)
    // - Image fragment content (1, no questions for images)
    const expectedEmbeddings = textFragments.length + (textFragments.length * 5) + imageFragments.length;
    expect(vectorInserts.length).toBe(expectedEmbeddings);

    // Verify vector metadata - find content vectors (not question vectors)
    const textContentVector = vectorInserts.find((v: any) => v.metadata.type === 'content' && v.metadata.fragmentType === 'text');
    const imageContentVector = vectorInserts.find((v: any) => v.metadata.type === 'content' && v.metadata.fragmentType === 'image');
    const questionVectors = vectorInserts.filter((v: any) => v.metadata.type === 'question');

    expect(textContentVector).toBeTruthy();
    expect(imageContentVector).toBeTruthy();
    expect(questionVectors.length).toBe(textFragments.length * 5); // 5 questions per text fragment

    expect(textContentVector.metadata).toMatchObject({
      gameId: 'test-game',
      resourceId: 'test-resource',
      type: 'content',
      fragmentType: 'text',
    });

    expect(imageContentVector.metadata).toMatchObject({
      gameId: 'test-game',
      resourceId: 'test-resource',
      type: 'content',
      fragmentType: 'image',
      pageNumber: 1,
    });

    // Verify question vector metadata
    const firstQuestionVector = questionVectors[0];
    expect(firstQuestionVector.metadata).toMatchObject({
      gameId: 'test-game',
      resourceId: 'test-resource',
      type: 'question',
      questionIndex: 0,
    });
    expect(firstQuestionVector.metadata.questionText).toBeTruthy();
    expect(typeof firstQuestionVector.metadata.questionText).toBe('string');

    // Should have updated resource record
    const updateCalls = mockDb.update.mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);

    // Should have updated job status
    const { updateJob } = await import('../jobs/status');
    expect(updateJob).toHaveBeenCalled();

    const jobUpdateCalls = (updateJob as any).mock.calls;
    // updateJob is called with (kv, jobId, updates) so updates are at index 2
    const statusUpdates = jobUpdateCalls.map((call: any) => call[2]?.currentStep).filter(Boolean);

    expect(statusUpdates).toContain('Generating search questions');
    expect(statusUpdates.some((step: string) => step?.includes('Generating embeddings'))).toBe(
      true
    );
    expect(statusUpdates.some((step: string) => step?.includes('Storing'))).toBe(true);
  });

  it('should handle HyDE API failures gracefully', async () => {
    // Make HyDE fail
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await runEmbedStage(mockTask, mockEnv);

    // Should still complete (HyDE errors return empty arrays)
    expect(result).toEqual({ ...mockTask, type: 'FINALIZE' });

    // Should still create fragments, just without synthetic questions
    const insertedFragments = allInserts.filter((i: any) => 'searchableContent' in i);
    const textFragments = insertedFragments.filter((f: any) => f?.type === 'text');

    expect(textFragments.length).toBeGreaterThan(0);

    // Synthetic questions should be null (empty array returns null)
    const sampleFragment = textFragments[0];
    expect(sampleFragment.syntheticQuestions).toBe(null);
  });

  it('should only create image fragments for good quality images', async () => {
    // Modify the structured PDF to have a bad quality image
    const structuredWithBadImage: StructuredPDFContent = {
      ...mockStructuredPDF,
      pages: [
        {
          ...mockStructuredPDF.pages[0],
          images: [
            ...mockStructuredPDF.pages[0].images,
            {
              id: 'test-resource-img-bad',
              pageNumber: 1,
              originalFilename: 'img-bad.png',
              base64: 'fake-base64-data',
              description: 'Blurry image',
              isGoodQuality: 'bad', // BAD quality
              url: 'https://example.com/bad.png',
            },
          ],
        },
      ],
    };

    mockR2Bucket.get.mockResolvedValue({
      text: async () => JSON.stringify(structuredWithBadImage),
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    await runEmbedStage(mockTask, mockEnv);

    const insertedFragments = allInserts.filter((i: any) => 'searchableContent' in i);
    const imageFragments = insertedFragments.filter((f: any) => f?.type === 'image');

    // Should only have 1 image fragment (the good one)
    expect(imageFragments.length).toBe(1);
    expect(imageFragments[0].attachmentId).toBe('test-resource-img-0');
  });

  it('should include resource metadata in searchable content', async () => {
    await runEmbedStage(mockTask, mockEnv);

    const insertedFragments = allInserts.filter((i: any) => 'searchableContent' in i);
    expect(insertedFragments.length).toBeGreaterThan(0);
    const sampleFragment = insertedFragments[0];

    // Check searchable content includes all metadata sections
    expect(sampleFragment.searchableContent).toBeTruthy();
    expect(sampleFragment.searchableContent).toContain('Title: Test Rulebook');
    expect(sampleFragment.searchableContent).toContain('Filename: test.pdf');
    expect(sampleFragment.searchableContent).toContain(
      'Description: A test rulebook for integration testing'
    );
    expect(sampleFragment.searchableContent).toContain('Type: rulebook');
    expect(sampleFragment.searchableContent).toContain('Edition: 1.0');
  });
});
