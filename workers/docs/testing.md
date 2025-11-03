# Testing Guide

**Follow these rules when writing tests.**

## Hard Rules

### 1. Only Mock External APIs

```typescript
// ✅ DO: Mock external APIs
import { createMockFetch, openAI } from '@/test-utils/api-mocks';
const mockFetch = createMockFetch();
mockFetch.mockResolvedValueOnce(openAI.chatCompletion({ questions: ['Q1'] }));

// ❌ NEVER: Mock internal services
vi.mock('../db');
vi.mock('../ai/vectorize');
vi.mock('../services/r2-storage');
```

**What to mock:** OpenAI, Mistral, BGG, Resend (cost/rate limits)
**What to use real:** D1, KV, R2, Vectorize (all available in tests)

### 2. Test Behavior, Not Implementation

```typescript
// ✅ DO
it('should create fragments', async () => {
  await runEmbedStage(task, env);
  const fragments = await db.select().from(fragments);
  expect(fragments.length).toBeGreaterThan(0);
});

// ❌ DON'T
it('should call generateEmbeddings', async () => {
  const spy = vi.spyOn(embeddings, 'generateEmbeddings');
  await runEmbedStage(task, env);
  expect(spy).toHaveBeenCalled();
});
```

### 3. Focus on Basics, Skip Edge Cases

```typescript
// ✅ DO: Test core functionality
it('should process PDF', async () => { /* ... */ });

// ❌ DON'T: Test infrastructure/edge cases
it('should retry Vectorize 3 times with exponential backoff', async () => {});
it('should handle null fragment.images', async () => {});
```

### 4. Keep Tests Fast

**Target: <15 seconds for full suite**

- Mock external APIs (slow/costly)
- Use real Cloudflare services (fast)
- Add timeout for Vectorize: `it('test', async () => {}, 15000)`

## Test Environment

All Cloudflare services available (ephemeral, isolated):

```typescript
import { env } from 'cloudflare:test';

const db = getDb(env.DB);                    // D1 - in-memory SQLite
await env.JOB_STATUS_KV.put('key', 'value'); // KV - in-memory
await env.FILES.put('key', 'content');       // R2 - in-memory
await env.VECTORIZE.insert([...]);           // Vectorize - remote binding
```

**Setup/Cleanup:**
```typescript
import { setupTestDb, cleanupTestDb } from '@/test-utils/setup';

beforeAll(async () => await setupTestDb());
afterEach(async () => await cleanupTestDb());
```

## When to Write Tests

### Decision Tree

1. Pure function? → **Unit test** (next to code)
2. Multi-component workflow? → **Integration test**
3. HTTP endpoint? → **API test**
4. Infrastructure/retry/rollback logic? → **Don't test**
5. Edge case (null/empty/obvious)? → **Don't test**
6. Already tested elsewhere? → **Don't test**

### Unit Test Pattern

```typescript
// src/lib/pdf.test.ts - Test next to code
import { parseMarkdownHeadings } from './pdf';

it('should extract heading hierarchy', () => {
  const sections = parseMarkdownHeadings('# Setup\n## Components', 1);
  expect(sections[0].hierarchy).toBe('Setup');
  expect(sections[1].hierarchy).toBe('Setup > Components');
});
```

### Integration Test Pattern

```typescript
// src/lib/processing/pdf-processor.test.ts
import { env } from 'cloudflare:test';
import { createTestGame, createTestResource } from '@/test-utils/setup';
import { createMockFetch, openAI } from '@/test-utils/api-mocks';

const mockFetch = createMockFetch();

beforeEach(async () => {
  const game = await createTestGame({ name: 'Test Game' });
  const resource = await createTestResource(game.id);
  await env.FILES.put(key, JSON.stringify(mockPDF));

  mockFetch.mockImplementation(async (url) => {
    if (url.includes('openai.com')) return openAI.chatCompletion({ questions: ['Q1'] });
  });
});

it('should process PDF and create fragments', async () => {
  await runEmbedStage(testTask, testEnv);

  const fragments = await db.select().from(fragments)
    .where(eq(fragments.resourceId, resourceId));
  expect(fragments.length).toBeGreaterThan(0);
}, 15000);
```

### API Test Pattern

```typescript
// src/routes/api/games.test.ts
import { SELF } from 'cloudflare:test';

it('should create game', async () => {
  const response = await SELF.fetch('http://localhost/api/games', {
    method: 'POST',
    body: JSON.stringify({ name: 'Arcs', slug: 'arcs-2023' }),
  });

  expect(response.status).toBe(201);
  expect((await response.json()).name).toBe('Arcs');
});
```

## Mock External APIs

```typescript
import { createMockFetch, openAI, mistral, bgg } from '@/test-utils/api-mocks';

const mockFetch = createMockFetch();

// OpenAI
mockFetch.mockResolvedValueOnce(openAI.chatCompletion({ questions: ['Q1', 'Q2'] }));
mockFetch.mockResolvedValueOnce(openAI.embeddings(['text1', 'text2']));
mockFetch.mockResolvedValueOnce(openAI.error(500, 'Internal Server Error'));

// Mistral
mockFetch.mockResolvedValueOnce(mistral.ocrResponse([{ markdown: '# Page 1', images: [] }]));

// BGG
mockFetch.mockResolvedValueOnce(bgg.searchResults([{ id: '224517', name: 'Brass: Birmingham', year: 2018 }]));
```

**Mock embeddings (common):**
```typescript
vi.mock('../ai/embeddings', () => ({
  generateEmbeddings: vi.fn(async (chunks) => {
    return [chunks.map(() => ({ embedding: new Array(1536).fill(0).map(() => Math.random()) })), 3];
  }),
}));
```

## Test Fixtures

```typescript
import { createTestGame, createTestResource } from '@/test-utils/setup';

const game = await createTestGame({ name: 'Custom Name', slug: 'custom-slug' });
const resource = await createTestResource(game.id, {
  name: 'Rulebook',
  originalFilename: 'rulebook.pdf',
  resourceType: 'rulebook',
});
```

## What NOT to Test

❌ **Infrastructure** - Don't test Drizzle, Cloudflare services work
❌ **Retry logic** - Don't test exponential backoff, error retries
❌ **Edge cases** - Don't test null, undefined, empty arrays for every function
❌ **Implementation** - Don't spy on private methods, internal calls
❌ **Redundant** - Don't test same behavior in multiple files

## Quick Reference

### Imports
```typescript
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, createTestGame } from '@/test-utils/setup';
import { createMockFetch, openAI } from '@/test-utils/api-mocks';
import { getDb } from '@/lib/db';
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

## Summary

1. ✅ Only mock external APIs (OpenAI, Mistral, BGG)
2. ✅ Use real Cloudflare services (D1, KV, R2, Vectorize)
3. ✅ Test behavior (what), not implementation (how)
4. ✅ Focus on basics, skip edge cases
5. ✅ Keep tests fast (<15s total)
6. ✅ Clean up with `afterEach(cleanupTestDb)`
7. ✅ Make tests independent (no shared state)

**When in doubt:** Does this prove the system works, or test implementation details?
