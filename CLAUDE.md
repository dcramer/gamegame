# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GameGame is an LLM-powered board game assistant that helps players understand game rules. It's built with Next.js 15, uses OpenAI's GPT models, and implements a RAG (Retrieval-Augmented Generation) system with hybrid search combining full-text search and semantic embeddings.

## Development Commands

### Setup
```bash
pnpm install
docker-compose up -d          # Start local Postgres
make setup                    # Install deps and create databases
pnpm db:migrate              # Run database migrations
```

### Running the Application
```bash
pnpm dev                     # Start dev server with Turbopack
pnpm build                   # Production build
pnpm start                   # Start production server
pnpm lint                    # Run Next.js linter
```

### Database Operations
```bash
pnpm db:generate             # Generate new migration from schema changes
pnpm db:migrate              # Apply migrations
pnpm db:push                 # Push schema directly (dev only)
pnpm db:studio               # Open Drizzle Studio UI
make reset-db                # Drop and recreate databases
make grant-admin             # Grant admin privileges to user (prompts for email)
```

## PDF Extraction

The system uses the **Mistral OCR API** for PDF extraction:
- Fast: 3-5 seconds per PDF
- High quality: Preserves structure, tables, markdown
- Native page numbers
- Cost: $0.001/page
- Requires: `MISTRAL_API_KEY`

## Testing

See `docs/testing.md` for comprehensive testing guidelines.

**Philosophy**: Only mock external APIs (OpenAI, Mistral, BGG, Resend). Use real local services (PostgreSQL, Vercel KV, Blob storage).

**Quick start**:
```bash
pnpm test              # Watch mode
pnpm test:run          # CI mode
pnpm test:ui           # Visual UI
```

**Test patterns**:
- Unit tests: Next to code (e.g., `lib/pdf.test.ts`)
- Integration tests: In `tests/` directory
- Use fixtures from `tests/fixtures.ts`
- Mock external APIs with `tests/api-mocks.ts`
- Clean database with `afterEach(cleanupTestDb)`

**Test database setup**:
```bash
# Already configured in docker-compose.yml
docker-compose up -d

# Run migrations on test database
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/test_gamegame pnpm db:migrate
```

**Example test**:
```typescript
import { createTestGame, createTestResource } from '@/tests/fixtures';
import { cleanupTestDb } from '@/tests/db-helpers';
import { createMockFetch, openAI } from '@/tests/api-mocks';

const mockFetch = createMockFetch();

afterEach(cleanupTestDb);

it('should process resource', async () => {
  const game = await createTestGame({ name: 'Arcs' });
  mockFetch.mockResolvedValueOnce(openAI.embeddings(['chunk1']));

  // Test your code here
});
```

## Architecture

### Database Schema

The system uses PostgreSQL with five core tables:

- **games**: Board game metadata (name, image URL, BGG URL)
- **bgg_games**: Cached BoardGameGeek game data (metadata, images, publishers, designers)
  - Used to avoid repeated BGG API calls with 5-second rate limits
  - Automatically populated when fetching game details from BGG
- **resources**: Game rulebooks and materials (PDFs converted to text)
- **attachments**: Media extracted from resources (images, future: videos, audio)
  - Database-generated stable IDs (nanoid)
  - Stored in Vercel Blob at `resources/{resourceId}/attachments/{id}.png`
  - Metadata: type, mimeType, originalFilename, pageNumber, bbox, caption, dimensions
- **fragments**: Text chunks with embeddings for RAG search
  - Each resource is split into ~1000 character chunks using LangChain's `RecursiveCharacterTextSplitter`
  - Each fragment has both a vector embedding (1536 dimensions via OpenAI `text-embedding-3-small`) and a full-text search vector
  - Indexed with HNSW for vector search and GIN for full-text search
  - Contains JSONB `images` field with attachment metadata for this chunk

### RAG System (`lib/ai/search.ts`)

The search uses **Hybrid Reciprocal Rank Fusion (RRF)** combining:
1. Full-text search using PostgreSQL's `ts_rank_cd` and `websearch_to_tsquery`
2. Semantic search using inner product on vector embeddings
3. Results are fused using RRF with k=50, returning top 10 most relevant fragments

### AI Prompt System (`lib/ai/prompt.ts`)

The LLM is given structured tools:
- `getKnowledge`: Searches the knowledge base using hybrid search
- `listResources`: Returns available rulebooks for a game
- `getAttachment`: Retrieves attachment (image/diagram) by ID from `attachment://` references

Response format is strictly enforced JSON with:
- `answer`: Markdown-formatted response
- `resources`: Array of resource references used
- `followUps`: Suggested follow-up questions
- `questionType`: Type of question being answered

