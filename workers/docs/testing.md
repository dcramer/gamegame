# Testing Principles & Guide

This document describes our testing philosophy and provides practical guidance on writing and running tests for the GameGame Workers application.

## Philosophy

### 1. Integration Tests Over Mocks

We strongly prefer **integration tests** over mocking. Tests should verify that components work together correctly, using real implementations whenever possible.

**Why?**
- Mocks can diverge from actual behavior
- Integration tests catch more bugs (interface mismatches, integration issues)
- Tests become documentation of actual system behavior
- Refactoring is safer when tests verify real behavior

**When to mock:**
- External services with rate limits or costs (OpenAI, Mistral)
- Services that can't run locally (production Cloudflare services without test bindings)
- Truly non-deterministic behavior (current time, random values)
- Network I/O that would make tests unreasonably slow

### 2. Mark External API Tests as Optional

Tests that require external API keys (OpenAI, Mistral) should be **marked as optional** using Vitest's conditional test syntax.

```typescript
import { describe, it, expect, vi } from 'vitest';

const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

describe.skipIf(!hasOpenAIKey)('OpenAI Integration', () => {
  it('should generate embeddings', async () => {
    // Test that requires OPENAI_API_KEY
  });
});
```

This allows:
- CI/CD to run without API keys by default
- Developers to opt-in by setting environment variables
- Cost control (no accidental API charges)

### 3. Use Test Bindings for Cloudflare Services

For Cloudflare services that can't run fully locally, use **test bindings** from `cloudflare:test`:

```typescript
import { env } from 'cloudflare:test';

// env.DB - In-memory D1 (SQLite)
// env.BUCKET - In-memory R2
// env.KV - In-memory KV
// env.VECTORIZE - Requires --experimental-vectorize-bind-to-prod
```

See the [Vitest Pool Workers docs](https://developers.cloudflare.com/workers/testing/vitest-integration/get-started/) for details.

### 4. Use Vitest

We use **Vitest** as our test runner:
- Fast native ESM support
- Works with Cloudflare Workers via `@cloudflare/vitest-pool-workers`
- Modern API, compatible with Jest syntax
- Integrated with Vite build pipeline

## Test Structure

### Unit Tests

Test pure functions in isolation without HTTP requests or database access.

**Example: `src/lib/pdf.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { parseMarkdownHeadings } from './pdf';

describe('PDF Utility Functions', () => {
  describe('parseMarkdownHeadings', () => {
    it('should extract headings with correct hierarchy', () => {
      const markdown = `# Setup
## Components
### Player Boards`;

      const sections = parseMarkdownHeadings(markdown, 1);

      expect(sections).toHaveLength(3);
      expect(sections[0]).toMatchObject({
        level: 1,
        text: 'Setup',
        hierarchy: 'Setup',
        pageNumber: 1,
      });
    });
  });
});
```

**When to write unit tests:**
- Pure utility functions
- Complex business logic
- Algorithm implementations
- Data transformations

### Integration Tests

Test HTTP endpoints using `SELF.fetch()` to verify request/response behavior with real database operations.

**Example: `src/routes/api/health.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { setupTestDb, cleanupTestDb } from '@/test-utils/setup';

describe('Health Endpoint Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should return healthy status when database is accessible', async () => {
    const response = await SELF.fetch('http://localhost/api/health');

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data.checks.database).toBe('ok');
  });
});
```

**Key patterns:**
- Use `SELF.fetch()` to make requests to your Worker
- Use `beforeAll` to set up database schema
- Use `afterEach` to clean up test data
- Test actual HTTP responses, status codes, and JSON shapes

**When to write integration tests:**
- API endpoints
- Authentication flows
- Database operations
- Request validation
- Error handling

## Test Utilities

### Database Setup

**Migrations are applied automatically!** When you run tests, the setup file `src/test-utils/apply-migrations.ts` runs once before all tests, applying all Drizzle migrations from the `drizzle/` directory.

**How it works:**
1. `vitest.config.ts` reads migrations from filesystem (Node.js context)
2. Passes them as `TEST_MIGRATIONS` binding to Worker environment
3. `apply-migrations.ts` runs once before all tests
4. `applyD1Migrations()` applies only unapplied migrations (idempotent)

**When you add a new migration:** Nothing to do! Just run `pnpm db:generate` and tests will pick it up automatically.

**Test utilities:**

```typescript
import {
  setupTestDb,      // Get DB instance (migrations already applied)
  cleanupTestDb,    // Delete all test data
  createTestGame,   // Create test game
  createTestResource, // Create test resource
  createTestAttachment // Create test attachment
} from '@/test-utils/setup';

