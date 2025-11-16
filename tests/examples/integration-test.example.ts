/**
 * Integration Test Example
 *
 * Demonstrates testing workflows that involve real database operations
 * and mocked external API calls.
 *
 * Key principles:
 * - Use real PostgreSQL database
 * - Mock external APIs (OpenAI, Mistral, BGG)
 * - Clean database after each test
 * - Test behavior, not implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@/lib/db';
import { games, resources, fragments, attachments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cleanupTestDb } from '@/tests/db-helpers';
import { createTestGame, createTestResource, createTestGameWithResource } from '@/tests/fixtures';
import { createMockFetch, openAI, mistral, routeAPICalls } from '@/tests/api-mocks';

/**
 * Example 1: Testing database operations
 *
 * This example shows testing CRUD operations with real database.
 * No external API calls needed.
 */
describe('Game operations', () => {
  afterEach(cleanupTestDb);

  it('should create a game', async () => {
    const game = await createTestGame({
      name: 'Arcs',
      slug: 'arcs-2024',
      year: 2024,
    });

    expect(game.id).toBeDefined();
    expect(game.name).toBe('Arcs');
    expect(game.slug).toBe('arcs-2024');

    // Verify it's in the database
    const result = await db.select().from(games).where(eq(games.id, game.id));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Arcs');
  });

  it('should list all games', async () => {
    await createTestGame({ name: 'Arcs' });
    await createTestGame({ name: 'Brass' });
    await createTestGame({ name: 'Ticket to Ride' });

    const allGames = await db.select().from(games);
    expect(allGames).toHaveLength(3);
  });

  it('should delete a game', async () => {
    const game = await createTestGame({ name: 'Test Game' });

    await db.delete(games).where(eq(games.id, game.id));

    const result = await db.select().from(games).where(eq(games.id, game.id));
    expect(result).toHaveLength(0);
  });
});

/**
 * Example 2: Testing with mocked external APIs
 *
 * This example shows testing a workflow that calls external APIs.
 * We mock the API responses to avoid cost and rate limits.
 */
describe('Resource processing with external APIs', () => {
  const mockFetch = createMockFetch();

  afterEach(cleanupTestDb);

  it('should fetch and process PDF with Mistral API', async () => {
    const game = await createTestGame({ name: 'Arcs' });

    // Mock Mistral OCR API response
    mockFetch.mockResolvedValueOnce(
      mistral.ocrResponse([
        { markdown: '# Setup\n\nPlace the game board in the center.' },
        { markdown: '# Playing the Game\n\nEach turn consists of three phases.' },
      ])
    );

    // Simulate PDF extraction
    const response = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/rulebook.pdf' }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.pages).toHaveLength(2);
    expect(data.pages[0].markdown).toContain('Setup');
  });

  it('should generate embeddings with OpenAI API', async () => {
    const chunks = ['Setup instructions', 'Game rules', 'Victory conditions'];

    // Mock OpenAI embeddings API response
    mockFetch.mockResolvedValueOnce(openAI.embeddings(chunks));

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      body: JSON.stringify({ input: chunks, model: 'text-embedding-3-small' }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.data).toHaveLength(3);
    expect(data.data[0].embedding).toHaveLength(1536);
  });
});

/**
 * Example 3: Testing multi-step workflows
 *
 * This example shows testing a complete workflow with multiple steps.
 * Uses route-based API mocking for multiple external calls.
 */
describe('Complete resource workflow', () => {
  const mockFetch = createMockFetch();

  beforeEach(() => {
    // Set up routing for multiple API calls
    routeAPICalls(mockFetch, {
      'mistral.ai': mistral.ocrResponse([
        {
          markdown: '# Page 1\n\nGame setup instructions.',
          images: [],
        },
      ]),
      'api.openai.com/v1/embeddings': openAI.embeddings(['chunk1', 'chunk2']),
      'api.openai.com/v1/chat': openAI.chatCompletion('Extracted questions'),
    });
  });

  afterEach(cleanupTestDb);

  it('should process resource end-to-end', async () => {
    const { game, resource } = await createTestGameWithResource({
      gameName: 'Arcs',
      resourceName: 'Rulebook',
    });

    expect(resource.id).toBeDefined();
    expect(resource.gameId).toBe(game.id);
    expect(resource.name).toBe('Rulebook');

    // Verify resource is in database
    const dbResource = await db
      .select()
      .from(resources)
      .where(eq(resources.id, resource.id));

    expect(dbResource).toHaveLength(1);
    expect(dbResource[0].status).toBe('ready');
  });
});

/**
 * Example 4: Testing complex queries
 *
 * This example shows testing database queries with joins and filters.
 */
describe('Database queries', () => {
  afterEach(cleanupTestDb);

  it('should find fragments by game', async () => {
    const { game, resource, fragments: testFragments } = await createTestGameWithResource({
      gameName: 'Arcs',
      fragmentCount: 5,
    });

    const result = await db
      .select()
      .from(fragments)
      .where(eq(fragments.gameId, game.id));

    expect(result).toHaveLength(5);
    expect(result[0].gameId).toBe(game.id);
  });

  it('should filter fragments by page number', async () => {
    const { game, resource } = await createTestGameWithResource({
      fragmentCount: 0, // Create manually
    });

    // Create fragments with specific page numbers
    await db.insert(fragments).values([
      {
        id: 'frag1',
        gameId: game.id,
        resourceId: resource.id,
        content: 'Page 1 content',
        embedding: new Array(1536).fill(0).map(() => Math.random()),
        version: 3,
        pageNumber: 1,
      },
      {
        id: 'frag2',
        gameId: game.id,
        resourceId: resource.id,
        content: 'Page 2 content',
        embedding: new Array(1536).fill(0).map(() => Math.random()),
        version: 3,
        pageNumber: 2,
      },
    ]);

    const page1Fragments = await db
      .select()
      .from(fragments)
      .where(eq(fragments.pageNumber, 1));

    expect(page1Fragments).toHaveLength(1);
    expect(page1Fragments[0].content).toContain('Page 1');
  });

  it('should count resources per game', async () => {
    const game = await createTestGame({ name: 'Arcs' });

    await createTestResource(game.id, { name: 'Rulebook' });
    await createTestResource(game.id, { name: 'Quick Start Guide' });
    await createTestResource(game.id, { name: 'FAQ' });

    const result = await db
      .select()
      .from(resources)
      .where(eq(resources.gameId, game.id));

    expect(result).toHaveLength(3);
  });
});

/**
 * Example 5: Testing with timeout for slow operations
 *
 * This example shows how to set a timeout for tests that might be slow.
 * Use 15000ms (15 seconds) for operations involving embeddings.
 */
describe('Slow operations', () => {
  const mockFetch = createMockFetch();

  afterEach(cleanupTestDb);

  it(
    'should handle large batch of embeddings',
    async () => {
      const chunks = Array.from({ length: 100 }, (_, i) => `Chunk ${i}`);

      mockFetch.mockResolvedValueOnce(openAI.embeddings(chunks));

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        body: JSON.stringify({ input: chunks }),
      });

      const data = await response.json();
      expect(data.data).toHaveLength(100);
    },
    15000 // 15 second timeout
  );
});

/**
 * When to use integration tests:
 *
 * ✅ DO write integration tests for:
 * - Database CRUD operations
 * - Multi-step workflows
 * - Functions that call external APIs (with mocks)
 * - Complex queries with joins
 * - Business logic that touches the database
 *
 * ❌ DON'T write integration tests for:
 * - Pure functions (use unit tests)
 * - API route handlers (use API route tests)
 * - Infrastructure/retry logic
 * - Edge cases that are obvious
 */
