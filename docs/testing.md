# Testing Guide

**Follow these rules when writing tests.**

## Hard Rules

### 1. Only Mock External APIs

```typescript
// ✅ DO: Mock external APIs
import { createMockFetch, openAI } from '@/tests/api-mocks';
const mockFetch = createMockFetch();
mockFetch.mockResolvedValueOnce(openAI.chatCompletion({ questions: ['Q1'] }));

// ❌ NEVER: Mock internal services
vi.mock('@/lib/db');
vi.mock('@/lib/ai/embeddings');
vi.mock('@/lib/services/images');
```

**What to mock:** OpenAI, Mistral, BGG, Resend (cost/rate limits)
**What to use real:** PostgreSQL, Vercel KV, Vercel Blob (all available in tests)

### 2. Test Behavior, Not Implementation

```typescript
// ✅ DO
it('should create fragments', async () => {
  await processResource(resourceId);
  const result = await db.select().from(fragments).where(eq(fragments.resourceId, resourceId));
  expect(result.length).toBeGreaterThan(0);
});

// ❌ DON'T
it('should call generateEmbeddings', async () => {
  const spy = vi.spyOn(embeddings, 'generateEmbeddings');
  await processResource(resourceId);
  expect(spy).toHaveBeenCalled();
});
```

### 3. Focus on Basics, Skip Edge Cases

```typescript
// ✅ DO: Test core functionality
it('should process PDF', async () => { /* ... */ });

// ❌ DON'T: Test infrastructure/edge cases
it('should retry OpenAI API 3 times with exponential backoff', async () => {});
it('should handle null fragment.images', async () => {});
```

### 4. Keep Tests Fast

**Target: <15 seconds for full suite**

- Mock external APIs (slow/costly)
- Use real local services (fast)
- Add timeout for slow operations: `it('test', async () => {}, 15000)`

## Test Environment

All services are available in tests (ephemeral, isolated):

```typescript
import { db } from '@/lib/db';
import { cleanupTestDb } from '@/tests/db-helpers';

// PostgreSQL - real test database
const games = await db.select().from(schema.games);

// Database is automatically cleaned between tests
afterEach(cleanupTestDb);
```

**Database Setup:**
Tests use a separate PostgreSQL database (`test_gamegame`) running on port 5433. This is configured in `docker-compose.yml` and test environment variables are set in `tests/setup.ts`.

**Setup/Cleanup:**
```typescript
import { setupTestDb, cleanupTestDb } from '@/tests/db-helpers';

beforeAll(async () => await setupTestDb());
afterEach(async () => await cleanupTestDb());
```

## When to Write Tests

### Decision Tree

1. Pure function? → **Unit test** (next to code)
2. Multi-component workflow? → **Integration test**
3. API route handler? → **API route test**
4. Infrastructure/retry/rollback logic? → **Don't test**
5. Edge case (null/empty/obvious)? → **Don't test**
6. Already tested elsewhere? → **Don't test**

### Unit Test Pattern

```typescript
// lib/pdf.test.ts - Test next to code
import { parseMarkdownHeadings } from './pdf';

it('should extract heading hierarchy', () => {
  const sections = parseMarkdownHeadings('# Setup\n## Components', 1);
  expect(sections[0].hierarchy).toBe('Setup');
  expect(sections[1].hierarchy).toBe('Setup > Components');
});
```

### Integration Test Pattern

```typescript
// tests/resource-processing.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestGame, createTestResource } from '@/tests/fixtures';
import { cleanupTestDb } from '@/tests/db-helpers';
import { createMockFetch, openAI, mistral } from '@/tests/api-mocks';
import { db } from '@/lib/db';
import { fragments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const mockFetch = createMockFetch();

beforeEach(async () => {
  const game = await createTestGame({ name: 'Test Game' });
  const resource = await createTestResource(game.id);

  // Mock external API calls
  mockFetch.mockImplementation(async (url) => {
    if (url.includes('openai.com/v1/embeddings')) {
      return openAI.embeddings(['chunk1', 'chunk2']);
    }
    if (url.includes('mistral.ai')) {
      return mistral.ocrResponse([{ markdown: '# Page 1\nContent here' }]);
    }
  });
});

afterEach(cleanupTestDb);

it('should process PDF and create fragments', async () => {
  await processResource(resourceId);

  const result = await db.select()
    .from(fragments)
    .where(eq(fragments.resourceId, resourceId));

  expect(result.length).toBeGreaterThan(0);
  expect(result[0].embedding).toBeDefined();
}, 15000);
```

### API Route Test Pattern

```typescript
// app/api/games/route.test.ts
import { GET, POST } from '@/app/api/games/route';
import { NextRequest } from 'next/server';

it('should return games list', async () => {
  await createTestGame({ name: 'Arcs' });

  const request = new NextRequest('http://localhost/api/games');
  const response = await GET(request);

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toHaveLength(1);
  expect(data[0].name).toBe('Arcs');
});

it('should create game', async () => {
  const request = new NextRequest('http://localhost/api/games', {
    method: 'POST',
    body: JSON.stringify({ name: 'Arcs', slug: 'arcs-2023' }),
  });

  const response = await POST(request);

  expect(response.status).toBe(201);
  const data = await response.json();
  expect(data.name).toBe('Arcs');
});
```

