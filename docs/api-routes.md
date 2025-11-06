# API Route Implementation Conventions

This document defines conventions for implementing and testing REST API endpoints in GameGame using Next.js App Router. It focuses on producing consistent, type-safe API routes that follow RESTful principles.

## 1. Directory Layout & Imports

| Path | Purpose |
| ---- | ------- |
| `app/api/` | **Single source of truth** for HTTP routes. Organized by resource hierarchy. |
| `lib/api/middleware.ts` | Shared middleware (`withAuth`, `withAdmin`, `withOptionalAuth`). |
| `lib/api/schemas.ts` | Zod schemas for request/response validation. |
| `lib/api/client.ts` | Type-safe client library for consuming APIs. |
| `lib/db/schema/` | Drizzle ORM database schemas. |

### 1.1 Import Policy

* **Absolute** imports for everything outside the current folder, e.g. `@/lib/api/middleware`.
* **Relative** (`./xxx`) only for siblings in the same API route folder.
* Never climb the tree with `../../..`.

```ts
import { withAdmin, errorResponse, successResponse } from '@/lib/api/middleware';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';
```

## 2. Route Structure & File Naming

### 2.1 File Organization

GameGame follows Next.js App Router conventions where each route is defined in a `route.ts` file:

| Pattern | Example | HTTP Methods |
| ------- | ------- | ------------ |
| Collection routes | `app/api/games/route.ts` | GET (list), POST (create) |
| Single resource routes | `app/api/games/[gameIdOrSlug]/route.ts` | GET (retrieve), PATCH (update), DELETE (delete) |
| Nested resources | `app/api/games/[gameIdOrSlug]/resources/route.ts` | GET (list), POST (create) |
| Action endpoints | `app/api/attachments/[attachmentId]/reprocess/route.ts` | POST (action) |

### 2.2 Directory Structure

```bash
app/api/
├── games/
│   ├── route.ts                           # GET /api/games, POST /api/games
│   └── [gameIdOrSlug]/
│       ├── route.ts                       # GET/PATCH/DELETE /api/games/:gameIdOrSlug
│       ├── resources/route.ts             # GET/POST /api/games/:gameIdOrSlug/resources
│       ├── attachments/route.ts           # GET /api/games/:gameIdOrSlug/attachments
│       └── chat/route.ts                  # POST /api/games/:gameIdOrSlug/chat
├── resources/
│   ├── upload/route.ts                    # POST /api/resources/upload
│   └── [resourceId]/
│       ├── route.ts                       # GET/PATCH/DELETE /api/resources/:resourceId
│       └── attachments/route.ts           # GET /api/resources/:resourceId/attachments
├── attachments/
│   └── [attachmentId]/
│       ├── route.ts                       # GET/PATCH /api/attachments/:attachmentId
│       └── reprocess/route.ts             # POST /api/attachments/:attachmentId/reprocess
└── auth/
    ├── me/route.ts                        # GET /api/auth/me
    ├── login/route.ts                     # POST /api/auth/login
    ├── logout/route.ts                    # POST /api/auth/logout
    └── refresh/route.ts                   # POST /api/auth/refresh
```

### 2.3 Naming Conventions

**Path Parameters**:
* Use descriptive, domain-specific names: `{gameIdOrSlug}`, `{resourceId}`, `{attachmentId}`
* Support polymorphic lookups where appropriate (e.g., both slug and ID for games)
* Never use generic `{id}` - be explicit about what entity is being referenced

**Route Files**:
* Always named `route.ts` (Next.js App Router requirement)
* Each file exports HTTP method handlers: `GET`, `POST`, `PATCH`, `PUT`, `DELETE`
* Include JSDoc comments at the top describing available endpoints

## 3. HTTP Method Semantics

| Method | Meaning | Typical Use Case |
| ------ | ------- | ---------------- |
| GET | Read | Retrieve resource(s), no side effects |
| POST | Create or Action | Create new resource or trigger action |
| PATCH | Partial Update | Update specific fields of a resource |
| PUT | Full Replace/Upsert | Replace entire resource (rarely used in GameGame) |
| DELETE | Remove | Delete resource and cascade as needed |

### 3.1 Collection vs Single Resource

**Collection Routes** (`/api/games`):
* GET: List multiple resources (with optional filtering/pagination)
* POST: Create new resource

**Single Resource Routes** (`/api/games/:gameIdOrSlug`):
* GET: Retrieve one resource
* PATCH: Update resource
* DELETE: Delete resource

### 3.2 Action Endpoints

For non-CRUD operations, use POST on a descriptive action path:

```typescript
// app/api/attachments/[attachmentId]/reprocess/route.ts
export const POST = withAdmin(async (request, user, props) => {
  // Trigger reprocessing workflow
});
```

## 4. Route Implementation Pattern

### 4.1 Standard Route Structure

Every route handler should follow this pattern:

```typescript
/**
 * GET /api/games
 * List all games with resource counts
 */
export async function GET() {
  try {
    // 1. Query database
    const results = await db
      .select({
        id: games.id,
        name: games.name,
        // ... other fields
      })
      .from(games)
      .orderBy(games.name);

    // 2. Return successful response
    return NextResponse.json(results);
  } catch (error) {
    // 3. Log and return error
    console.error('[GET /api/games] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    );
  }
}
```

### 4.2 Protected Routes with Middleware

Use `withAuth` or `withAdmin` for protected routes:

```typescript
/**
 * POST /api/games
 * Create a new game (admin only)
 */
export const POST = withAdmin(async (request, user, props) => {
  try {
    // 1. Parse and validate request body
    const body = await request.json();
    const data = createGameSchema.parse(body);

    // 2. Perform business logic
    const gameId = nanoid();
    await db.insert(games).values({
      id: gameId,
      name: data.name,
      // ... other fields
    });

    // 3. Return created resource
    const [newGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    return successResponse(newGame, 201);
  } catch (error) {
    // 4. Handle validation errors explicitly
    if (error instanceof z.ZodError) {
      return errorResponse('Validation error', 400, 'VALIDATION_ERROR', error.issues);
    }

    console.error('[POST /api/games] Error:', error);
    return errorResponse('Failed to create game', 500, 'INTERNAL_ERROR');
  }
});
```

### 4.3 Routes with Dynamic Parameters

Next.js 15 requires awaiting the `params` promise:

```typescript
/**
 * GET /api/games/:gameIdOrSlug
 * Get single game by ID or slug
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ gameIdOrSlug: string }> }
) {
  try {
    // 1. Await params (Next.js 15 requirement)
    const params = await props.params;
    const { gameIdOrSlug } = params;

    // 2. Support polymorphic lookups (slug OR id)
    const [game] = await db
      .select()
      .from(games)
      .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
      .limit(1);

    // 3. Handle not found
    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(game);
  } catch (error) {
    console.error('[GET /api/games/:gameIdOrSlug] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game' },
      { status: 500 }
    );
  }
}
```

### 4.4 Protected Routes with Parameters

When using middleware with dynamic parameters:

```typescript
/**
 * PATCH /api/games/:gameId
 * Update game (admin only)
 */
export const PATCH = withAdmin(async (
  request: NextRequest,
  user,
  props?: { params: Promise<{ gameIdOrSlug: string }> }
) => {
  try {
    // 1. Validate props exists (TypeScript safety)
    if (!props) {
      return errorResponse('Invalid request', 400, 'INVALID_REQUEST');
    }

    // 2. Await params
    const params = await props.params;
    const { gameIdOrSlug } = params;

    // 3. Parse body
    const body = await request.json();
    const data = updateGameSchema.parse(body);

    // 4. Verify resource exists
    const [existingGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameIdOrSlug))
      .limit(1);

    if (!existingGame) {
      return errorResponse('Game not found', 404, 'NOT_FOUND');
    }

    // 5. Update resource
    await db
      .update(games)
      .set({ ...data, updatedAt: Date.now() })
      .where(eq(games.id, gameIdOrSlug));

    // 6. Return updated resource
    const [updatedGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameIdOrSlug))
      .limit(1);

    return successResponse(updatedGame);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation error', 400, 'VALIDATION_ERROR', error.issues);
    }

    console.error('[PATCH /api/games/:gameId] Error:', error);
    return errorResponse('Failed to update game', 500, 'INTERNAL_ERROR');
  }
});
```

## 5. Request Validation with Zod

All request bodies must be validated using Zod schemas defined in `lib/api/schemas.ts`:

```typescript
// lib/api/schemas.ts
export const createGameSchema = z.object({
  name: z.string().min(1).max(255),
  year: z.number().int().min(1900).max(2100).optional(),
  imageUrl: z.string().url().optional(),
  bggUrl: z.string().url().optional(),
});

export const updateGameSchema = createGameSchema.partial();
```

### 5.1 Query Parameters

Query parameters come as strings and should be coerced:

```typescript
// Example: ?limit=10&cursor=5
const searchParams = request.nextUrl.searchParams;
const limit = z.coerce.number().int().min(1).max(100).default(25).parse(
  searchParams.get('limit') || '25'
);
const cursor = searchParams.has('cursor')
  ? z.coerce.number().int().min(1).parse(searchParams.get('cursor'))
  : undefined;
```