// In your test file
describe('My Test Suite', () => {
  beforeAll(async () => {
    await setupTestDb();  // Just gets DB instance
  });

  afterEach(async () => {
    await cleanupTestDb();  // Clean up test data
  });

  it('should do something', async () => {
    const game = await createTestGame({ name: 'Custom Name' });
    const resource = await createTestResource(game.id);
    // ... test logic
  });
});
```

### Accessing Test Environment

Access Cloudflare bindings in tests:

```typescript
import { env } from 'cloudflare:test';
import { getDb } from '@/lib/db';

// D1 database
const db = getDb(env.DB);

// R2 bucket
await env.BUCKET.put('key', 'value');

// KV namespace
await env.KV.put('key', 'value');

// Vectorize (requires --experimental-vectorize-bind-to-prod)
const results = await env.VECTORIZE.query(embedding);
```

## Writing Tests for External APIs

### OpenAI Tests (Optional)

```typescript
import { describe, it, expect } from 'vitest';
import { generateEmbedding } from './embeddings';

const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

describe.skipIf(!hasOpenAIKey)('OpenAI Embeddings', () => {
  it('should generate 1536-dimensional embedding', async () => {
    const embedding = await generateEmbedding('test text');

    expect(embedding).toHaveLength(1536);
    expect(typeof embedding[0]).toBe('number');
  });
});
```

### Mistral Tests (Optional)

```typescript
import { describe, it, expect } from 'vitest';
import { extractPdfContent } from './pdf';

const hasMistralKey = !!process.env.MISTRAL_API_KEY;

describe.skipIf(!hasMistralKey)('Mistral PDF Extraction', () => {
  it('should extract text from PDF', async () => {
    const url = 'https://example.com/test.pdf';
    const result = await extractPdfContent(url);

    expect(result.pageCount).toBeGreaterThan(0);
    expect(result.pages[0].markdown).toBeDefined();
  });
});
```

### Running Optional Tests

```bash
# Run all tests (skip API tests)
pnpm test

# Run with OpenAI tests
OPENAI_API_KEY=sk-... pnpm test

# Run with all API keys
OPENAI_API_KEY=sk-... MISTRAL_API_KEY=... pnpm test
```

## Cloudflare Service Bindings

### D1 (SQLite) - Works Locally

D1 uses in-memory SQLite via Miniflare. No special flags needed.

```typescript
import { env } from 'cloudflare:test';
import { getDb } from '@/lib/db';

const db = getDb(env.DB);
await db.select().from(games).all();
```

### R2 - Works Locally

R2 uses in-memory storage via Miniflare. No special flags needed.

```typescript
import { env } from 'cloudflare:test';

await env.BUCKET.put('test.txt', 'content');
const obj = await env.BUCKET.get('test.txt');
```

### KV - Works Locally

KV uses in-memory storage via Miniflare. No special flags needed.

```typescript
import { env } from 'cloudflare:test';

await env.KV.put('key', 'value');
const value = await env.KV.get('key');
```

### Vectorize - Requires Production Binding

Vectorize does **not** have a local emulator. Tests must use production:

```typescript
const hasVectorize = !!process.env.USE_PROD_VECTORIZE;

describe.skipIf(!hasVectorize)('Vectorize Search', () => {
  it('should search vectors', async () => {
    const results = await env.VECTORIZE.query(embedding);
    expect(results).toBeDefined();
  });
});
```

Run with production Vectorize:

```bash
pnpm test --experimental-vectorize-bind-to-prod
```

**Warning:** This uses your **production** Vectorize index. Be careful not to corrupt production data.

### Queue - Works Locally

Cloudflare Queues use in-memory implementation via Miniflare.

```typescript
import { env } from 'cloudflare:test';

await env.RESOURCE_QUEUE.send({ jobId: 'test', resourceId: 'res-123' });
```

## Running Tests

### Basic Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with UI
pnpm test:ui

# Run tests once (CI mode)
pnpm test:run

# Run specific test file
pnpm test src/lib/pdf.test.ts

# Run tests matching pattern
pnpm test --grep "Health Endpoint"
```

### Environment Variables

```bash
# Run with OpenAI tests
OPENAI_API_KEY=sk-... pnpm test

# Run with Mistral tests
MISTRAL_API_KEY=... pnpm test

# Run with production Vectorize
pnpm test --experimental-vectorize-bind-to-prod
```

