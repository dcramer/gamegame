# Testing Guide

**Follow these rules when writing tests.**

## Hard Rules

### 1. Mock External APIs, Not Internal Services

**Philosophy**: Tests should work without internet access but remain meaningful. Mock network boundaries (external APIs), use real implementations for everything else.

```typescript
// ✅ DO: Mock external APIs
import { createMockFetch, openAI } from '@/tests/api-mocks';
const mockFetch = createMockFetch();
mockFetch.mockResolvedValueOnce(openAI.chatCompletion({ questions: ['Q1'] }));

// ❌ DON'T: Mock internal services
vi.mock('@/lib/db');
vi.mock('@/lib/services/images');
vi.mock('@/lib/services/blob-storage');
```

**What to mock:**
- External APIs with costs: OpenAI, Mistral (embeddings, chat, OCR)
- External APIs with rate limits: BoardGameGeek
- Email service: Resend

**What to use real:**
- PostgreSQL (test database on port 5433)
- Vercel KV (ephemeral test instance)
- Vercel Blob / Local filesystem storage
- All internal services and utilities

**Exception: Optional Real API Tests**

For critical features that depend on LLM behavior (e.g., prompt quality, answer classification), you MAY write tests that use real APIs:

```typescript
import { vi } from 'vitest';

// Skip test if no API key available
const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

describe('Answer Quality Evals', () => {
  it.skipIf(!hasOpenAIKey)('should classify gameplay questions correctly', async () => {
    // Uses real OpenAI API - no mocking
    const result = await classifyQuestion('How many players can play?');
    expect(result.type).toBe('gameplay');
  });
});
```

Use `.skipIf(!hasOpenAIKey)` to make these tests optional. Run them manually or in CI with API keys when validating LLM behavior.

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
// tests/api/games.test.ts
import { GET, POST } from '@/app/api/games/route';
import { NextRequest } from 'next/server';
import { createTestGame, createTestUser } from '@/tests/fixtures';
import { cleanupTestDb } from '@/tests/db-helpers';

// Mock authentication for protected routes
vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  verifyAdminSession: vi.fn(),
  createSession: vi.fn(),
}));

afterEach(cleanupTestDb);

describe('GET /api/games', () => {
  it('should return games list', async () => {
    await createTestGame({ name: 'Arcs' });

    const request = new NextRequest('http://localhost/api/games');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('Arcs');
  });
});