The system only answers four categories of questions:
1. Gameplay Questions (rules, setup, mechanics)
2. Knowledge Questions (available resources)
3. External Resource Questions (where to find more info)
4. GameGame Questions (about the system itself)

### BoardGameGeek Integration (`lib/services/bgg.ts`)

BGG integration provides game metadata and images:
- **Rate limiting**: 5-second delay between requests (BGG requirement) via request queue
- **Database caching**: BGG data cached in `bgg_games` table to avoid repeated API calls
- **Image processing**: Downloads BGG images, converts to WebP (900x600, 85% quality) via Sharp
- **Search**: `searchBGGGames()` returns search results with optional thumbnails
- **Details**: `getBGGGameDetails()` fetches full game info (players, time, designers, publishers)
- API endpoints in `app/api/bgg/` provide search and import functionality

### API Architecture (`app/api/`, `lib/api/`)

The application uses a **REST API architecture** with JWT authentication:

#### API Routes (`app/api/`)
All CRUD operations go through API endpoints (no server actions):
- **Games**: `GET/POST /api/games`, `GET/PATCH/DELETE /api/games/:id`
- **Resources**: `GET/POST /api/games/:id/resources`, `GET/PATCH/DELETE /api/resources/:id`
- **Attachments**: `GET /api/resources/:id/attachments`, `GET/PATCH /api/attachments/:id`, `POST /api/attachments/:id/reprocess`
- **BGG**: `GET /api/bgg/search`, `POST /api/bgg/games/:bggId/import`
- **Auth**: `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/refresh`

#### Authentication Middleware (`lib/api/middleware.ts`)
Protected routes use JWT middleware wrappers:
```typescript
export const POST = withAdmin(async (request, user, props) => {
  // user is guaranteed to be admin
  // Automatic 401/403 responses for unauthorized access
});
```

Available middleware:
- `withAuth()`: Requires any authenticated user
- `withAdmin()`: Requires admin user (isAdmin: true)
- `withOptionalAuth()`: Optional authentication (user may be null)

#### API Client (`lib/api/client.ts`)
Type-safe client library for all API calls:
```typescript
import { api } from '@/lib/api/client';

// Automatic JWT cookie handling, error handling
const game = await api.games.get(gameId);
const games = await api.games.list();
await api.games.create({ name: 'Arcs', year: 2024 });
await api.games.update(id, { name: 'Updated' });
await api.games.delete(id);
```

All admin UI components use the API client instead of direct server actions.

## Data Storage and Rendering

### PDF Processing Pipeline

#### 1. PDF Extraction (`lib/pdf.ts`)

When a PDF is uploaded, the Mistral OCR API extracts:
- **Text content**: Markdown-formatted text per page
- **Images**: Base64-encoded images with bounding boxes
- **Sections**: Markdown headings with hierarchy (e.g., "Setup > Player Setup")
- **Page metadata**: Dimensions, DPI

#### 2. Attachment Storage (`lib/services/images.ts`)

Attachments (images) are extracted and stored in database + Vercel Blob (or local filesystem):
- **Database**: `attachments` table with nanoid-generated IDs
- **Path structure**: `resources/{resourceId}/attachments/{dbId}.png`
- **Format**: Converted from base64 to PNG
- **Metadata stored**: type, mimeType, url, originalFilename, pageNumber, bbox, caption, dimensions
- **Association**: Attachments are linked to fragments via JSONB `images` arrays containing attachment metadata

#### 3. Attachment Reference Replacement (`lib/pdf.ts` - `replaceImageReferences()`)

During PDF processing, inline image markdown is replaced with custom syntax:
- **Original from Mistral**: `![alt text](img-0.jpeg)` or `![alt text](data:image/png;base64,...)`
- **Replaced with**: `![alt text](attachment://{databaseId})`
- **Purpose**: Allows markdown to reference stored attachments by stable database ID
- **Tool access**: LLM can call `getAttachment(id)` to retrieve attachment URL and metadata
- **Lookup**: Attachment metadata (including URLs) is stored in fragment's `images` JSONB field for performance

#### 4. Smart Chunking (`lib/services/chunking.ts`)

The markdown is intelligently chunked while preserving metadata:
- **Strategy**:
  - Small pages (<1500 chars, ≤1 section): Keep as single chunk
  - Multi-section pages: Split by section boundaries
  - Large sections: Use RecursiveCharacterTextSplitter with 1000 char chunks, 100 char overlap
- **Metadata preserved per chunk**:
  - `pageNumber`: Exact page (1-indexed)
  - `pageRange`: [start, end] for multi-page chunks
  - `section`: Full hierarchy string (e.g., "Rules > Combat > Damage")
  - `images`: Array of image metadata for images on that page

#### 5. Database Storage

