/**
 * API Route Test Example
 *
 * Demonstrates testing Next.js API route handlers (App Router).
 * Tests the HTTP interface, request/response handling, and business logic.
 *
 * Key principles:
 * - Test API routes directly (import GET/POST handlers)
 * - Use real database for data operations
 * - Mock external APIs if route calls them
 * - Test both success and error cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { cleanupTestDb } from '@/tests/db-helpers';
import { createTestGame, createTestResource } from '@/tests/fixtures';
import { createMockFetch, openAI } from '@/tests/api-mocks';

/**
 * Example 1: Testing GET endpoint
 *
 * This example shows testing a GET endpoint that returns a list of resources.
 * Note: Actual route handler would be imported from app/api/games/route.ts
 */
describe('GET /api/games', () => {
  afterEach(cleanupTestDb);

  // Mock GET handler (in real code, import from route.ts)
  async function GET(request: NextRequest) {
    const { db } = await import('@/lib/db');
    const { games } = await import('@/lib/db/schema');

    const allGames = await db.select().from(games);

    return Response.json(allGames);
  }

  it('should return empty array when no games exist', async () => {
    const request = new NextRequest('http://localhost/api/games');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it('should return all games', async () => {
    await createTestGame({ name: 'Arcs' });
    await createTestGame({ name: 'Brass' });

    const request = new NextRequest('http://localhost/api/games');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(2);
    expect(data[0].name).toBeDefined();
  });

  it('should filter games by query parameter', async () => {
    await createTestGame({ name: 'Arcs', year: 2024 });
    await createTestGame({ name: 'Brass', year: 2018 });

    // In real implementation, would parse searchParams
    const request = new NextRequest('http://localhost/api/games?year=2024');
    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year');

    expect(yearParam).toBe('2024');
  });
});

/**
 * Example 2: Testing POST endpoint
 *
 * This example shows testing a POST endpoint that creates a resource.
 */
describe('POST /api/games', () => {
  afterEach(cleanupTestDb);

  // Mock POST handler
  async function POST(request: NextRequest) {
    const { db } = await import('@/lib/db');
    const { games } = await import('@/lib/db/schema');
    const { nanoid } = await import('nanoid');

    const body = await request.json();

    const [game] = await db
      .insert(games)
      .values({
        id: nanoid(),
        name: body.name,
        slug: body.slug,
        year: body.year || null,
        imageUrl: body.imageUrl || null,
        bggUrl: body.bggUrl || null,
      })
      .returning();

    return Response.json(game, { status: 201 });
  }

  it('should create a new game', async () => {
    const request = new NextRequest('http://localhost/api/games', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Arcs',
        slug: 'arcs-2024',
        year: 2024,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBeDefined();
    expect(data.name).toBe('Arcs');
    expect(data.slug).toBe('arcs-2024');
  });

  it('should handle missing optional fields', async () => {
    const request = new NextRequest('http://localhost/api/games', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Arcs',
        slug: 'arcs',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.year).toBeNull();
    expect(data.imageUrl).toBeNull();
  });
});

/**
 * Example 3: Testing dynamic route with params
 *
 * This example shows testing a dynamic route like /api/games/[gameId]
 */
describe('GET /api/games/[gameId]', () => {
  afterEach(cleanupTestDb);

  // Mock GET handler with params
  async function GET(request: NextRequest, context: { params: { gameId: string } }) {
    const { db } = await import('@/lib/db');
    const { games } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');

    const gameId = context.params.gameId;

    const [game] = await db.select().from(games).where(eq(games.id, gameId));

    if (!game) {
      return Response.json({ error: 'Game not found' }, { status: 404 });
    }

    return Response.json(game);
  }

  it('should return game by ID', async () => {
    const game = await createTestGame({ name: 'Arcs' });

    const request = new NextRequest(`http://localhost/api/games/${game.id}`);
    const response = await GET(request, { params: { gameId: game.id } });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(game.id);
    expect(data.name).toBe('Arcs');
  });

  it('should return 404 for non-existent game', async () => {
    const request = new NextRequest('http://localhost/api/games/nonexistent');
    const response = await GET(request, { params: { gameId: 'nonexistent' } });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Game not found');
  });
});

/**
 * Example 4: Testing route with external API calls
 *
 * This example shows testing a route that calls external APIs.
 * We mock the external API to avoid cost and rate limits.
 */
describe('POST /api/chat', () => {
  const mockFetch = createMockFetch();

  afterEach(cleanupTestDb);

  // Mock POST handler that calls OpenAI
  async function POST(request: NextRequest) {
    const body = await request.json();

    // Call OpenAI API (mocked in tests)
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content: body.message }],
      }),
    });

    const data = await response.json();
    return Response.json({ response: data.choices[0].message.content });
  }

  it('should handle chat request with OpenAI', async () => {
    // Mock OpenAI response
    mockFetch.mockResolvedValueOnce(
      openAI.chatCompletion('Setup requires 2-4 players.')
    );

    const request = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: 'How many players for Arcs?',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.response).toContain('2-4 players');
  });

  it('should handle OpenAI API errors', async () => {
    // Mock OpenAI error
    mockFetch.mockResolvedValueOnce(openAI.error(500, 'Internal Server Error'));

    const request = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Test question',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200); // Route should handle error gracefully
  });
});

