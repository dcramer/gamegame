# API Migration: Code Examples & Detailed Comparisons

## 1. Games List Endpoint

### OLD: `/api/games/route.ts`
```typescript
import { getAllGames } from "@/lib/actions/games";
import { NextResponse } from "next/server";
import { getRateLimiter } from "@/lib/ratelimiter";

const ratelimit = getRateLimiter(5, "60s");

export async function GET(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1").split(",")[0];
  const { limit, reset, remaining } = await ratelimit.limit(ip);
  const headers = {
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": reset.toString(),
    "Cache-Control": "public, s-maxage=60",
  };
  if (remaining <= 0) {
    return Response.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers }
    );
  }

  const gameList = await getAllGames();
  return NextResponse.json({ games: gameList }, { headers });
}
```

### NEW: `nextjs/app/api/games/route.ts`
```typescript
import { db } from '@/lib/db';
import { games, resources } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/helpers';

export async function GET() {
  try {
    const gamesList = await db
      .select({
        id: games.id,
        name: games.name,
        year: games.year,
        slug: games.slug,
        imageUrl: games.imageUrl,
        bggId: games.bggId,
        bggUrl: games.bggUrl,
        resourceCount: sql<number>`COUNT(DISTINCT ${resources.id})`.mapWith(Number),
        createdAt: games.createdAt,
        updatedAt: games.updatedAt,
      })
      .from(games)
      .leftJoin(resources, eq(games.id, resources.gameId))
      .groupBy(games.id)
      .orderBy(games.name);

    return NextResponse.json(gamesList);
  } catch (error) {
    console.error('[GET /api/games] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const data = createGameSchema.parse(body);
    
    // ... create game logic with validation
  } catch (error) {
    // ... error handling
  }
}
```

**Changes**:
- ✅ Added POST handler for game creation
- ✅ Uses Drizzle ORM with type-safe queries
- ✅ Includes resource count in response
- ✅ Better error handling with try/catch
- ✅ Zod validation for input
- ⚠️ Removed rate limiting from GET (now applied at edge)
- ✅ Added slug generation and BggId extraction

---

## 2. Upload Endpoint Consolidation

### OLD: `/api/images/upload/route.ts`
```typescript
import { requireAdmin } from "@/lib/auth/require-admin";
import { handleUpload } from "@/lib/uploads/server";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const jsonResponse = await handleUpload({
      request,
      allowedContentTypes: ["image/webp"],
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error(error);
    captureException(error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
```

### OLD: `/api/resources/upload/route.ts`
```typescript
import { requireAdmin } from "@/lib/auth/require-admin";
import { handleUpload } from "@/lib/uploads/server";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const jsonResponse = await handleUpload({
      request,
      allowedContentTypes: ["application/pdf"],
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error(error);
    captureException(error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
```

### NEW: `nextjs/app/api/upload/route.ts` (UNIFIED)
```typescript
import { uploadBlob } from '@/lib/services/blob-storage';
import { requireAdmin } from '@/lib/auth/helpers';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PDF_SIZE = 100 * 1024 * 1024;  // 100MB

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const url = new URL(request.url);
    const type = url.searchParams.get('type'); // 'image' or 'pdf'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Type-based validation
    if (type === 'image' && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }
    if (type === 'pdf' && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    // Size validation
    const maxSize = type === 'image' ? MAX_IMAGE_SIZE : MAX_PDF_SIZE;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File must be less than ${maxSize / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Upload to storage
    const blobKey = `${type === 'image' ? 'games' : 'uploads'}/${Date.now()}-${nanoid()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const url_result = await uploadBlob(blobKey, buffer, file.type);

    return NextResponse.json({
      url: url_result,
      blobKey,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('[POST /api/upload] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
```

**Changes**:
- ✅ Consolidated two endpoints into one
- ✅ Type filtering via query parameter instead of separate routes
- ✅ Better inline validation
- ✅ Clearer error messages
- ✅ Size limits enforced per type
- ✅ DRY principle applied

---

## 3. Health Check Endpoint

### OLD: `nextjs/app/api/health/route.ts`
```typescript
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { env } from "@/lib/env.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { status: "ok" | "error"; message?: string }> = {};

  // Check 1: Database connectivity
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { status: "ok" };
  } catch (error) {
    checks.database = {
      status: "error",
      message: error instanceof Error ? error.message : "Database connection failed",
    };
  }

  // Check 2: Required environment variables
  const requiredEnvVars = [
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "MISTRAL_API_KEY",
    "AUTH_SECRET",
    "AUTH_RESEND_KEY",
  ];

  const missingEnvVars = requiredEnvVars.filter((varName) => {
    const value = env[varName as keyof typeof env];
    return !value || (typeof value === "string" && value.trim() === "");
  });

  if (missingEnvVars.length === 0) {
    checks.environment = { status: "ok" };
  } else {
    checks.environment = {
      status: "error",
      message: `Missing required environment variables: ${missingEnvVars.join(", ")}`,
    };
  }

  // Check 3: Vector extension availability
  try {
    await db.execute(sql`SELECT * FROM pg_extension WHERE extname = 'vector'`);
    checks.vectorExtension = { status: "ok" };
  } catch (error) {
    checks.vectorExtension = {
      status: "error",
      message: "pgvector extension not available",
    };
  }

  // Determine overall status
  const allHealthy = Object.values(checks).every((check) => check.status === "ok");
  const status = allHealthy ? 200 : 503;

  return Response.json(
    {
      status: allHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status }
  );
}
```

### NEW: `nextjs/app/api/health/route.ts`
```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';

export async function GET() {
  const startTime = Date.now();

  try {
    // Test database connectivity by querying games
    await db.select().from(games).limit(1);

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok',
      },
      responseTime: `${responseTime}ms`,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'error',
        },
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: `${responseTime}ms`,
      },
      { status: 503 }
    );
  }
}
```

**Changes**:
- ✅ Simplified to focus on database connectivity (most critical check)
- ✅ Removed environment variable checks (now done at startup)
- ✅ Removed pgvector check (extension is required for app to work)
- ✅ Added response time metrics
- ✅ Cleaner, more focused health check
- ⚠️ Less comprehensive (tradeoff for simplicity)

---

## 4. NEW: Chat Endpoint Status

### MISSING: `/api/games/[gameId]/chat` (NOT MIGRATED)

**Old Implementation** (from HEAD~2):
```typescript
import { MODEL } from "@/constants";
import { getGame } from "@/lib/actions/games";
import { openai } from "@ai-sdk/openai";
import { streamText, convertToCoreMessages, stepCountIs } from "ai";
import { buildPrompt, getTools } from "@/lib/ai/prompt";
import { getRateLimiter } from "@/lib/ratelimiter";

