---
title: "oRPC Procedures"
description: "Type-safe RPC procedures using oRPC framework for server-side and client-side calls"
category: guides
tags: [orpc, rpc, api, procedures, type-safety]
last_updated: 2025-11-07
related:
  - /docs/guides/api-routes.md
  - /docs/guides/testing.md
---

# oRPC Procedures

GameGame uses [oRPC](https://orpc.unnoq.com) for type-safe Remote Procedure Calls (RPC). This provides an alternative to traditional REST API routes with full TypeScript type safety from server to client. Unlike REST routes which require manual type synchronization, oRPC procedures automatically infer types across the network boundary.

## Architecture Overview

oRPC procedures coexist with REST API routes (`app/api/`) but offer distinct advantages:

| Feature | oRPC Procedures | REST API Routes |
| ------- | --------------- | --------------- |
| Type safety | Full end-to-end type inference | Manual type definitions required |
| Client code | Auto-generated from server types | Manual API client implementation |
| Validation | Zod schemas with automatic validation | Manual validation in each route |
| Server-side calls | Direct function calls (no HTTP) | Must use HTTP even server-side |
| Use case | Admin UI, Server Components | Public APIs, webhooks, external clients |

## Directory Structure

```
lib/
├── procedures/
│   ├── base.ts           # Base procedures (publicProcedure, authedProcedure, adminProcedure)
│   ├── router.ts         # Combined router exporting all procedures
│   ├── client.ts         # Browser HTTP client (Client Components)
│   ├── server.ts         # Server-side direct client (Server Components)
│   ├── games.ts          # Game-related procedures
│   ├── resources.ts      # Resource-related procedures
│   ├── attachments.ts    # Attachment-related procedures
│   └── bgg.ts            # BoardGameGeek integration procedures
```

## Core Concepts

### Procedures vs Routes

**Procedures** are type-safe RPC functions:
```typescript
// Define once on server
export const list = publicProcedure
  .route({ method: 'GET', path: '/games' })
  .output(z.array(gameResponseSchema))
  .handler(async () => {
    return await db.select().from(games);
  });

// Call from client with full type safety
const gamesList = await orpc.games.list();
// gamesList is automatically typed as GameResponse[]
```

**REST Routes** require manual type management:
```typescript
// Server: app/api/games/route.ts
export async function GET() {
  return NextResponse.json(await db.select().from(games));
}

// Client: Must manually define types
const response = await fetch('/api/games');
const gamesList: GameResponse[] = await response.json(); // Manual typing
```

### Base Procedures

Three base procedures provide authentication middleware:

```typescript
import { publicProcedure, authedProcedure, adminProcedure } from './base';

// No authentication required
export const list = publicProcedure.handler(async () => {
  return await db.select().from(games);
});

// Requires authenticated user
export const getProfile = authedProcedure.handler(async ({ context }) => {
  // context.user is guaranteed to exist
  return context.user;
});

// Requires admin user
export const deleteGame = adminProcedure.handler(async ({ context, input }) => {
  // context.user.isAdmin is guaranteed to be true
  await db.delete(games).where(eq(games.id, input.id));
});
```

Authentication is checked via JWT session tokens in `lib/session.ts`.

## Creating Procedures

### Basic Procedure Pattern

Every procedure follows this structure:

```typescript
import { z } from 'zod';
import { ORPCError } from '@orpc/server';
import { publicProcedure } from './base';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';

/**
 * List all games with resource counts
 */
export const list = publicProcedure
  // 1. Define HTTP route (optional but recommended)
  .route({
    method: 'GET',
    path: '/games',
  })
  // 2. Define output schema (automatic validation)
  .output(z.array(gameResponseSchema))
  // 3. Implement handler
  .handler(async () => {
    const gamesList = await db
      .select()
      .from(games)
      .orderBy(games.name);

    return gamesList;
  });
```

### Procedure with Input

Accept and validate input parameters:

```typescript
export const get = publicProcedure
  .route({
    method: 'GET',
    path: '/games/{idOrSlug}',
  })
  // Input schema automatically validates and types parameters
  .input(
    z.object({
      idOrSlug: z.string(),
    })
  )
  .output(gameResponseSchema)
  .handler(async ({ input }) => {
    // input.idOrSlug is typed and validated
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, input.idOrSlug))
      .limit(1);

    if (!game) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Game not found',
      });
    }

    return game;
  });
```

### Protected Procedures

Use `adminProcedure` for admin-only operations:

```typescript
export const create = adminProcedure
  .route({
    method: 'POST',
    path: '/games',
  })
  .input(createGameSchema)
  .output(gameResponseSchema)
  .handler(async ({ input, context }) => {
    // context.user is automatically populated by adminProcedure middleware
    console.log(`Admin ${context.user.email} creating game`);

    const gameId = nanoid();

    await db.insert(games).values({
      id: gameId,
      name: input.name,
      slug: generateSlug(input.name),
    });

    const [newGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    return newGame;
  });
```

### Complex Input Schemas

Nested objects and path parameters:

```typescript
export const update = adminProcedure
  .route({
    method: 'PATCH',
    path: '/games/{id}',
  })
  .input(
    z.object({
      id: z.string(),           // Path parameter
      data: updateGameSchema,   // Request body
    })
  )
  .output(gameResponseSchema)
  .handler(async ({ input }) => {
    // input.id and input.data are both validated and typed
    const [existingGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, input.id))
      .limit(1);

    if (!existingGame) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Game not found',
      });
    }

    await db
      .update(games)
      .set({ ...input.data, updatedAt: Date.now() })
      .where(eq(games.id, input.id));

    const [updatedGame] = await db
      .select()
      .from(games)
      .where(eq(games.id, input.id))
      .limit(1);

    return updatedGame;
  });
```

## Error Handling

### Standard Error Codes

Use `ORPCError` with consistent error codes:

```typescript
import { ORPCError } from '@orpc/server';

// Not found (404)
throw new ORPCError({
  code: 'NOT_FOUND',
  message: 'Game not found',
});

// Unauthorized (401)
throw new ORPCError({
  code: 'UNAUTHORIZED',
  message: 'You must be logged in',
});

// Forbidden (403)
throw new ORPCError({
  code: 'FORBIDDEN',
  message: 'Admin access required',
});

// Validation error (400)
throw new ORPCError({
  code: 'BAD_REQUEST',
  message: 'Invalid input',
  cause: zodError,
});

// Internal error (500)
throw new ORPCError({
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Failed to process request',
});
```

### Error Codes Mapping

| oRPC Code | HTTP Status | Usage |
| --------- | ----------- | ----- |
| `BAD_REQUEST` | 400 | Invalid input, validation failures |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Authenticated but lacking permissions |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Resource already exists, constraint violation |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server errors |

### Automatic Validation Errors

Zod validation errors are automatically thrown by oRPC:

```typescript
export const create = adminProcedure
  .input(
    z.object({
      name: z.string().min(1).max(255),
      year: z.number().int().min(1900).max(2100),
    })
  )
  .handler(async ({ input }) => {
    // If input doesn't match schema, oRPC automatically throws BAD_REQUEST
    // No manual validation needed
  });
```

## Client Usage

### Browser Client (Client Components)

Use `orpc` client in Client Components for HTTP calls:

```typescript
"use client";

import { orpc } from "@/lib/procedures/client";
import { useState, useEffect } from "react";

export default function GameList() {
  const [games, setGames] = useState([]);

  useEffect(() => {
    // Full type safety - games is automatically typed
    orpc.games.list().then(setGames);
  }, []);

  async function handleDelete(gameId: string) {
    try {
      // Input types are checked, output types are inferred
      const result = await orpc.games.deleteGame({ id: gameId });
      console.log(result.message);
    } catch (error) {
      // Error is typed as ORPCError
      console.error('Delete failed:', error);
    }
  }

  return (
    <div>
      {games.map(game => (
        <div key={game.id}>
          {game.name}
          <button onClick={() => handleDelete(game.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

The browser client makes HTTP requests to `/api/rpc` (configured in `lib/procedures/client.ts`).

### Server Client (Server Components)

Use server-side client in Server Components for direct calls (no HTTP overhead):

```typescript
import { server } from "@/lib/procedures/server";

export default async function GamePage({
  params
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;

  // Direct function call (no HTTP request)
  const game = await server.games.get({ idOrSlug: gameId });

  return (
    <div>
      <h1>{game.name}</h1>
      <p>Resources: {game.resourceCount}</p>
    </div>
  );
}
```

Server-side calls bypass HTTP entirely and execute procedures directly, making them faster and more efficient for Server Components.

### Error Handling on Client

```typescript
import { orpc } from "@/lib/procedures/client";

async function createGame(name: string) {
  try {
    const game = await orpc.games.create({ name });
    return { success: true, game };
  } catch (error) {
    // ORPCError provides structured error info
    if (error instanceof Error) {
      if (error.message.includes('NOT_FOUND')) {
        return { success: false, error: 'Game not found' };
      }
      if (error.message.includes('UNAUTHORIZED')) {
        return { success: false, error: 'Not authenticated' };
      }
    }
    return { success: false, error: 'Unknown error occurred' };
  }
}
```

## Router Configuration

### Combining Procedures

The router (`lib/procedures/router.ts`) combines all procedures:

```typescript
import * as gamesProcedures from './games';
import * as resourcesProcedures from './resources';
import * as attachmentsProcedures from './attachments';
import * as bggProcedures from './bgg';

export const router = {
  games: gamesProcedures,
  resources: resourcesProcedures,
  attachments: attachmentsProcedures,
  bgg: bggProcedures,
};

export type Router = typeof router;
```

This creates a namespaced API:
- `orpc.games.list()` → `gamesProcedures.list`
- `orpc.games.get()` → `gamesProcedures.get`
- `orpc.resources.list()` → `resourcesProcedures.list`

### Server-Side Callable Router

For Server Components, procedures must be made callable:

```typescript
function makeCallable(procedures: Record<string, any>) {
  const result: Record<string, any> = {};
  for (const [key, proc] of Object.entries(procedures)) {
    if (proc && typeof proc.callable === 'function') {
      // Pass empty context - middleware will populate it
      result[key] = proc.callable({});
    } else {
      result[key] = proc;
    }
  }
  return result;
}

export const callableRouter = {
  games: makeCallable(gamesProcedures),
  resources: makeCallable(resourcesProcedures),
  attachments: makeCallable(attachmentsProcedures),
  bgg: makeCallable(bggProcedures),
};
```

This allows direct procedure invocation without HTTP layer in Server Components.

## Testing Procedures

### Unit Testing Handlers

Test procedures by calling them directly:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { cleanupTestDb } from '@/tests/db-helpers';
import * as gamesProcedures from '@/lib/procedures/games';

describe('games.list', () => {
  afterEach(cleanupTestDb);

  it('returns list of games', async () => {
    // Call procedure handler directly
    const games = await gamesProcedures.list.handler({
      input: undefined,
      context: {},
    });

    expect(Array.isArray(games)).toBe(true);
  });
});

describe('games.create', () => {
  afterEach(cleanupTestDb);

  it('creates game with valid input', async () => {
    const game = await gamesProcedures.create.handler({
      input: {
        name: 'Arcs',
        year: 2024,
      },
      context: {
        user: { userId: 'test', email: 'test@test.com', isAdmin: true },
      },
    });

    expect(game.name).toBe('Arcs');
    expect(game.year).toBe(2024);
  });

  it('throws on invalid input', async () => {
    await expect(
      gamesProcedures.create.handler({
        input: {
          name: '', // Too short
          year: 2024,
        },
        context: {
          user: { userId: 'test', email: 'test@test.com', isAdmin: true },
        },
      })
    ).rejects.toThrow();
  });
});
```

### Testing Authorization

Test middleware authorization checks:

```typescript
import { ORPCError } from '@orpc/server';

describe('games.create authorization', () => {
  it('requires admin user', async () => {
    await expect(
      gamesProcedures.create.handler({
        input: { name: 'Arcs' },
        context: {
          user: { userId: 'test', email: 'test@test.com', isAdmin: false },
        },
      })
    ).rejects.toThrow(ORPCError);
  });

  it('requires authentication', async () => {
    await expect(
      gamesProcedures.create.handler({
        input: { name: 'Arcs' },
        context: {}, // No user in context
      })
    ).rejects.toThrow(ORPCError);
  });
});
```

### Integration Testing with Client

Test full HTTP flow using the browser client:

```typescript
import { orpc } from '@/lib/procedures/client';

describe('oRPC client integration', () => {
  it('lists games via HTTP', async () => {
    const games = await orpc.games.list();
    expect(Array.isArray(games)).toBe(true);
  });

  it('handles errors correctly', async () => {
    await expect(
      orpc.games.get({ idOrSlug: 'nonexistent' })
    ).rejects.toThrow();
  });
});
```

## Common Patterns

### Polymorphic Lookups

Support both ID and slug lookups:

```typescript
export const get = publicProcedure
  .input(z.object({ idOrSlug: z.string() }))
  .handler(async ({ input }) => {
    const [resource] = await db
      .select()
      .from(games)
      .where(or(
        eq(games.slug, input.idOrSlug),
        eq(games.id, input.idOrSlug)
      ))
      .limit(1);

    if (!resource) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Game not found',
      });
    }

    return resource;
  });
```

### Aggregated Counts

Include related counts in responses:

```typescript
export const list = publicProcedure
  .handler(async () => {
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

    return gamesList;
  });
```

### Cascading Deletes

Delete in order of foreign key dependencies:

```typescript
export const deleteGame = adminProcedure
  .input(z.object({ id: z.string() }))
  .handler(async ({ input }) => {
    const [game] = await db
      .select()
      .from(games)
      .where(eq(games.id, input.id))
      .limit(1);

    if (!game) {
      throw new ORPCError({
        code: 'NOT_FOUND',
        message: 'Game not found',
      });
    }

    // Database cascade deletes handle foreign keys automatically
    await db.delete(games).where(eq(games.id, input.id));

    return {
      success: true,
      message: `Game "${game.name}" deleted`,
    };
  });
```

### Workflow Integration

Trigger Vercel Workflows from procedures:

```typescript
import { start } from 'workflow/api';
import { processResourceWorkflow } from '@/workflows/process-resource';

export const reprocess = adminProcedure
  .input(z.object({
    resourceId: z.string(),
    fromStage: z.string().optional(),
  }))
  .handler(async ({ input }) => {
    const runId = nanoid();

    // Start async workflow
    await start(processResourceWorkflow, [
      {
        runId,
        resourceId: input.resourceId,
        fromStage: input.fromStage || 'ingest',
      },
    ]);

    return {
      success: true,
      runId,
      message: 'Reprocessing started',
    };
  });
```

## Best Practices

### Schema Reuse

Share schemas between procedures and REST routes:

```typescript
// lib/api/schemas.ts
export const gameResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  imageUrl: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const createGameSchema = z.object({
  name: z.string().min(1).max(255),
  year: z.number().int().min(1900).max(2100).optional(),
});

// Use in procedures
export const create = adminProcedure
  .input(createGameSchema)
  .output(gameResponseSchema)
  .handler(async ({ input }) => { /* ... */ });
```

### Document Procedures

Add JSDoc comments to procedures:

```typescript
/**
 * List all games with resource counts
 * Accessible to all users (no authentication required)
 */
export const list = publicProcedure
  .route({ method: 'GET', path: '/games' })
  .output(z.array(gameResponseSchema))
  .handler(async () => {
    // Implementation
  });

/**
 * Delete game and all associated data (admin only)
 * Cascades to resources, fragments, embeddings, and attachments
 */
export const deleteGame = adminProcedure
  .route({ method: 'DELETE', path: '/games/{id}' })
  .input(z.object({ id: z.string() }))
  .handler(async ({ input }) => {
    // Implementation
  });
```

### Type Exports

Export inferred types for use throughout application:

```typescript
// lib/procedures/games.ts
export type GameResponse = z.infer<typeof gameResponseSchema>;
export type CreateGameInput = z.infer<typeof createGameSchema>;

// Use in components
import type { GameResponse } from '@/lib/procedures/games';

export default function GameCard({ game }: { game: GameResponse }) {
  return <div>{game.name}</div>;
}
```

### Error Logging

Log errors before throwing:

```typescript
export const update = adminProcedure
  .handler(async ({ input }) => {
    try {
      // Business logic
    } catch (error) {
      console.error('[games.update] Error:', error);
      throw new ORPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update game',
        cause: error,
      });
    }
  });
```

## When to Use oRPC vs REST

### Use oRPC Procedures When:
- Building admin UI or internal tools
- Need full type safety from server to client
- Calling from Server Components (no HTTP overhead)
- Complex nested input/output types
- Want automatic validation and error handling

### Use REST API Routes When:
- Building public APIs for external clients
- Need to support non-TypeScript clients
- Implementing webhooks or callbacks
- Following strict RESTful principles
- Need explicit HTTP semantics (headers, status codes)

### Example Decision Matrix:

| Use Case | Recommendation | Reason |
| -------- | -------------- | ------ |
| Admin dashboard | oRPC | Type safety, internal use |
| Public game API | REST | External clients, OpenAPI docs |
| Server Component data fetching | oRPC | No HTTP overhead |
| Webhook endpoint | REST | External service calling in |
| Client Component form | oRPC | Validation, type inference |
| Third-party integration | REST | Language-agnostic |

## Troubleshooting

### Type Inference Issues

If types aren't inferring correctly, ensure the router type is exported:

```typescript
// lib/procedures/router.ts
export type Router = typeof router;

// lib/procedures/client.ts
import type { Router } from './router';
export const orpc = createORPCClient<Router>(link);
```

### Authentication Failures

Check JWT token is set correctly:

```typescript
// lib/session.ts - session management
import { cookies } from 'next/headers';

// Ensure cookie is set after login
cookies().set('session', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 30, // 30 days
});
```

### Server Client Not Working

Ensure procedures are made callable for server-side use:

```typescript
// lib/procedures/router.ts
export const callableRouter = {
  games: makeCallable(gamesProcedures),
  // ...
};

// lib/procedures/server.ts
import { callableRouter } from './router';
export const server = callableRouter;
```

## See Also

- [oRPC Official Documentation](https://orpc.unnoq.com)
- [API Routes Guide](./api-routes.md) - Traditional REST API implementation
- [Testing Guide](./testing.md) - Testing procedures and routes
- [Authentication](../explanation/architecture.md#authentication) - JWT session management
