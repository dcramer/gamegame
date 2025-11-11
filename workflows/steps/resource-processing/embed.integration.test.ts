/**
 * Integration test for embed workflow step
 *
 * Tests the complete embed stage with:
 * - Real PostgreSQL database operations
 * - Mocked external APIs (OpenAI only - Mistral is not called in embed stage)
 * - Actual fragment and embedding inserts
 * - Vector format validation
 *
 * This test validates the fix for the embedding vector format bug where
 * embeddings were being incorrectly JSON.stringify'd causing PostgreSQL errors.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { games, resources, fragments, embeddings, attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cleanupTestDb } from '@/tests/db-helpers';
import { createTestGame } from '@/tests/fixtures';
import { createMockFetch, openAI, routeAPICalls } from '@/tests/api-mocks';
import { runEmbedStageImpl } from '@/workflows/steps/resource-processing/embed-stage.impl';
import type { StructuredPDFContent } from '@/lib/types/pdf';
import { nanoid } from 'nanoid';

describe('Embed Stage Integration', () => {
  const mockFetch = createMockFetch();

  beforeEach(() => {
    // Route all OpenAI API calls dynamically
    routeAPICalls(mockFetch, {
      'api.openai.com/v1/embeddings': (url: string, options?: RequestInit) => {
        // Parse the request to determine how many embeddings are needed
        const body = JSON.parse(options?.body as string || '{}');
        const inputCount = Array.isArray(body.input) ? body.input.length : 1;
        // Return mock embeddings for the requested count
        return openAI.embeddings(Array(inputCount).fill('mock'), 1536);
      },
      'api.openai.com/v1/chat/completions': openAI.chatCompletion({
        questions: ['Question 1', 'Question 2'],
        answerTypes: ['gameplay'],
      }),
    });
  });

  afterEach(cleanupTestDb);

  it('should insert fragments with properly formatted embedding vectors', async () => {
    // Create test game and resource
    const game = await createTestGame({ name: 'Arcs' });

    const resourceId = nanoid();
    await db.insert(resources).values({
      id: resourceId,
      gameId: game.id,
      name: 'Test Rulebook',
      url: 'https://example.com/rulebook.pdf',
      status: 'processing',
      processingStage: 'embed',
      version: 3,
      pdfExtractor: 'mistral',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create minimal structured PDF data
    const structured: StructuredPDFContent = {
      pages: [
        {
          pageNumber: 1,
          markdown: '# Setup\n\nPlace the board in the center.',
          images: [],
          sections: [
            {
              level: 1,
              text: 'Setup',
              hierarchy: 'Setup',
              pageNumber: 1,
            },
          ],
        },
      ],
      pageCount: 1,
    };

    const input = {
      runId: nanoid(),
      resourceId,
      gameId: game.id,
      gameName: game.name,
      name: 'Test Rulebook',
      url: 'https://example.com/rulebook.pdf',
    };

    // Run the embed stage
    await runEmbedStageImpl(input, structured);

    // Verify fragments were inserted
    const insertedFragments = await db
      .select()
      .from(fragments)
      .where(eq(fragments.resourceId, resourceId));

    expect(insertedFragments.length).toBeGreaterThan(0);

    // Verify each fragment has a valid embedding vector
    for (const fragment of insertedFragments) {
      // The embedding should be a valid array (pgvector stores as array)
      expect(fragment.embedding).toBeDefined();
      expect(Array.isArray(fragment.embedding)).toBe(true);
      expect(fragment.embedding).toHaveLength(1536);

      // All values should be numbers
      fragment.embedding.forEach((val: number) => {
        expect(typeof val).toBe('number');
        expect(isNaN(val)).toBe(false);
      });
    }

    // Verify resource was updated
    const [updatedResource] = await db
      .select()
      .from(resources)
      .where(eq(resources.id, resourceId));

    expect(updatedResource.content).toBeDefined();
    expect(updatedResource.version).toBe(3);
    expect(updatedResource.pdfExtractor).toBe('mistral');
  }, 30000);

  it('should handle text fragments and image fragments separately', async () => {
    const game = await createTestGame({ name: 'Test Game' });

    const resourceId = nanoid();
    await db.insert(resources).values({
      id: resourceId,
      gameId: game.id,
      name: 'Rulebook with Images',
      url: 'https://example.com/rulebook.pdf',
      status: 'processing',
      processingStage: 'embed',
      version: 3,
      pdfExtractor: 'mistral',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Structured data with text and a good quality image
    const structured: StructuredPDFContent = {
      pages: [
        {
          pageNumber: 1,
          markdown: '# Game Board\n\n![board](img-1.png)\n\nThe board shows territory spaces.',
          images: [
            {
              id: `${resourceId}-img-1`,
              originalFilename: 'img-1.png',
              pageNumber: 1,
              base64: 'base64data...',
              bbox: [100, 100, 400, 400],
              caption: 'Game board layout',
              description: 'The main game board showing all territories',
              isGoodQuality: 'good',
              url: 'https://example.com/img-1.png',
              mimeType: 'image/png',
            },
          ],
          sections: [
            {
              level: 1,
              text: 'Game Board',
              hierarchy: 'Game Board',
              pageNumber: 1,
            },
          ],
        },
      ],
      pageCount: 1,
    };

    const input = {
      runId: nanoid(),
      resourceId,
      gameId: game.id,
      gameName: game.name,
      name: 'Rulebook with Images',
      url: 'https://example.com/rulebook.pdf',
    };

    await runEmbedStageImpl(input, structured);

    // Verify both text and image fragments
    const allFragments = await db
      .select()
      .from(fragments)
      .where(eq(fragments.resourceId, resourceId));

    expect(allFragments.length).toBeGreaterThan(0);

    const textFragments = allFragments.filter((f) => f.type === 'text');
    const imageFragments = allFragments.filter((f) => f.type === 'image');

    // Should have at least one text fragment
    expect(textFragments.length).toBeGreaterThan(0);

    // Should have one image fragment (for the good quality image)
    expect(imageFragments.length).toBe(1);

    // Image fragment should have attachment reference
    expect(imageFragments[0].attachmentId).toBeDefined();

    // Verify attachments were created
    const createdAttachments = await db
      .select()
      .from(attachments)
      .where(eq(attachments.resourceId, resourceId));

    expect(createdAttachments.length).toBe(1);
    expect(createdAttachments[0].type).toBe('image');
  }, 30000);

  it('should store embeddings in separate embeddings table', async () => {
    const game = await createTestGame({ name: 'Arcs' });

    const resourceId = nanoid();
    await db.insert(resources).values({
      id: resourceId,
      gameId: game.id,
      name: 'Test Doc',
      url: 'https://example.com/doc.pdf',
      status: 'processing',
      processingStage: 'embed',
      version: 3,
      pdfExtractor: 'mistral',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const structured: StructuredPDFContent = {
      pages: [
        {
          pageNumber: 1,
          markdown: 'Test content for embeddings',
          images: [],
          sections: [],
        },
      ],
      pageCount: 1,
    };

    const input = {
      runId: nanoid(),
      resourceId,
      gameId: game.id,
      gameName: game.name,
      name: 'Test Doc',
      url: 'https://example.com/doc.pdf',
    };

    await runEmbedStageImpl(input, structured);

    // Get fragments
    const insertedFragments = await db
      .select()
      .from(fragments)
      .where(eq(fragments.resourceId, resourceId));

    expect(insertedFragments.length).toBeGreaterThan(0);

    // Verify embeddings table has records
    const fragmentIds = insertedFragments.map((f) => f.id);
    const storedEmbeddings = await db
      .select()
      .from(embeddings)
      .where(eq(embeddings.fragmentId, fragmentIds[0]));

    // Should have at least content embedding
    expect(storedEmbeddings.length).toBeGreaterThan(0);

    // Verify embedding types
    const contentEmbedding = storedEmbeddings.find((e) => e.type === 'content');
    expect(contentEmbedding).toBeDefined();
    expect(contentEmbedding!.embedding).toBeDefined();
  }, 30000);

  it('should use Date.now() for timestamp fields (not new Date())', async () => {
    const game = await createTestGame({ name: 'Arcs' });

    const resourceId = nanoid();
    await db.insert(resources).values({
      id: resourceId,
      gameId: game.id,
      name: 'Timestamp Test',
      url: 'https://example.com/test.pdf',
      status: 'processing',
      processingStage: 'embed',
      version: 3,
      pdfExtractor: 'mistral',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const structured: StructuredPDFContent = {
      pages: [
        {
          pageNumber: 1,
          markdown: '# Test\n\nContent here',
          images: [],
          sections: [],
        },
      ],
      pageCount: 1,
    };

    const input = {
      runId: nanoid(),
      resourceId,
      gameId: game.id,
      gameName: game.name,
      name: 'Timestamp Test',
      url: 'https://example.com/test.pdf',
    };

    // This should not throw timestamp errors
    await expect(runEmbedStageImpl(input, structured)).resolves.not.toThrow();

    // Verify fragments have valid timestamps (numbers, not Date objects)
    const insertedFragments = await db
      .select()
      .from(fragments)
      .where(eq(fragments.resourceId, resourceId));

    expect(insertedFragments.length).toBeGreaterThan(0);

    for (const fragment of insertedFragments) {
      expect(typeof fragment.createdAt).toBe('number');
      expect(typeof fragment.updatedAt).toBe('number');
      expect(fragment.createdAt).toBeGreaterThan(0);
      expect(fragment.updatedAt).toBeGreaterThan(0);
    }
  }, 30000);
});