### Watch Mode

Watch mode is great for TDD:

```bash
pnpm test --watch
```

- Automatically re-runs tests when files change
- Press `p` to filter by filename
- Press `t` to filter by test name
- Press `a` to run all tests
- Press `q` to quit

### UI Mode

Visual test runner:

```bash
pnpm test:ui
```

Opens browser with:
- Test explorer tree
- Test output and errors
- Code coverage
- Filter and search

## Configuration

### Vitest Config (`vitest.config.ts`)

```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    include: ['src/**/*.test.ts'],
    poolOptions: {
      workers: {
        main: './src/index.test.tsx',
        miniflare: {
          d1Databases: ['DB'],
          compatibilityFlags: ['nodejs_compat'],
          compatibilityDate: '2025-01-15',
        },
      },
    },
  },
});
```

**Key settings:**
- `main`: Entry point for test Worker (no queue consumer)
- `d1Databases`: In-memory D1 databases
- `compatibilityFlags`: Enable Node.js compatibility
- `include`: Test file patterns

### Test Entry Point (`src/index.test.tsx`)

Separate entry point for tests to avoid loading queue consumers:

```typescript
// src/index.test.tsx
import app from './app';  // Main Hono app without queue

export default app;
```

This prevents:
- Queue consumers from starting during tests
- Background workers from interfering
- Unnecessary service bindings

## Best Practices

### 1. Test Naming

Use clear, descriptive test names:

```typescript
// ✅ Good
it('should return 404 when game does not exist', async () => {});

// ❌ Bad
it('test game endpoint', async () => {});
```

### 2. Arrange-Act-Assert

Structure tests with clear sections:

```typescript
it('should create a new game', async () => {
  // Arrange
  const gameData = { name: 'Arcs', bggUrl: 'https://...' };

  // Act
  const response = await SELF.fetch('http://localhost/api/games', {
    method: 'POST',
    body: JSON.stringify(gameData),
  });

  // Assert
  expect(response.status).toBe(201);
  const game = await response.json();
  expect(game.name).toBe('Arcs');
});
```

### 3. Clean Up After Each Test

Always clean up test data to prevent test pollution:

```typescript
afterEach(async () => {
  await cleanupTestDb();
});
```

### 4. Use Descriptive Test Data

Make test data meaningful:

```typescript
// ✅ Good
const game = await createTestGame({
  name: 'Arcs',
  bggUrl: 'https://boardgamegeek.com/boardgame/arcs'
});

// ❌ Bad
const game = await createTestGame({
  name: 'Test Game 1'
});
```

### 5. Test Error Cases

Don't just test happy paths:

```typescript
describe('POST /api/games', () => {
  it('should create game with valid data', async () => {
    // Happy path
  });

  it('should return 400 with invalid name', async () => {
    // Error case
  });

  it('should return 409 if game already exists', async () => {
    // Error case
  });
});
```

### 6. Group Related Tests

Use `describe` blocks to organize:

```typescript
describe('Game API', () => {
  describe('POST /api/games', () => {
    it('should create game', async () => {});
    it('should validate input', async () => {});
  });

  describe('GET /api/games/:id', () => {
    it('should return game', async () => {});
    it('should return 404', async () => {});
  });
});
```

### 7. Avoid Test Interdependence

Each test should be independent:

```typescript
// ✅ Good
describe('Resource API', () => {
  it('should create resource', async () => {
    const game = await createTestGame();
    const resource = await createTestResource(game.id);
    // Test logic
  });

  it('should update resource', async () => {
    const game = await createTestGame();
    const resource = await createTestResource(game.id);
    // Test logic
  });
});

// ❌ Bad - second test depends on first
describe('Resource API', () => {
  let gameId;

  it('should create resource', async () => {
    const game = await createTestGame();
    gameId = game.id; // ⚠️ Shared state
  });

  it('should update resource', async () => {
    const resource = await createTestResource(gameId); // ⚠️ Depends on previous test
  });
});
```

## Troubleshooting

### Tests Fail with "table has no column named X"

This usually means test utilities are using fields that don't exist. The database schema comes directly from Drizzle migrations, so it should always be correct. Check:

1. Are test utilities (`createTestGame`, etc.) using the correct fields?
2. Have you run `pnpm test` after creating a new migration?

The migrations are applied automatically from `drizzle/` - you don't need to manually update any schema code!