describe('POST /api/games', () => {
  it('should create game (admin only)', async () => {
    // Mock admin authentication
    const { verifyAdminSession } = await import('@/lib/session');
    const adminUser = await createTestUser({ email: 'admin@example.com', isAdmin: true });
    vi.mocked(verifyAdminSession).mockResolvedValue({
      userId: adminUser.id,
      email: adminUser.email,
      isAdmin: true,
    });

    const request = new NextRequest('http://localhost/api/games', {
      method: 'POST',
      body: JSON.stringify({ name: 'Arcs', slug: 'arcs-2023' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.name).toBe('Arcs');
  });

  it('should reject non-admin users', async () => {
    const { verifyAdminSession } = await import('@/lib/session');
    vi.mocked(verifyAdminSession).mockRejectedValue(new Error('Unauthorized'));

    const request = new NextRequest('http://localhost/api/games', {
      method: 'POST',
      body: JSON.stringify({ name: 'Arcs' }),
    });

    await expect(POST(request)).rejects.toThrow('Unauthorized');
  });
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

## Authentication Testing

Most API routes use JWT authentication via `withAuth()` or `withAdmin()` middleware. Mock the session module for protected route tests:

```typescript
import { vi } from 'vitest';
import { createTestUser } from '@/tests/fixtures';

// Mock session module at top of test file
vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  verifySession: vi.fn(),
  verifyAdminSession: vi.fn(),
  createSession: vi.fn(),
  destroySession: vi.fn(),
  isAuthenticated: vi.fn(),
  isAdmin: vi.fn(),
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}));

describe('Protected Route', () => {
  it('should allow authenticated users', async () => {
    const { getCurrentUser } = await import('@/lib/session');
    const user = await createTestUser({ email: 'user@example.com' });

    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: user.id,
      email: user.email,
      isAdmin: false,
    });

    // Test authenticated route
  });

  it('should allow admin users only', async () => {
    const { verifyAdminSession } = await import('@/lib/session');
    const admin = await createTestUser({ isAdmin: true });

    vi.mocked(verifyAdminSession).mockResolvedValue({
      userId: admin.id,
      email: admin.email,
      isAdmin: true,
    });

    // Test admin route
  });

  it('should reject unauthenticated requests', async () => {
    const { requireAuth } = await import('@/lib/session');
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));

    // Expect rejection
  });
});
```

**Why mock session?** Session functions use `cookies()` which requires Next.js request context. Mocking avoids complex setup while testing authorization logic.

## Workflow Testing

Vercel Workflows are complex and integration-heavy. Focus on testing individual step functions, not full workflow orchestration.

```typescript
// workflows/process-resource/steps/ingest.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ingestPDF } from './ingest';
import { createTestGame, createTestResource } from '@/tests/fixtures';
import { createMockFetch, mistral } from '@/tests/api-mocks';
import { cleanupTestDb } from '@/tests/db-helpers';

const mockFetch = createMockFetch();

beforeEach(async () => {
  await cleanupTestDb();
  mockFetch.mockClear();
});

it('should extract PDF content using Mistral OCR', async () => {
  const game = await createTestGame({ name: 'Arcs' });
  const resource = await createTestResource(game.id, {
    url: 'https://example.com/rulebook.pdf',
  });

  // Mock Mistral OCR response
  mockFetch.mockResolvedValueOnce(
    mistral.ocrResponse([
      { markdown: '# Setup\n\nPlace the board in center', images: [] },
      { markdown: '# Gameplay\n\nRoll dice', images: [] },
    ])
  );

  const result = await ingestPDF({ resourceId: resource.id });

  expect(result.content).toContain('# Setup');
  expect(result.pageCount).toBe(2);
  expect(mockFetch).toHaveBeenCalledOnce();
});
```

**What to test:**
- ✅ Individual step functions with real database and mocked external APIs
- ✅ Data transformations and business logic within steps
- ✅ Error handling in step functions

**What NOT to test:**
- ❌ Full workflow orchestration (Vercel handles this)
- ❌ Workflow retry logic and error recovery
- ❌ Step coordination and state management

**Document-style tests** are acceptable for complex workflows (see `workflows/embed-stage.test.ts`):
```typescript
it('should document the timestamp bug fix', () => {
  // This test documents that Date.now() returns number, not Date object
  const timestamp = Date.now();
  expect(typeof timestamp).toBe('number');

  // Background: Database bigint columns need numbers, not Date objects
  // Fixed at: workflows/embed-stage.ts lines 99, 418, 428
});
```

## Blob Storage Testing

Blob storage (Vercel Blob or local filesystem) is available in tests. Use real file uploads/downloads:

```typescript
import { describe, it, expect } from 'vitest';
import { uploadAttachment, getAttachmentUrl } from '@/lib/services/blob-storage';
import { createTestResource } from '@/tests/fixtures';

it('should upload and retrieve attachment', async () => {
  const resource = await createTestResource(game.id);
  const imageBuffer = Buffer.from('fake-image-data');

  // Real blob upload
  const url = await uploadAttachment(
    resource.id,
    'attachment-id',
    imageBuffer,
    'image/png'
  );

  expect(url).toContain('attachment-id');

  // Real blob retrieval
  const retrievedUrl = await getAttachmentUrl('attachment-id');
  expect(retrievedUrl).toBe(url);
});
```

**Note:** Tests use local filesystem storage (in `./public/uploads/`) when `BLOB_READ_WRITE_TOKEN` is not set. Cleanup happens automatically via `cleanupTestDb()`.

## Parallel Test Execution

Tests run in **parallel by default** (Vitest). This is safe because:
- Each test uses the same shared test database
- `cleanupTestDb()` runs in `afterEach` to clean all tables
- Database transactions provide isolation

**When to use `.sequential`:**
```typescript
// Use for tests that modify global state or shared resources
describe.sequential('Rate Limiting', () => {
  it('should throttle requests', async () => {
    // Tests that depend on timing or shared rate limit state
  });
});
```

## CI Configuration

Tests run in GitHub Actions CI with the same Docker setup as local development:

```yaml
# .github/workflows/test.yml (example)
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:16-3.5
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm db:migrate # Migrate test database
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5433/test_gamegame

      - run: pnpm test:run
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5433/test_gamegame
          # Optional: Add OPENAI_API_KEY to run eval tests
```

**Environment differences:**
- CI uses the same PostgreSQL image (`postgis/postgis:16-3.5`)
- Test database migrations must run before tests
- Optional: Set `OPENAI_API_KEY` secret to run `.skipIf(!hasOpenAIKey)` tests

## What NOT to Test

❌ **Infrastructure** - Don't test Drizzle, PostgreSQL, Next.js work correctly
❌ **Retry logic** - Don't test exponential backoff, error retries
❌ **Edge cases** - Don't test null, undefined, empty arrays for every function
❌ **Implementation** - Don't spy on private methods, internal calls
❌ **Redundant** - Don't test same behavior in multiple files
❌ **Workflow orchestration** - Don't test Vercel Workflow coordination (test steps instead)

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

### Core Principles
1. ✅ Mock external APIs only (OpenAI, Mistral, BGG, Resend) - not internal services
2. ✅ Use real local services (PostgreSQL, Vercel KV, Vercel Blob storage)
3. ✅ Test behavior (what), not implementation (how)
4. ✅ Focus on basics, skip edge cases and infrastructure
5. ✅ Keep tests fast (<15s total for full suite)
6. ✅ Clean up with `afterEach(cleanupTestDb)`
7. ✅ Make tests independent (no shared state)

### Key Patterns
- **Authentication**: Mock `@/lib/session` module for protected route tests
- **Workflows**: Test individual step functions, not full orchestration
- **Blob Storage**: Use real uploads/downloads (local filesystem in tests)
- **Optional Real APIs**: Use `.skipIf(!hasOpenAIKey)` for LLM eval tests
- **Parallel Execution**: Tests run in parallel by default (use `.sequential` only when needed)
- **CI**: Same PostgreSQL setup as local, run migrations before tests

**When in doubt:** Does this prove the system works, or test implementation details?