const ratelimit = getRateLimiter(10, "30s");

export const maxDuration = 30;

/**
 * Chat endpoint is intentionally PUBLIC to reduce friction for users.
 * Abuse is prevented through IP-based rate limiting (10 requests per 30s).
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ gameId: string }> }
) {
  const params = await props.params;
  const { gameId } = params;

  const ip = (req.headers.get("x-forwarded-for") ?? "127.0.0.1").split(",")[0];
  const { limit, reset, remaining } = await ratelimit.limit(ip);
  
  if (remaining <= 0) {
    return Response.json(
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

  const game = await getGame(gameId);
  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }

  const { messages } = await req.json();

  const result = await streamText({
    model: openai(MODEL),
    system: buildPrompt(game),
    messages: convertToCoreMessages(messages),
    tools: getTools(gameId),
    stopWhen: stepCountIs(5),
    experimental_telemetry: {
      isEnabled: true,
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "X-RateLimit-Limit": limit.toString(),
      "X-RateLimit-Remaining": remaining.toString(),
      "X-RateLimit-Reset": reset.toString(),
    },
  });
}
```

**Status**: ❌ NOT MIGRATED TO NEW APP
**Impact**: Critical - Chat functionality completely missing

---

## 5. NEW: BGG Routes (Added Functionality)

### NEW: `/api/bgg/search/route.ts`
```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: 'Query must be at least 2 characters' },
      { status: 400 }
    );
  }

  const results = await searchBGGGames(query, {
    fetchThumbnails: false,
    apiKey: process.env.BGG_API_KEY,
  });

  return NextResponse.json({ results });
}
```

### NEW: `/api/bgg/games/[bggId]/route.ts`
```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { bggId: string } }
) {
  const { bggId } = params;
  const game = await getBGGGameDetails(parseInt(bggId), {
    apiKey: process.env.BGG_API_KEY,
  });
  return NextResponse.json(game);
}
```

### NEW: `/api/bgg/games/[bggId]/import/route.ts`
```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: { bggId: string } }
) {
  await requireAdmin();
  const { bggId } = params;
  
  // Fetch game details from BGG
  const gameDetails = await getBGGGameDetails(parseInt(bggId), {
    apiKey: process.env.BGG_API_KEY,
  });

  // Create game in database
  const gameId = nanoid();
  await db.insert(games).values({
    id: gameId,
    name: gameDetails.name,
    bggId,
    year: gameDetails.yearPublished,
    bggUrl: `https://boardgamegeek.com/boardgame/${bggId}`,
    imageUrl: null, // Could be enhanced to fetch BGG image
  });

  return NextResponse.json({ gameId }, { status: 201 });
}
```

**Impact**: ✅ NEW functionality that didn't exist before

---

## Summary of Changes

| Aspect | Old | New | Improvement |
|--------|-----|-----|-------------|
| **Database Access** | Function-based | Drizzle ORM | Type-safe queries |
| **Validation** | Manual checks | Zod schemas | Better error messages |
| **Upload Endpoints** | 2 separate | 1 unified | DRY principle |
| **Game Lookup** | ID only | ID or slug | Better UX |
| **Health Checks** | 3 checks | 1 focused | Simpler, faster |
| **BGG Integration** | None | 4 routes | New feature |
| **Attachments** | Implicit | 3 routes | Better API |
| **Code Organization** | Mixed | Modular | Better maintainability |
| **Test Coverage** | Low | 53 tests | Better reliability |