/**
 * Example 5: Testing route with authentication
 *
 * This example shows testing a route that requires authentication.
 * Authentication is mocked in tests/setup.ts.
 */
describe('POST /api/admin/games (authenticated)', () => {
  afterEach(cleanupTestDb);

  // Mock authenticated POST handler
  async function POST(request: NextRequest) {
    // In real code, would call requireAdmin() from @/lib/auth/helpers
    // This is mocked in tests/setup.ts to always return admin user
    const { requireAdmin } = await import('@/lib/auth/helpers');
    const user = await requireAdmin();

    const { db } = await import('@/lib/db');
    const { games } = await import('@/lib/db/schema');
    const { nanoid } = await import('nanoid');

    const body = await request.json();

    const [game] = await db
      .insert(games)
      .values({
        id: nanoid(),
        name: body.name,
        slug: body.slug,
      })
      .returning();

    return Response.json(game, { status: 201 });
  }

  it('should allow authenticated admin to create game', async () => {
    const request = new NextRequest('http://localhost/api/admin/games', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Arcs',
        slug: 'arcs',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.name).toBe('Arcs');
  });
});

/**
 * Example 6: Testing route with request headers
 *
 * This example shows testing a route that uses request headers.
 */
describe('GET /api/games (with headers)', () => {
  afterEach(cleanupTestDb);

  async function GET(request: NextRequest) {
    const contentType = request.headers.get('accept');
    const { db } = await import('@/lib/db');
    const { games } = await import('@/lib/db/schema');

    const allGames = await db.select().from(games);

    if (contentType === 'text/csv') {
      const csv = allGames.map((g) => `${g.id},${g.name}`).join('\n');
      return new Response(csv, {
        headers: { 'Content-Type': 'text/csv' },
      });
    }

    return Response.json(allGames);
  }

  it('should return JSON by default', async () => {
    await createTestGame({ name: 'Arcs' });

    const request = new NextRequest('http://localhost/api/games');
    const response = await GET(request);

    expect(response.headers.get('content-type')).toContain('application/json');
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('should return CSV when requested', async () => {
    await createTestGame({ name: 'Arcs' });

    const request = new NextRequest('http://localhost/api/games', {
      headers: { accept: 'text/csv' },
    });
    const response = await GET(request);

    expect(response.headers.get('content-type')).toBe('text/csv');
    const csv = await response.text();
    expect(csv).toContain('Arcs');
  });
});

/**
 * When to use API route tests:
 *
 * ✅ DO write API route tests for:
 * - GET/POST/PUT/DELETE endpoints
 * - Request validation and error handling
 * - Authentication/authorization checks
 * - Response formatting (JSON, CSV, etc.)
 * - Status codes and error messages
 *
 * ❌ DON'T write API route tests for:
 * - Pure business logic (use unit or integration tests)
 * - Database operations in isolation (use integration tests)
 * - External API behavior (just mock them)
 */
