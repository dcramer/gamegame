# app/api

## Purpose

REST API routes for the application. These are traditional HTTP endpoints that handle requests and return responses. Used for:
- External integrations (webhooks, callbacks)
- File uploads (with Vercel Blob integration)
- Chat streaming (AI SDK)
- Routes that need full HTTP control (headers, status codes, streaming)

## Constraints

### When to Use API Routes vs Server Actions

**Use API Routes when:**
- You need streaming responses (chat, SSE)
- You need custom HTTP headers or status codes
- External services need to call your endpoint (webhooks)
- You're implementing a public API
- You need fine-grained control over caching

**Use Server Actions when:**
- You're calling from React components
- You want automatic serialization
- You don't need custom HTTP behavior
- It's an internal operation (CRUD, mutations)

### Authentication & Authorization
- **MUST** check authentication for protected endpoints
- Use `requireAdmin()` helper from `/lib/auth/require-admin.ts`
- Return proper HTTP status codes (401, 403, etc.)
- Always validate request body with Zod or similar

### Response Format
- Use `NextResponse.json()` for JSON responses
- Set appropriate status codes
- Include rate limit headers when applicable
- Handle errors with try/catch and return error responses

### Rate Limiting
- Implement rate limiting for public endpoints
- Use Upstash Rate Limit or similar
- Return 429 status when limit exceeded
- Include rate limit headers in response

### File Organization

```
app/api/
  auth/[...nextauth]/   # NextAuth authentication
  games/
    [gameId]/
      chat/             # AI chat endpoint (streaming)
      resources/        # List resources for game
      route.ts          # Game CRUD operations
    route.ts            # List all games
  images/upload/        # Image upload endpoint
  resources/
    [resourceId]/       # Resource operations
      route.ts
    upload/             # PDF upload endpoint
  upload/               # Generic upload endpoint (new)
```

## Example Pattern

```typescript
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { captureException } from "@sentry/nextjs";
import { someService } from "@/lib/services/some-service";
import { z } from "zod";

// Define schema
const requestSchema = z.object({
  name: z.string(),
  data: z.unknown(),
});

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Authenticate
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    // 2. Parse and validate request
    const body = await request.json();
    const validated = requestSchema.parse(body);

    // 3. Process request (delegate to service)
    const result = await someService.process(validated);

    // 4. Return response
    return NextResponse.json(result, { status: 201 });

  } catch (error) {
    // 5. Handle errors
    console.error(error);
    captureException(error);

    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
```

## Rate Limiting Pattern

```typescript
import { getRateLimiter } from "@/lib/ratelimiter";

const ratelimit = getRateLimiter(10, "30s");

export async function POST(req: Request): Promise<NextResponse> {
  // Get IP for rate limiting
  const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1").split(",")[0];

  const { limit, reset, remaining } = await ratelimit.limit(ip);

  if (remaining <= 0) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      }
    );
  }

  // Continue with request...
}
```

## Streaming Response Pattern

```typescript
import { streamText } from "ai";

export async function POST(req: Request): Promise<Response> {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai("gpt-4"),
    messages,
  });

  return result.toUIMessageStreamResponse();
}
```

## Current API Routes

### `/api/auth/[...nextauth]`
- NextAuth.js authentication handler
- Handles login, logout, session management

### `/api/games/[gameId]/chat`
- **POST** - Stream chat responses with AI
- Rate limited (10 requests per 30 seconds)
- Uses AI SDK for streaming
- Integrates with RAG search

### `/api/games/[gameId]/resources`
- **GET** - List all resources for a game

### `/api/games`
- **GET** - List all games

### `/api/images/upload`
- **POST** - Upload .webp images
- Admin only
- Uses Vercel Blob or local storage

### `/api/resources/upload`
- **POST** - Upload PDF files
- Admin only
- Uses Vercel Blob or local storage

### `/api/upload` (NEW)
- **POST** - Generic upload endpoint
- Query parameter `?type=image` or `?type=pdf` to restrict file types
- Admin only
- Consolidates image/resource upload logic

## Anti-Patterns to Avoid

❌ **Don't** use API routes for simple mutations
```typescript
// BAD: Should be a server action instead
export async function POST(req: Request) {
  const { name } = await req.json();
  await db.insert(games).values({ name });
  return NextResponse.json({ success: true });
}
```

✅ **Do** use server actions for internal operations
```typescript
// GOOD: Use server action in lib/actions/games.ts
"use server";
export async function createGame(name: string) {
  await requireAdmin();
  return db.insert(games).values({ name }).returning();
}
```

❌ **Don't** forget error handling
```typescript
// BAD: Unhandled errors
export async function POST(req: Request) {
  const data = await someOperation(); // Could throw
  return NextResponse.json(data);
}
```

✅ **Do** wrap in try/catch
```typescript
// GOOD: Proper error handling
export async function POST(req: Request) {
  try {
    const data = await someOperation();
    return NextResponse.json(data);
  } catch (error) {
    captureException(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

❌ **Don't** expose sensitive errors to clients
```typescript
// BAD: Leaks internal details
catch (error) {
  return NextResponse.json(
    { error: error.message }, // Could expose database structure, etc.
    { status: 500 }
  );
}
```

✅ **Do** sanitize error messages
```typescript
// GOOD: Generic message for unexpected errors
catch (error) {
  console.error(error); // Log full error server-side
  captureException(error);

  const message = error instanceof ValidationError
    ? error.message // User-facing validation errors are OK
    : "An unexpected error occurred"; // Generic for everything else

  return NextResponse.json({ error: message }, { status: 500 });
}
```