### 5.2 Form Data

For file uploads and multipart forms:

```typescript
const formData = await request.formData();
const file = formData.get('file') as File;
const name = formData.get('name') as string || file.name;
const url = formData.get('url') as string | null;

// Validate
if (!file && !url) {
  return errorResponse('Either file or url must be provided', 400, 'VALIDATION_ERROR');
}
```

## 6. Error Handling

### 6.1 Standard Error Codes

Use consistent error codes across all routes:

| Code | Status | Usage |
| ---- | ------ | ----- |
| `VALIDATION_ERROR` | 400 | Zod validation failures, malformed input |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Authenticated but lacking permissions |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Resource already exists, constraint violation |
| `INTERNAL_ERROR` | 500 | Unexpected server errors |

### 6.2 Error Response Helper

Use the `errorResponse` helper for consistency:

```typescript
import { errorResponse } from '@/lib/api/middleware';

// Simple error
return errorResponse('Game not found', 404, 'NOT_FOUND');

// With details
return errorResponse(
  'Validation error',
  400,
  'VALIDATION_ERROR',
  zodError.issues
);
```

### 6.3 Error Handling Pattern

```typescript
try {
  // Your logic here
} catch (error) {
  // 1. Handle known error types first
  if (error instanceof z.ZodError) {
    return errorResponse('Validation error', 400, 'VALIDATION_ERROR', error.issues);
  }

  // 2. Log unexpected errors
  console.error('[ROUTE_NAME] Error:', error);

  // 3. Return generic error (don't leak internals)
  return errorResponse('Failed to perform operation', 500, 'INTERNAL_ERROR');
}
```

## 7. Authentication & Authorization

### 7.1 Middleware Options

Three middleware wrappers are available:

```typescript
import { withAuth, withAdmin, withOptionalAuth } from '@/lib/api/middleware';

// Requires any authenticated user
export const POST = withAuth(async (request, user, props) => {
  // user is guaranteed to be authenticated
  // user.userId, user.email, user.isAdmin available
});

// Requires admin user
export const POST = withAdmin(async (request, user, props) => {
  // user is guaranteed to be admin (isAdmin: true)
});

// Optional authentication
export const GET = withOptionalAuth(async (request, user, props) => {
  // user may be null
  if (user) {
    // Return personalized data
  } else {
    // Return public data
  }
});
```

### 7.2 Manual Authentication Checks

For routes that don't use middleware:

```typescript
import { getCurrentUser, requireAuth, requireAdmin } from '@/lib/session';

export async function GET() {
  // Get current user (may be null)
  const user = await getCurrentUser();

  // Require authentication (throws if not authenticated)
  const user = await requireAuth();

  // Require admin (throws if not admin)
  const admin = await requireAdmin();
}
```

## 8. Response Patterns

### 8.1 Success Responses

Use `successResponse` helper or `NextResponse.json`:

```typescript
import { successResponse } from '@/lib/api/middleware';

// Default 200 status
return successResponse(data);

// Custom status (e.g., 201 for created)
return successResponse(newGame, 201);

// Or directly with NextResponse
return NextResponse.json(data);
return NextResponse.json(data, { status: 201 });
```

### 8.2 List Responses

Return arrays directly, with optional metadata:

```typescript
// Simple list
return NextResponse.json(games);

// With pagination metadata (future)
return NextResponse.json({
  results: games,
  pagination: {
    total: 100,
    page: 1,
    pageSize: 25,
  },
});
```

### 8.3 Deletion Responses

Return confirmation with details:

```typescript
return successResponse({
  success: true,
  deletedResources: resourceIds.length,
  message: `Game "${game.name}" and ${resourceIds.length} resources deleted`,
});
```

## 9. Common Patterns

### 9.1 Polymorphic ID Lookups

Support both slug and numeric/nanoid IDs:

```typescript
const [resource] = await db
  .select()
  .from(games)
  .where(or(eq(games.slug, gameIdOrSlug), eq(games.id, gameIdOrSlug)))
  .limit(1);
```

### 9.2 Aggregated Counts

Include related counts in list responses:

```typescript
const gamesList = await db
  .select({
    id: games.id,
    name: games.name,
    resourceCount: sql<number>`COUNT(DISTINCT ${resources.id})`.mapWith(Number),
  })
  .from(games)
  .leftJoin(resources, eq(games.id, resources.gameId))
  .groupBy(games.id)
  .orderBy(games.name);
```

### 9.3 Cascading Deletes

Always delete in order of foreign key dependencies:

```typescript
// 1. Delete child embeddings
await db.delete(embeddings).where(inArray(embeddings.fragmentId, fragmentIds));

// 2. Delete fragments
await db.delete(fragments).where(inArray(fragments.resourceId, resourceIds));

// 3. Delete attachments (+ blob cleanup)
await db.delete(attachments).where(eq(attachments.gameId, gameId));

// 4. Delete resources
await db.delete(resources).where(eq(resources.gameId, gameId));

// 5. Finally delete parent game
await db.delete(games).where(eq(games.id, gameId));
```

### 9.4 Workflow Integration

Trigger workflows after resource creation:

```typescript
// Insert resource first
await db.insert(resources).values({ id: resourceId, ... });

// Trigger async workflow (fire-and-forget)
const workflowUrl = new URL('/api/workflows/process-resource', request.url);
const workflowResponse = await fetch(workflowUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ runId: nanoid(), resourceId, ... }),
});

if (!workflowResponse.ok) {
  console.error('Failed to trigger workflow:', await workflowResponse.text());
  // Don't fail the request - workflow will retry via cron
}
```

### 9.5 Blob Storage Integration

Always store blob keys in database for cleanup:

```typescript
import { uploadBlob } from '@/lib/services/blob-storage';

// Upload to blob storage
const blobKey = `resources/${resourceId}/source.pdf`;
await uploadBlob(blobKey, buffer, 'application/pdf');

// Store key in database
await db.insert(resources).values({
  id: resourceId,
  url: blobKey,  // or full URL from blob storage
  // ...
});

// On delete, clean up blobs
const attachments = await db
  .select({ blobKey: attachments.blobKey })
  .from(attachments)
  .where(eq(attachments.resourceId, resourceId));

// TODO: Implement bulk delete
// await bulkDelete(attachments.map(a => a.blobKey).filter(Boolean));
```

## 10. Testing Conventions

### 10.1 Test File Structure

* Test file: `<route>.test.ts` (e.g., `route.test.ts`)
* Use `describe` blocks for each HTTP method: `describe('GET /api/games', () => {})`
* Cover success cases, validation errors, auth failures, and edge cases

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { createTestGame, createTestResource } from '@/tests/fixtures';
import { cleanupTestDb } from '@/tests/db-helpers';

describe('GET /api/games', () => {
  afterEach(cleanupTestDb);

  it('returns list of games', async () => {
    const game = await createTestGame({ name: 'Arcs' });

    const response = await fetch('http://localhost:3000/api/games');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('Arcs');
  });
});

describe('POST /api/games', () => {
  afterEach(cleanupTestDb);

  it('creates game when authenticated as admin', async () => {
    // Test implementation
  });

  it('returns 401 when not authenticated', async () => {
    // Test implementation
  });

  it('returns 403 when authenticated as non-admin', async () => {
    // Test implementation
  });

  it('returns 400 on validation error', async () => {
    // Test implementation
  });
});
```

### 10.2 Mock External APIs

Mock OpenAI, Mistral, BGG, Resend using `tests/api-mocks.ts`:

```typescript
import { createMockFetch, openAI } from '@/tests/api-mocks';

const mockFetch = createMockFetch();

it('should generate embeddings', async () => {
  mockFetch.mockResolvedValueOnce(openAI.embeddings(['chunk1']));

  // Test your code

  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining('openai.com'),
    expect.any(Object)
  );
});
```

### 10.3 Test Database Setup

Use real PostgreSQL test database (not mocks):

```bash
# Test database is configured in docker-compose.yml
docker-compose up -d

# Run migrations on test database
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/test_gamegame pnpm db:migrate

# Run tests
pnpm test
```

## 11. Documentation Standards

### 11.1 Route File Headers

Every `route.ts` file must include JSDoc comments describing available endpoints:

```typescript
/**
 * Games API Routes
 * GET /api/games - List all games
 * POST /api/games - Create new game (admin)
 */
```

### 11.2 Handler Comments

Each exported handler should document its purpose:

```typescript
/**
 * GET /api/games
 * List all games with resource counts
 */
export async function GET() {
  // ...
}

/**
 * POST /api/games
 * Create a new game (admin only)
 */
export const POST = withAdmin(async (request, user, props) => {
  // ...
});
```

### 11.3 Inline Comments

Use comments for complex logic:

```typescript
// 1. Query database with aggregated counts
// 2. Support polymorphic lookups (slug OR id)
// 3. Delete in order of foreign key dependencies
```

## 12. See Also

* [Next.js App Router Documentation](https://nextjs.org/docs/app)
* [Drizzle ORM Documentation](https://orm.drizzle.team/docs)
* [Zod Schema Validation](https://zod.dev)
* [Testing Guide](./testing.md)
* [Architecture Overview](../CLAUDE.md)