## Mock External APIs

```typescript
import { createMockFetch, openAI, mistral, bgg, routeAPICalls } from '@/tests/api-mocks';

const mockFetch = createMockFetch();

// OpenAI
mockFetch.mockResolvedValueOnce(openAI.chatCompletion({ questions: ['Q1', 'Q2'] }));
mockFetch.mockResolvedValueOnce(openAI.embeddings(['text1', 'text2']));
mockFetch.mockResolvedValueOnce(openAI.error(500, 'Internal Server Error'));

// Mistral
mockFetch.mockResolvedValueOnce(mistral.ocrResponse([{ markdown: '# Page 1', images: [] }]));

// BGG
mockFetch.mockResolvedValueOnce(bgg.searchResults([{ id: '224517', name: 'Brass: Birmingham', year: 2018 }]));

// Multiple APIs (routing)
const mockFetch = createMockFetch();
routeAPICalls(mockFetch, {
  'api.openai.com/v1/embeddings': openAI.embeddings(['text']),
  'api.openai.com/v1/chat/completions': openAI.chatCompletion('response'),
  'boardgamegeek.com/xmlapi2/search': bgg.searchResults([...])
});
```

**Mock embeddings (common):**
```typescript
// For workflows that generate many embeddings, mock the embedding function
vi.mock('@/lib/ai/embeddings', () => ({
  generateEmbeddings: vi.fn(async (chunks) => {
    return chunks.map(() => ({
      embedding: new Array(1536).fill(0).map(() => Math.random()),
      tokens: 100,
    }));
  }),
}));
```

## Test Fixtures

```typescript
import { createTestGame, createTestResource, createTestAttachment } from '@/tests/fixtures';

const game = await createTestGame({ name: 'Custom Name', slug: 'custom-slug' });
const resource = await createTestResource(game.id, {
  name: 'Rulebook',
  url: 'https://example.com/rulebook.pdf',
  content: '# Custom content',
});
const attachment = await createTestAttachment(resource.id, game.id, {
  type: 'image',
  pageNumber: 5,
});
```

## Database Helpers

```typescript
import { setupTestDb, cleanupTestDb, resetTestDb } from '@/tests/db-helpers';

// Verify connection (run once in beforeAll)
beforeAll(async () => {
  await setupTestDb();
});

// Fast cleanup (DELETE FROM) - run after each test
afterEach(async () => {
  await cleanupTestDb();
});

// Full reset (TRUNCATE CASCADE) - use sparingly
beforeAll(async () => {
  await resetTestDb();
});
```

**Important:** Use `cleanupTestDb()` in `afterEach` for fast, isolated tests. Only use `resetTestDb()` when you need to reset sequences.

## What NOT to Test

❌ **Infrastructure** - Don't test Drizzle, PostgreSQL, Next.js work correctly
❌ **Retry logic** - Don't test exponential backoff, error retries
❌ **Edge cases** - Don't test null, undefined, empty arrays for every function
❌ **Implementation** - Don't spy on private methods, internal calls
❌ **Redundant** - Don't test same behavior in multiple files

## Quick Reference

### Imports
```typescript
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/lib/db';
import { setupTestDb, cleanupTestDb } from '@/tests/db-helpers';
import { createTestGame, createTestResource } from '@/tests/fixtures';
import { createMockFetch, openAI, mistral, bgg } from '@/tests/api-mocks';
import { eq } from 'drizzle-orm';
```

### Common Assertions
```typescript
expect(response.status).toBe(200);
expect(results).toHaveLength(5);
expect(obj).toMatchObject({ name: 'Expected' });
expect(value).toBeDefined();
expect(value).toBeGreaterThan(0);
```

### Commands
```bash
pnpm test              # Watch mode (TDD)
pnpm test:run          # CI mode
pnpm test:ui           # Visual UI
pnpm test file.test.ts # Specific file
```

### Test Database Setup
```bash
# Start PostgreSQL test database
docker-compose up -d

# Run migrations on test database
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/test_gamegame pnpm db:migrate

# Reset test database if needed
make reset-db  # Resets both dev and test databases
```

## Summary

1. ✅ Only mock external APIs (OpenAI, Mistral, BGG, Resend)
2. ✅ Use real local services (PostgreSQL, Vercel KV, Vercel Blob)
3. ✅ Test behavior (what), not implementation (how)
4. ✅ Focus on basics, skip edge cases
5. ✅ Keep tests fast (<15s total)
6. ✅ Clean up with `afterEach(cleanupTestDb)`
7. ✅ Make tests independent (no shared state)

**When in doubt:** Does this prove the system works, or test implementation details?