### Tests Fail with "DB not found"

Make sure you're using the test entry point:

```typescript
// vitest.config.ts
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        main: './src/index.test.tsx', // ✅ Test entry point
      },
    },
  },
});
```

### Tests Fail with "Cannot read property of undefined"

Check that you're importing from `cloudflare:test`:

```typescript
// ✅ Correct
import { env, SELF } from 'cloudflare:test';

// ❌ Incorrect
import { env } from '../types'; // Wrong env!
```

### Tests Fail with LangChain UUID Import Errors

LangChain's UUID imports can fail in the Workers test environment. The project uses a shim to handle this:

```typescript
// vitest.config.ts
export default defineWorkersConfig({
  resolve: {
    alias: {
      '@langchain/core/dist/runnables/uuid': path.resolve(__dirname, './src/shims/langchain-uuid.ts'),
    },
  },
});
```

If you still encounter UUID import errors:
1. Check that `src/shims/langchain-uuid.ts` exists
2. Verify the alias is correctly configured in `vitest.config.ts`
3. Try clearing the Vite cache: `rm -rf node_modules/.vite`

### Vectorize Tests Fail Locally

Vectorize requires production binding:

```bash
pnpm test --experimental-vectorize-bind-to-prod
```

Or skip these tests:

```typescript
const hasVectorize = !!process.env.USE_PROD_VECTORIZE;

describe.skipIf(!hasVectorize)('Vectorize Tests', () => {
  // Tests here
});
```

### Slow Tests

- Reduce number of HTTP round trips
- Use `createTest*` helpers instead of full API calls
- Consider marking slow tests with `.slow()`:

```typescript
it.slow('should process large PDF', async () => {
  // Test that takes >5 seconds
}, 30000); // 30 second timeout
```

### Flaky Tests

Common causes:
- Test interdependence (shared state)
- Not cleaning up after tests
- Race conditions with async code
- Non-deterministic behavior (dates, random values)

Solutions:
- Use `afterEach` to clean up
- Make tests independent
- Mock time/random sources
- Add `await` to all async operations

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install

      - run: pnpm test:run
        env:
          # Optional: Include API keys for full test coverage
          # OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          # MISTRAL_API_KEY: ${{ secrets.MISTRAL_API_KEY }}
```

**Key points:**
- Use `pnpm test:run` for CI (not watch mode)
- API keys are optional - tests will skip if not provided
- Consider running API tests on a schedule to save costs

## Writing Your First Test

### 1. Create Test File

Create a file next to the code you're testing:

```
src/lib/
  game-logic.ts
  game-logic.test.ts  ← Test file
```

### 2. Write a Simple Test

```typescript
import { describe, it, expect } from 'vitest';
import { calculateScore } from './game-logic';

describe('Game Logic', () => {
  it('should calculate score correctly', () => {
    const score = calculateScore(10, 5);
    expect(score).toBe(50);
  });
});
```

### 3. Run the Test

```bash
pnpm test src/lib/game-logic.test.ts
```

### 4. Add More Tests

```typescript
describe('Game Logic', () => {
  it('should calculate score correctly', () => {
    const score = calculateScore(10, 5);
    expect(score).toBe(50);
  });

  it('should return 0 when multiplier is 0', () => {
    const score = calculateScore(10, 0);
    expect(score).toBe(0);
  });

  it('should handle negative values', () => {
    const score = calculateScore(-10, 5);
    expect(score).toBe(-50);
  });
});
```

### 5. Add Integration Test

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { setupTestDb, cleanupTestDb } from '@/test-utils/setup';

describe('Game API', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  it('should create a new game', async () => {
    const response = await SELF.fetch('http://localhost/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Arcs' }),
    });

    expect(response.status).toBe(201);
    const game = await response.json();
    expect(game.name).toBe('Arcs');
  });
});
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Cloudflare Workers Testing](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Vitest Pool Workers API](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples)
- [Drizzle ORM Testing](https://orm.drizzle.team/docs/get-started-sqlite)

## Summary

1. **Prefer integration tests** - Test real behavior, not mocks
2. **Mark API tests optional** - Use `describe.skipIf(!hasApiKey)`
3. **Use test bindings** - `cloudflare:test` provides in-memory services
4. **Use Vitest** - Modern, fast, integrated with Workers
5. **Clean up after tests** - Use `afterEach` to prevent test pollution
6. **Write descriptive tests** - Tests are documentation
7. **Test error cases** - Don't just test happy paths