**resources table**:
```typescript
{
  id: string;
  gameId: string;
  name: string;
  url: string;
  content: string;           // Full markdown with attachment:// references
  version: number;           // Embedding version (currently 3)
  pdfExtractor: "mistral";

  // Denormalized stats (for performance)
  pageCount: number | null;
  imageCount: number;
  wordCount: number;
}
```

**fragments table**:
```typescript
{
  id: string;
  gameId: string;
  resourceId: string;
  content: string;           // Chunk text with attachment:// references
  embedding: number[];       // 1536-dim vector from text-embedding-3-small
  searchVector: tsvector;    // PostgreSQL full-text search vector
  version: number;           // Must match resource.version

  // Metadata
  pageNumber: number | null; // Single page number
  pageRange: [number, number] | null; // For multi-page chunks
  section: string | null;    // Heading hierarchy
  images: Array<{            // Images relevant to this chunk
    id: string;
    url: string;
    bbox?: number[];
    caption?: string;
  }> | null;
}
```

### Rendering Pipeline

When displaying content to users (e.g., in chat responses):

#### 1. Fragment Retrieval

The RAG system returns fragments with:
- `content`: Markdown with `attachment://{id}` references
- `images`: Array of attachment metadata (with URLs)
- `pageNumber`: For citations
- `section`: For context

#### 2. Attachment Resolution

The LLM has access to a `getAttachment(id)` tool to resolve attachments:

```typescript
// Example fragment content returned by getKnowledge:
"Setup requires 3-5 players. ![game board](attachment://xyz123)"

// Fragment images field contains (for context):
[{
  id: "xyz123",
  url: "https://blob.vercel.com/.../resources/abc/attachments/xyz123.png",
  bbox: [100, 200, 400, 600]
}]

// LLM workflow:
// 1. Sees attachment://xyz123 in the content
// 2. Calls getAttachment("xyz123") tool
// 3. Receives: { id, type, url, mimeType, caption, pageNumber }
// 4. Includes image in response: ![game board](https://blob.vercel.com/.../xyz123.png)
```

The LLM is instructed to:
- Call `getAttachment` when it sees `attachment://` references
- Include relevant images in its markdown response using actual URLs
- Only include images that help answer the user's question

#### 4. Citation Format

When the LLM cites sources, include:
- Page numbers: "(page 5)" or "(pages 3-5)"
- Section context: "(Setup > Player Setup)"
- Resource name: "[Arcs Rulebook, page 5]"

This information is available in the fragment metadata.

### Key Design Decisions

1. **Why custom attachment syntax?**
   - Markdown is stored in database with stable IDs, not data URLs or blob URLs
   - Allows attachments to be updated/moved without changing markdown
   - Reduces database size (references vs embedded data)
   - LLM can dynamically fetch attachment metadata via tool when needed

2. **Why both attachments table AND JSONB metadata?**
   - Attachments table: Provides stable IDs, deduplication, proper foreign keys
   - JSONB in fragments: Denormalized for performance - each fragment is self-contained with all attachment metadata it needs
   - Tradeoff: Slight storage overhead for faster queries (no joins needed during RAG search)

3. **Why denormalize stats?**
   - Avoid expensive aggregation queries on page load
   - Stats rarely change (only on reprocess)
   - ~3 integers per resource is minimal storage cost

4. **Why preserve page numbers and sections?**
   - Essential for accurate citations
   - Helps users find info in original PDF
   - Improves context for LLM responses

### Authentication (`auth.ts`, `lib/session.ts`, `lib/auth/jwt.ts`)

**NextAuth v5** handles passwordless email login:
- Resend email provider for magic link authentication
- Drizzle adapter for user/session persistence
- Admin flag on users (`isAdmin: boolean`)

**JWT Sessions** (`lib/session.ts`, `lib/auth/jwt.ts`):
- After NextAuth login, user sessions are managed via **JWT tokens**
- Tokens stored in **httpOnly cookies** (`session`) for security
- 30-day expiration with automatic refresh
- JWT signed with HS256 using `SESSION_SECRET` (via jose library)

**Session Functions** (`lib/session.ts`):
```typescript
// Get current user from JWT
const user = await getCurrentUser(); // { userId, email, isAdmin }

// Check authentication
if (await isAdmin()) { /* ... */ }
if (await isAuthenticated()) { /* ... */ }

// Require authentication (throws if not authenticated)
const user = await requireAuth();    // Any authenticated user
const admin = await requireAdmin();  // Admin only

// Session management
await createSession(userId);  // Called after NextAuth login
await destroySession();       // Logout
await refreshSession();       // Extend expiration
```

**Protected Routes**:
- API routes: Use `withAdmin()` or `withAuth()` middleware
- UI routes: Check `await requireAdmin()` in Server Components
- Client Components: Use API client (handles auth automatically)

### File Structure

```
app/                      # Next.js 15 App Router
  admin/                  # Admin UI for managing games and resources
  api/                    # REST API endpoints (games, resources, attachments, BGG, auth)
  games/[gameId]/         # Game-specific chat interface
lib/
  api/
    client.ts            # Type-safe API client library
    middleware.ts        # JWT authentication middleware (withAuth, withAdmin)
  auth/
    jwt.ts               # JWT signing/verification utilities
    helpers.ts           # Re-exports from session.ts
  session.ts             # Session management with JWT tokens
  ai/                    # AI prompt building and RAG search
  db/
    schema/              # Drizzle ORM schema definitions
  services/              # Business logic (BGG, images, chunking, blob storage, etc.)
  pdf.ts                 # PDF text extraction (Mistral OCR)
  env.mjs                # Environment variable validation (@t3-oss/env-nextjs)
components/              # React components (mostly Radix UI + Tailwind)
workflows/               # Vercel Workflows for async processing
tests/                   # API and integration tests
```

## Environment Variables

Required:
- `DATABASE_URL`: PostgreSQL connection string
- `OPENAI_API_KEY`: OpenAI API key for embeddings and chat
- `MISTRAL_API_KEY`: Mistral API key for PDF OCR extraction
- `AUTH_SECRET`: NextAuth secret (generate via `npx auth secret`)
- `AUTH_RESEND_KEY`: Resend API key for email authentication
- `SESSION_SECRET`: JWT signing secret, minimum 32 characters (generate via `openssl rand -base64 32`)

Optional:
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob storage (falls back to local `./public/uploads`)
- `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`: Vercel KV for rate limiting
- `CRON_SECRET`: Secret for Vercel Cron authentication (production only, generate via `openssl rand -base64 32`)

## Adding a New Game

### Via Admin UI (Preferred)
Navigate to `/admin/add-game` and either:

**Option 1: Search BGG**
1. Search for game by name
2. Select from search results (automatically fetches metadata and image from BGG)
3. Add PDF rulebook URL (automatically converted to markdown and chunked)

**Option 2: Manual Entry**
1. Enter game name and optional BGG URL
2. Upload high-res `.webp` icon (or automatically fetched from BGG if URL provided)
3. Add PDF rulebook URL (automatically converted to markdown and chunked)

### Manual Process
1. Create game entry in database via `/admin`
2. Upload rulebook PDF as a resource
3. System automatically chunks, embeds, and indexes content

## Vercel Workflows

GameGame uses Vercel Workflows for durable, long-running tasks. The workflow architecture strictly separates orchestration from execution:

### Structure

```
workflows/
  shared/
    types.ts           # Shared TypeScript types
    helpers.ts         # Helper functions (for steps only!)

  process-resource/
    index.ts           # 'use workflow' - pure coordination, NO Node.js deps
    steps/             # 'use step' - full Node.js runtime access
      ingest.ts
      vision.ts
      cleanup.ts
      metadata.ts
      embed.ts
      finalize.ts

  cleanup-stalled-jobs/
    index.ts
    steps/
      find-stalled-jobs.ts
      mark-jobs-failed.ts

  cleanup-orphaned-blobs/
    index.ts
    steps/
      collect-db-references.ts
      list-blobs.ts
      identify-orphaned.ts
      delete-orphaned.ts
```

### Critical Rules

1. **NEVER mix `'use workflow'` and `'use step'` in the same file**
2. **NEVER import Node.js modules (db, fs, APIs) in workflow files**
3. **ALWAYS put I/O operations in step files**

Workflows run in a sandboxed environment with no Node.js runtime access. Steps have full Node.js access.

See `workflows/AGENTS.md` for detailed architecture documentation and best practices.

### Existing Workflows

- **process-resource**: 6-stage PDF processing (ingest → vision → cleanup → metadata → embed → finalize)
- **cleanup-stalled-jobs**: Marks jobs stuck in processing state (>30min) as failed
- **cleanup-orphaned-blobs**: Removes blob storage files no longer referenced in database

Workflows are invoked by calling the workflow function directly (e.g., `processResourceWorkflow(input)`). The Vercel Workflow DevKit handles all routing automatically via `.well-known/workflow/*` endpoints.

## Important Notes

- **Migrations do not automatically apply in production** - must be run manually
- PDF extraction uses Mistral OCR API for high-quality markdown extraction
- BGG API calls are rate-limited to 5 seconds between requests - operations fetching multiple games will be slow
- BGG data is cached in the database to avoid repeated API calls
- The system uses React 19 and Next.js 15 with the React Compiler enabled
- Sentry is configured for error tracking
- The embedding version is tracked (`CURRENT_INDEX_VERSION = 2`) to allow re-indexing when the chunking strategy changes
