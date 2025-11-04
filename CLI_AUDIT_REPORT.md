# CLI Migration Audit: Workers → Next.js

**Date:** November 3, 2025  
**Status:** Comprehensive analysis of CLI migration from Workers app to Next.js app  
**Executive Summary:** 0 of 10 CLI commands migrated (0% complete). CLI directory doesn't exist in Next.js app.

---

## EXECUTIVE SUMMARY

### Current State
- **Workers CLI:** Fully functional with 10+ commands across 4 resource types
- **Next.js CLI:** Placeholder reference in package.json only - no implementation
- **Migration Progress:** 0 commands migrated, 0% completion
- **Migration Effort:** 6-9 days estimated (Phases 1-3)

### Key Findings
1. **Complete CLI gap** - Next.js has no CLI implementation yet despite package.json reference
2. **Architecture mismatch** - Workers uses D1 + HTTP API pattern, Next.js uses PostgreSQL + Server actions
3. **9 high/medium priority commands** need migration
4. **4 critical blockers** identified (auth context, job tracking, token generation, DB connection)
5. **Database access differs significantly** - D1 to PostgreSQL, no production flag support yet

### Recommendations
1. **Immediate:** Create CLI directory structure and Phase 1 infrastructure (1-2 days)
2. **High Priority:** Implement games, users grant-admin, ask commands (2-3 days)  
3. **Medium Priority:** Implement resources reprocessing and user management (3-4 days)
4. **Approve:** `--production` flag pattern for production database access
5. **Decide:** Whether to extract business logic to reusable utilities vs. CLI-specific implementations

---

## TABLE OF CONTENTS
1. [Workers CLI Inventory](#1-workers-cli-inventory)
2. [Next.js CLI Inventory](#2-nextjs-cli-inventory)
3. [Migration Status Table](#3-migration-status-table)
4. [Missing Commands](#4-missing-commands)
5. [Implementation Differences](#5-implementation-differences)
6. [Implementation Recommendations](#6-implementation-recommendations)
7. [Production Flag Implementation](#7-production-flag-implementation)
8. [File Locations Summary](#8-file-locations-summary)
9. [Critical Issues & Blockers](#9-critical-issues--blockers)
10. [Testing & Documentation](#10-testing-requirements)
11. [Conclusion](#12-conclusion--summary)

---

## 1. WORKERS CLI INVENTORY

### Overview
The Workers app has a well-organized CLI system at `/Users/dcramer/src/gamegame/workers/cli/` with:
- **Main entry point:** `cli.ts` (executable)
- **Commands directory:** `cli/commands/` (7 command files)
- **Utilities:** `cli/utils.ts` and `cli/utils/sse-stream.ts`
- **Package.json script:** `"cli": "tsx cli.ts"`
- **Total size:** ~36 KB of CLI code

### Command Directory Structure
```
workers/cli/
├── cli.ts (main entry point - 2 KB)
├── commands/
│   ├── ask.ts (9.7 KB)
│   ├── create-user.ts (4 KB)
│   ├── games.ts (5 KB)
│   ├── grant-admin.ts (2.6 KB)
│   ├── login-url.ts (1.2 KB)
│   ├── resources.ts (8 KB)
│   └── users.ts (1.2 KB)
└── utils/
    ├── utils.ts (1.6 KB)
    └── sse-stream.ts (2.9 KB)
```

### Detailed Command Inventory

#### 1. **games** Resource
**File:** `/Users/dcramer/src/gamegame/workers/cli/commands/games.ts`

| Command | Arguments | Description |
|---------|-----------|-------------|
| `games list` | `[--remote]` | List all games with resource counts |
| `games create` | `<name> [--bgg-url=<url>] [--remote]` | Create new game entry |

**Key Features:**
- SQL injection protection via `escapeSql()`
- Auto-slug generation from game name
- Resource count aggregation per game
- Local (`--local`) and production (`--remote`) support
- Formatted columnar output with alignment

**Sample Output:**
```
arcs        Arcs                  (2 resources)
chess       Chess                 (1 resource)
```

---

#### 2. **resources** Resource  
**File:** `/Users/dcramer/src/gamegame/workers/cli/commands/resources.ts`

| Command | Arguments | Description |
|---------|-----------|-------------|
| `resources create` | `<game-slug-or-id> <pdf-url> [--name=<name>]` | Upload PDF and start processing |
| `resources status` | `<job-id>` | Check background job status |
| `resources reprocess` | `<resource-id> [--from=<stage>]` | Reprocess single resource |
| `resources reprocess-all` | `[--game=<slug>] [--from=<stage>]` | Bulk reprocess all/filtered resources |

**Processing Stages:**
- `ingest` - Full reprocess from PDF extraction
- `vision` - Re-run vision analysis and subsequent
- `cleanup` - Re-run markdown cleanup and subsequent
- `metadata` - Re-run metadata generation and subsequent
- `embed` - Re-run chunking and embedding only (fastest)

**Key Features:**
- HTTP API endpoints for processing
- Returns job IDs for background tracking
- Progress monitoring via status endpoint
- Bulk operations with result summary
- Default stage: `embed` (minimal reprocessing)

---

#### 3. **users** Resource
**File:** `/Users/dcramer/src/gamegame/workers/cli/commands/users.ts`

| Command | Sub-command | Arguments | Description |
|---------|-------------|-----------|-------------|
| `users` | `create` | `<email> [--name="Name"] [--admin] [--remote]` | Create user account |
| `users` | `grant-admin` | `<email> [--remote]` | Grant admin privileges |
| `users` | `login-url` | `<email>` | Generate magic login link |

**Sub-command Details:**

##### 3a. **users create**
- Direct D1 database operations via `wrangler d1 execute`
- Email validation (requires @)
- Optional name and admin flag
- Generates random UUID for user ID
- Duplicate email checking
- Unix timestamp for created_at/updated_at
- Local/remote via `--remote` flag

**Sample:**
```bash
pnpm cli users create user@example.com --name="John Doe" --admin
```

##### 3b. **users grant-admin**
- Updates `is_admin` flag in D1 via SQL transaction
- Uses temporary SQL file for atomic operations
- Email-based lookup (case-insensitive)
- Returns updated user for verification
- Cleans up temporary SQL files
- Local/remote via `--remote` flag

**Sample:**
```bash
pnpm cli users grant-admin user@example.com --remote
```

##### 3c. **users login-url**
- Generates JWT tokens for passwordless login
- 15-minute expiry window
- Reads JWT_SECRET from `.dev.vars`
- Local only (no `--remote` flag)
- Returns URL: `http://localhost:4000/login/verify?token=<jwt>`

**Sample:**
```bash
pnpm cli users login-url user@example.com
```

---

#### 4. **ask** Resource
**File:** `/Users/dcramer/src/gamegame/workers/cli/commands/ask.ts`

| Command | Arguments | Description |
|---------|-----------|-------------|
| `ask` | `<game> <prompt> [--verbose]` | Ask AI question about game rulebook |

**Key Features:**
- Accepts game ID or slug as input
- SSE (Server-Sent Events) streaming response
- Real-time tool call tracking (Claude Code style display)
- **Verbose mode** displays:
  - Detailed tool execution events
  - HTTP timing breakdown
  - Performance metrics (tokens, latency)
  - Per-step token usage breakdown
- JSON response parsing with markdown support
- Performance metrics tracking and display

**Tool Display Example:**
```
● search_resources("How do I setup?")
  ⎿  325ms

● get_attachment(xyz123)
  ⎿  45ms
```

**Verbose Output Includes:**
- HTTP timing (request, stream, total)
- Token usage (prompt, completion, reasoning, total)
- Per-step breakdown with tool call details
- Performance metrics

---

### Supporting Utilities

#### `cli/utils.ts`
Functions:
- `loadDevVars()` - Parse `.dev.vars` environment variables
- `getApiUrl(isRemote)` - Return API URL (localhost:4000 or gamegame.ai)
- `getLocalD1()` - Get D1 database connection via Wrangler
- `getLocalVectorize()` - Get Vectorize index (remote only)

#### `cli/utils/sse-stream.ts`
Functions:
- `streamSSE(response)` - Async iterator for SSE events
- `collectTextFromSSE(stream, onEvent)` - Collect streamed text and metadata

Event Types:
- `text-delta` - Text chunk from streaming response
- `tool-call-start` - Tool execution start
- `tool-call-end` - Tool execution complete
- `message-metadata` - Response metadata
- `finish` - Stream complete marker

---

### Database Access (Workers)
- **Type:** SQLite (D1 in Cloudflare Workers)
- **Default:** Local D1 (via `.wrangler/state/v3/d1/`)
- **Production:** Remote D1 (via `--remote` flag)
- **Access Methods:**
  - Direct: `wrangler d1 execute` for games/users commands
  - HTTP API: Resources and ask commands use `/api/*` endpoints
  - HTTP ensures compatibility with async job processing

---

### Package.json Scripts (Workers)
```json
{
  "cli": "tsx cli.ts",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "pnpm db:migrate:local",
  "db:migrate:local": "wrangler d1 migrations apply gamegame --local",
  "db:migrate:remote": "wrangler d1 migrations apply gamegame --remote",
  "db:studio": "drizzle-kit studio"
}
```

---

### Makefile Shortcuts (Workers)
```makefile
games:              List all games (local)
games-remote:       List all games (production)
users:              Show users command help
migrate:            Run database migrations (local)
migrate-remote:     Run database migrations (production)
db-reset:           Reset local database
db-studio:          Open Drizzle Studio
```

---

## 2. NEXT.JS CLI INVENTORY

### Overview
The Next.js app **has a CLI placeholder reference but NO implementation**:
- **Package.json reference:** `"cli": "tsx cli/index.ts"`
- **Actual directory:** ❌ Does NOT exist - `/nextjs/cli/` missing
- **Current status:** 0 of 10 commands migrated
- **Partially available:** Server actions and API endpoints exist but not CLI-accessible

### Current Directory Structure
```
nextjs/
├── package.json (defines "cli": "tsx cli/index.ts")
├── lib/
│   ├── actions/ (server actions)
│   │   ├── games.ts (game CRUD operations)
│   │   ├── resources.ts (resource processing)
│   │   ├── bgg.ts (BoardGameGeek integration)
│   │   └── forms.ts
│   ├── db/
│   │   ├── migrate.ts (migration runner)
│   │   └── schema/
│   │       ├── users.ts
│   │       └── games.ts
│   ├── auth/
│   │   └── helpers.ts (auth checks)
│   ├── services/
│   │   ├── resource-processor.ts
│   │   ├── vision.ts
│   │   └── images.ts
│   └── workflows/
│       └── (resource processing workflows)
├── app/
│   ├── api/ (REST API routes)
│   │   ├── games/[gameIdOrSlug]/chat/route.ts (chat API)
│   │   ├── resources/[resourceId]/
│   │   └── workflows/process-resource/route.ts
│   └── admin/ (admin UI)
└── cli/ ❌ NOT CREATED YET
```

### Database Access (Next.js)
- **Type:** PostgreSQL (Docker container localhost:5432)
- **Default:** Via `DATABASE_URL` environment variable
- **ORM:** Drizzle ORM with postgres-js
- **Migration:** `tsx lib/db/migrate.ts` (direct PostgreSQL)
- **No production flag support** - would need `--production` flag added

---

### Existing Database Commands (Next.js)
```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx lib/db/migrate.ts",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio"
}
```

**migrate.ts Details:**
- Direct PostgreSQL migration via postgres-js
- Reads `DATABASE_URL` from environment
- No flag support for local vs. production distinction
- Loads `.env.local` automatically

---

### Makefile (Next.js)
```makefile
setup:              Complete first-time setup
reset-db:           Drop and recreate databases
migrate:            Run migrations
grant-admin:        Grant admin via psql (prompts for email)
```

**Note:** `grant-admin` is hardcoded psql command, not programmatic CLI

---

### Partially Available Components

#### Server Actions (lib/actions/)
- `games.ts` - Game CRUD (requires admin auth)
- `resources.ts` - Resource processing (requires admin auth)
- `bgg.ts` - BGG integration

**Issue:** These are server actions that:
1. Require NextAuth session context
2. Have `requireAdmin()` checks
3. Not directly CLI-accessible without refactoring

#### Auth Helpers (lib/auth/helpers.ts)
- `isAdmin()` - Check admin status
- `isAuthenticated()` - Check if authenticated
- `requireAdmin()` - Throw if not admin
- `getCurrentUser()` - Get current user from session
- `requireAuth()` - Throw if not authenticated

**Issue:** Session-dependent, not CLI-accessible

---

## 3. MIGRATION STATUS TABLE

| Workers Command | Next.js Status | Implementation | Notes |
|----------------|----------------|----------------|-------|
| `games list` | ❌ NOT MIGRATED | Need to create | DB query is straightforward |
| `games create` | ❌ NOT MIGRATED | Need to create | Server action exists, needs CLI wrapper |
| `resources create` | ❌ NOT MIGRATED | Partial (async action exists) | Uses Vercel Blob instead of R2 |
| `resources status` | ❌ NOT MIGRATED | None | No job tracking API yet |
| `resources reprocess` | ❌ NOT MIGRATED | Partial (action signature exists) | Workflow system exists but not CLI-exposed |
| `resources reprocess-all` | ❌ NOT MIGRATED | None | Needs implementation |
| `users create` | ❌ NOT MIGRATED | None | NextAuth auto-creates on first login |
| `users grant-admin` | ⚠️ PARTIAL | Makefile only | Hardcoded psql, not programmatic |
| `users login-url` | ❌ NOT MIGRATED | None | NextAuth uses different auth flow |
| `ask` | ❌ NOT MIGRATED | None | Chat API exists, needs HTTP client |
| `db:migrate` | ✅ EQUIVALENT | `tsx lib/db/migrate.ts` | Different tool, functionally similar |
| `db:studio` | ✅ EQUIVALENT | `drizzle-kit studio` | Works with PostgreSQL |

---

## 4. MISSING COMMANDS

### High Priority (Used Frequently)

#### 1. `games list` [HIGH - Low Complexity]
- **Purpose:** List all games with resource counts
- **Complexity:** Low (1 Drizzle query)
- **Location:** `/nextjs/cli/commands/games.ts`
- **Required Adaptations:**
  - Direct PostgreSQL query via Drizzle ORM
  - Count resources per game
  - Match Workers output formatting
  - Add `--production` flag support
- **Time Estimate:** 2-3 hours

#### 2. `games create` [HIGH - Low-Medium Complexity]
- **Purpose:** Create new game entry
- **Complexity:** Low-Medium
- **Location:** Can reuse or wrap `lib/actions/games.ts::createGame`
- **Required Adaptations:**
  - Option A: Wrap server action (faster but server context issue)
  - Option B: Direct DB insert via Drizzle (cleaner)
  - Remove session requirement for CLI
  - Add slug generation with validation
  - Output formatting and verification
  - Add `--production` flag support
- **Time Estimate:** 3-4 hours

#### 3. `users grant-admin` [HIGH - Low Complexity]
- **Purpose:** Grant admin privileges to user
- **Complexity:** Low
- **Location:** `/nextjs/cli/commands/users.ts`
- **Current State:** Hardcoded Makefile psql command (needs replacement)
- **Required Adaptations:**
  - Programmatic implementation (not shell)
  - Direct DB update via Drizzle
  - Email-based user lookup
  - Verification output
  - Add `--production` flag support
- **Time Estimate:** 2-3 hours

#### 4. `ask <game> <prompt>` [HIGH - Medium Complexity]
- **Purpose:** Test AI chat from CLI
- **Complexity:** Medium
- **Location:** `/nextjs/cli/commands/ask.ts`
- **Backend Status:** HTTP API exists at `/api/games/[gameIdOrSlug]/chat`
- **Required Adaptations:**
  - HTTP client (node-fetch or similar)
  - SSE stream parsing (can reuse Workers code)
  - Tool call display (Claude Code style)
  - Response formatting
  - Verbose mode for metrics
  - Add `--production` flag support (via API URL)
- **No database changes** - pure HTTP client implementation
- **Time Estimate:** 4-5 hours

### Medium Priority (Maintenance & Advanced)

#### 5. `users create` [MEDIUM - Medium Complexity]
- **Purpose:** Create user account
- **Complexity:** Medium
- **Note:** NextAuth auto-creates on first login - may be less critical
- **Required Adaptations:**
  - Direct database insert (bypass NextAuth)
  - Email validation
  - Optional name and admin flags
  - Return verification details
  - Add `--production` flag support
- **Time Estimate:** 3-4 hours

#### 6. `users login-url` [MEDIUM - Medium Complexity]
- **Purpose:** Generate magic login link
- **Complexity:** Medium (NextAuth token system)
- **Note:** NextAuth token generation differs from Workers JWT
- **Required Adaptations:**
  - Generate NextAuth-compatible tokens instead of JWT
  - Use SignIn provider flow OR create token endpoint
  - Return verification URL
- **Time Estimate:** 3-4 hours

#### 7. `resources reprocess[-all]` [MEDIUM - Medium-High Complexity]
- **Purpose:** Reprocess existing resources
- **Complexity:** Medium-High (workflow integration)
- **Location:** `/nextjs/cli/commands/resources.ts`
- **Backend Status:** Workflow system exists but not CLI-exposed
- **Required Adaptations:**
  - Trigger workflow from CLI
  - Job ID return and tracking
  - Status polling implementation
  - Stage selection (`--from=<stage>`)
  - Add `--production` flag support
- **Time Estimate:** 5-6 hours

#### 8. `resources status` [MEDIUM - Low-Medium Complexity]
- **Purpose:** Check background job status
- **Complexity:** Low-Medium
- **Location:** `/nextjs/cli/commands/resources.ts`
- **Required Adaptations:**
  - Workflow status query API (may not exist)
  - Format output with progress
  - Real-time polling option
- **Time Estimate:** 2-3 hours

### Low Priority (Setup & Utilities)

#### 9. `db:reset` [LOW - Low Complexity]
- **Purpose:** Drop and recreate databases
- **Status:** Makefile target exists
- **Note:** Less critical for development workflow
- **Time Estimate:** 1-2 hours

#### 10. `db:generate` [LOW - N/A]
- **Purpose:** Generate migrations
- **Status:** Already available as `pnpm db:generate`
- **Note:** Developers use npm script directly
- **Priority:** Skip - already accessible

---

## 5. IMPLEMENTATION DIFFERENCES

### Database Architecture
| Aspect | Workers | Next.js |
|--------|---------|---------|
| Type | SQLite (D1) | PostgreSQL |
| ORM | Drizzle ORM | Drizzle ORM |
| Access Method | `wrangler d1 execute` OR HTTP API | Direct psql OR Drizzle client |
| Local Storage | `.wrangler/state/v3/d1/` | Docker container (localhost:5432) |
| Remote Database | Cloudflare D1 | Needs `--production` flag implementation |
| Auth Method | D1 bindings (wrangler.toml) | `DATABASE_URL` environment variable |
| Migration Tool | `wrangler d1 migrations apply` | `tsx lib/db/migrate.ts` |

### Storage Architecture
| Aspect | Workers | Next.js |
|--------|---------|---------|
| Resource Blobs | R2 (Cloudflare) | Vercel Blob OR `/public/uploads` (local) |
| Attachment References | `attachment://{id}` | Same format, different backend |
| Image Processing | Cloudflare Workers | Node.js Sharp library |
| Blob Access | Wrangler R2 bindings | Environment variable or local fs |

### Authentication Architecture
| Aspect | Workers | Next.js |
|--------|---------|---------|
| Token Type | JWT (custom generation) | NextAuth session tokens |
| Token Storage | Local via JWT_SECRET | HTTP-only cookies + sessions table |
| User Creation | Manual CLI or login flow | Auto-create on first email login |
| Admin Flag | Direct SQL `UPDATE` | Drizzle ORM `db.update()` |
| Login Link | JWT in URL query param | NextAuth callback with email verification |
| Email Provider | Resend | Resend (same) |

### API Integration
| Aspect | Workers | Next.js |
|--------|---------|---------|
| Chat Streaming | HTTP → SSE | HTTP → SSE (same protocol) |
| Background Jobs | Workers KV/Queue simulation | Node.js workflows (lib/workflows) |
| AI Service | OpenAI (same) | OpenAI (same) |
| Vision/OCR | Mistral OCR API | Mistral OCR API (same) |

### Environment Variables
| Variable | Workers (.dev.vars) | Next.js (.env.local) |
|----------|-------------------|-------------------|
| Database | D1 binding | `DATABASE_URL` |
| API Keys | `OPENAI_API_KEY`, `MISTRAL_API_KEY` | Same |
| Storage | R2 binding | `BLOB_READ_WRITE_TOKEN` (optional) |
| Auth | `JWT_SECRET` | `AUTH_SECRET` |
| Email | Not in .dev.vars | `AUTH_RESEND_KEY` |

---

## 6. IMPLEMENTATION RECOMMENDATIONS

### Phase 1: Core CLI Infrastructure (1-2 days)

#### 1a. Create Directory Structure
```bash
mkdir -p /nextjs/cli/{commands,utils}
```

#### 1b. Create CLI Base Files
- `/nextjs/cli/index.ts` - Main entry point with resource/action routing
- `/nextjs/cli/utils/db.ts` - PostgreSQL client helper
- `/nextjs/cli/utils/env.ts` - Environment variable loading
- `/nextjs/cli/utils/sse-stream.ts` - Reuse from Workers (copy as-is)

#### 1c. Implement Argument Parsing
- Resource/action structure from Workers (`pnpm cli <resource> <action> [args]`)
- `--production` flag for database switching
- Help text and usage examples
- Error handling for missing arguments

#### 1d. Database Utilities
- Create PostgreSQL client instance
- Connection pooling (handle multiple CLI runs)
- Environment variable loading (DATABASE_URL, PRODUCTION_DATABASE_URL)

---

### Phase 2: High-Priority Commands (2-3 days)

#### Command 1: `games list` & `games create`
**File:** `/nextjs/cli/commands/games.ts`

```typescript
// Direct ORM queries (not server actions)
async function listGames(isProduction: boolean)
async function createGame(name: string, bggUrl?: string, isProduction: boolean)
```

**Implementation Notes:**
- Query games via Drizzle (no server action wrapper)
- Count resources per game in same query
- Match Workers formatting exactly
- Add `--production` flag support
- Slug generation validation

#### Command 2: `users grant-admin`
**File:** `/nextjs/cli/commands/users.ts`

```typescript
// Replace Makefile psql command
async function grantAdmin(email: string, isProduction: boolean)
```

**Implementation Notes:**
- Direct `db.update()` on users table
- Email-based lookup
- Verify result before success message
- Match Workers output formatting

#### Command 3: `ask <game> <prompt>`
**File:** `/nextjs/cli/commands/ask.ts`

```typescript
// HTTP client to chat API
async function ask(gameId: string, prompt: string, verbose: boolean, isProduction: boolean)
```

**Implementation Notes:**
- Use `node-fetch` or native `fetch`
- SSE stream parsing (reuse Workers code exactly)
- Tool call display with Claude Code style
- Verbose mode for performance metrics
- Match Workers output formatting

---

### Phase 3: Medium-Priority Commands (3-4 days)

#### Command 4: `resources reprocess[-all]`
**File:** `/nextjs/cli/commands/resources.ts`

```typescript
async function reprocessResource(resourceId: string, from?: string, isProduction: boolean)
async function reprocessAll(gameSlug?: string, from?: string, isProduction: boolean)
```

**Implementation Notes:**
- Trigger workflow API
- Poll for job status (may need to create status API)
- Support `--from=<stage>` option
- Format output similar to Workers

#### Command 5: `resources status`
**File:** `/nextjs/cli/commands/resources.ts` (extend)

```typescript
async function resourceStatus(jobId: string)
```

**Implementation Notes:**
- Query workflow job status
- Format progress output
- Real-time polling option

#### Command 6: `users create` & `users login-url`
**File:** `/nextjs/cli/commands/users.ts` (extend)

```typescript
async function createUser(email: string, name?: string, admin?: boolean, isProduction: boolean)
async function loginUrl(email: string)
```

**Implementation Notes:**
- Evaluate criticality (NextAuth auto-creates on login)
- If implementing: Direct DB insert + token generation
- `login-url` requires NextAuth token system understanding

---

### Implementation Architecture Decision

Three approaches available:

#### Option A: Server Actions Wrapper (Faster, 2-3 days)
- Wrap existing server actions in CLI handlers
- Reuse business logic, less duplication
- **Pros:** Faster development, single source of truth
- **Cons:** Server actions designed for server context, may break due to auth checks

#### Option B: Direct Database Access (Cleaner, 4-5 days)
- CLI commands query database directly via Drizzle
- Bypass server actions entirely
- **Pros:** Clean separation, no session dependencies
- **Cons:** Code duplication, maintenance overhead

#### Option C: Shared Utilities (Best, 3-4 days) ⭐ RECOMMENDED
- Create shared utility functions in `lib/cli/`
- Both server actions and CLI commands use them
- CLI commands pass `bypassAuth: true` flag
- **Pros:** Reuses logic, clean separation, best long-term
- **Cons:** Requires refactoring existing actions

**Recommendation:** **Use Option C** - best balance of speed and quality

---

## 7. PRODUCTION FLAG IMPLEMENTATION

### Current Workers Pattern
```bash
pnpm cli games list           # Uses local D1
pnpm cli games list --remote  # Uses production D1
```

### Proposed Next.js Pattern
```bash
pnpm cli games list           # Uses DATABASE_URL
pnpm cli games list --production  # Uses PRODUCTION_DATABASE_URL
```

### Implementation Strategy

#### In `cli/index.ts`:
```typescript
const isProduction = process.argv.includes('--production');

const dbUrl = isProduction 
  ? process.env.PRODUCTION_DATABASE_URL 
  : process.env.DATABASE_URL;

if (!dbUrl) {
  console.error(`Error: ${isProduction ? 'PRODUCTION_DATABASE_URL' : 'DATABASE_URL'} not set`);
  process.exit(1);
}

// Pass isProduction flag to each command
// Commands adjust API_URL or database connection accordingly
```

### Environment Variables Required
Add to `.env.local`:
```
# Local database (default)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gamegame

# Production database (requires --production flag)
PRODUCTION_DATABASE_URL=postgresql://prod-user:password@prod-host:5432/gamegame

# API URLs (for 'ask' command)
NEXT_PUBLIC_APP_URL=http://localhost:3000
PRODUCTION_API_URL=https://gamegame.ai
```

### Safety Considerations
1. Require explicit `--production` flag (no auto-detection)
2. Print warning: "⚠️  Running in PRODUCTION mode"
3. Document that production database should be restricted
4. Consider requiring environment variable confirmation
5. Add audit logging for production CLI operations

---

## 8. FILE LOCATIONS SUMMARY

### Workers App (Absolute Paths)
```
/Users/dcramer/src/gamegame/workers/
├── cli.ts                                    # Main entry point
├── package.json                              # "cli": "tsx cli.ts"
├── Makefile                                  # CLI shortcuts
├── cli/
│   ├── commands/
│   │   ├── ask.ts                           # (9.7 KB) Chat testing
│   │   ├── create-user.ts                   # (4 KB) User creation
│   │   ├── games.ts                         # (5 KB) Game management
│   │   ├── grant-admin.ts                   # (2.6 KB) Admin privileges
│   │   ├── login-url.ts                     # (1.2 KB) Magic links
│   │   ├── resources.ts                     # (8 KB) Resource management
│   │   └── users.ts                         # (1.2 KB) User router
│   └── utils/
│       ├── utils.ts                         # (1.6 KB) DB/env helpers
│       └── sse-stream.ts                    # (2.9 KB) SSE utilities
└── scripts/
    ├── generate-favicon.ts
    ├── init-db.sh
    └── reset-local-db.js
```

### Next.js App (Absolute Paths)
```
/Users/dcramer/src/gamegame/nextjs/
├── package.json                              # "cli": "tsx cli/index.ts"
├── Makefile                                  # Database commands only
├── lib/
│   ├── actions/
│   │   ├── games.ts                         # Game server actions
│   │   ├── resources.ts                     # Resource server actions
│   │   ├── bgg.ts                           # BGG integration
│   │   └── forms.ts
│   ├── auth/
│   │   └── helpers.ts                       # Auth utilities
│   ├── db/
│   │   ├── migrate.ts                       # Migration runner
│   │   └── schema/
│   │       ├── users.ts
│   │       └── games.ts
│   ├── services/
│   │   ├── resource-processor.ts
│   │   ├── vision.ts
│   │   └── images.ts
│   └── workflows/
│       └── (resource processing workflows)
├── app/
│   ├── api/
│   │   ├── games/[gameIdOrSlug]/
│   │   │   ├── chat/route.ts                # Chat API endpoint
│   │   │   └── route.ts
│   │   ├── resources/
│   │   │   └── [resourceId]/
│   │   │       └── reprocess/               # Workflow trigger
│   │   └── workflows/
│   │       └── process-resource/route.ts
│   └── admin/                                # Admin UI
│       ├── add-game/
│       ├── games/
│       └── resources/
└── cli/                                      # ❌ NOT YET CREATED
```

### CLI Directory to Create
```
/Users/dcramer/src/gamegame/nextjs/cli/
├── index.ts                                  # Main entry point (~150 lines)
├── commands/
│   ├── games.ts                             # Game list/create (~120 lines)
│   ├── resources.ts                         # Resource reprocess (~200 lines)
│   ├── users.ts                             # User management (~180 lines)
│   ├── ask.ts                               # AI chat testing (~300 lines)
│   └── help.ts                              # Help command (~50 lines)
└── utils/
    ├── db.ts                                 # Database helpers (~80 lines)
    ├── env.ts                                # Environment helpers (~60 lines)
    └── sse-stream.ts                         # Reuse from Workers (~80 lines)
```

---

## 9. CRITICAL ISSUES & BLOCKERS

### Blocker 1: Authentication Context ⚠️ CRITICAL
**Issue:** Server actions require NextAuth session context which is NOT available from CLI  
**Impact:** Cannot directly invoke `lib/actions/*` from CLI without refactoring  
**Symptoms:** `requireAdmin()` will throw "Authentication required" when called from CLI  
**Solutions:**
- Option A: Extract business logic to shared utilities without auth checks
- Option B: Create CLI-specific action variants with `bypassAuth` flag
- Option C: Build CLI commands with direct database access (bypass actions)
- **Recommended:** Option A (shared utilities) or Option C (direct DB)

---

### Blocker 2: Job Status Tracking API ⚠️ HIGH
**Issue:** Workers has `/api/resources/jobs/{jobId}` endpoint, Next.js workflows don't expose query API  
**Impact:** Cannot implement `resources status` command without new API  
**Current State:** Workflow system exists but status querying not implemented  
**Solution:**
1. Add workflow status query function to workflow system
2. Create GET `/api/workflows/jobs/{jobId}` endpoint
3. Or: Add status query to existing workflow trigger endpoint
**Time to Fix:** 1-2 hours

---

### Blocker 3: NextAuth Token Generation 🔴 MEDIUM
**Issue:** Workers generates custom JWT tokens, NextAuth uses different session system  
**Impact:** `users login-url` command needs different implementation  
**Workers Pattern:** Creates JWT with email, returns URL with token
**NextAuth Pattern:** Uses email provider flow with verification emails
**Solutions:**
- Option A: Bypass NextAuth, create custom token endpoint
- Option B: Use NextAuth's SignIn provider callback
- Option C: Generate debug tokens for development only
**Workaround for MVP:** Skip this command in Phase 2, implement in Phase 3

---

### Blocker 4: PostgreSQL Connection from CLI 🟡 LOW-MEDIUM
**Issue:** Drizzle ORM designed for server context, CLI needs direct connection  
**Current State:** `lib/db/migrate.ts` already solves this successfully  
**Solution:** Model after `migrate.ts` - create postgres-js client instance
**Implementation:** 5-10 lines in `cli/utils/db.ts`
**Status:** Low priority, easily solvable

---

## 10. TESTING REQUIREMENTS

### Unit Tests Needed
```typescript
// cli/commands/games.test.ts
- listGames() 
  - Empty database (no games)
  - With games (sorting, formatting)
  - Resource count aggregation
  - Production flag handling
- createGame()
  - Valid input (standard game)
  - Duplicate slug detection
  - Slug generation edge cases
  - BGG URL validation
  - Production flag handling

// cli/commands/users.test.ts
- grantAdmin()
  - User exists, becomes admin
  - User doesn't exist (error handling)
  - User already admin (idempotent)
  - Production flag handling

// cli/commands/ask.test.ts
- ask()
  - Valid game and prompt
  - Invalid game (404 handling)
  - SSE stream parsing
  - Tool call tracking
  - Response formatting
  - Verbose mode output
```

### Integration Tests
```bash
# Test with actual local database
pnpm test:cli

# Commands to test
pnpm cli games list
pnpm cli games create "Test Game" --bgg-url="https://..."
pnpm cli users grant-admin test@example.com
pnpm cli ask arcs "How many players?"
pnpm cli ask arcs "How many players?" --verbose

# Production flag tests
pnpm cli games list --production
pnpm cli users grant-admin test@example.com --production
```

---

## 11. DOCUMENTATION NEEDED

### User Documentation
1. **CLI help text** - For each command (auto-generated from --help)
2. **Quick start guide** - Common workflows
3. **Migration guide** - Workers → Next.js command mapping
4. **Production flag safety** - How to use --production responsibly
5. **Examples** - Real-world usage scenarios

### Developer Documentation
1. **CLI architecture** - Structure and patterns
2. **Adding new commands** - Step-by-step guide
3. **Database access patterns** - How to query efficiently
4. **Environment setup** - Local vs. production
5. **Troubleshooting** - Common issues

### In-Code Documentation
1. **JSDoc comments** - All exported functions
2. **Error messages** - Clear, actionable messages
3. **Input validation** - What's required/optional
4. **Examples** - Sample usage in comments

---

## 12. CONCLUSION & SUMMARY

### Current State
- **Workers CLI:** ✅ Fully functional with 10+ commands
- **Next.js CLI:** ❌ Placeholder only - 0 commands implemented
- **Migration Progress:** 0% - No commands migrated yet
- **Code Location:** `/Users/dcramer/src/gamegame/` (workers and nextjs directories)

### Key Findings

1. **Complete CLI Gap**
   - Next.js has npm script reference (`"cli": "tsx cli/index.ts"`) but directory doesn't exist
   - All 10 Workers CLI commands must be recreated for Next.js
   - No commands can be directly ported - architecture differs significantly

2. **Architecture Differences**
   - Database: D1 (SQLite) → PostgreSQL
   - Access: Wrangler D1 → postgres-js / Drizzle ORM
   - Storage: R2 → Vercel Blob or local fs
   - Auth: Custom JWT → NextAuth sessions
   - Jobs: HTTP API → Workflow system

3. **Command Priorities**
   - **High (2-3 days):** games list/create, users grant-admin, ask
   - **Medium (3-4 days):** resources reprocess, users create/login-url
   - **Low (1-2 days):** db:reset, db:generate (already available)

4. **Critical Blockers**
   - ⚠️ Auth context (server actions require NextAuth)
   - ⚠️ Job status API (workflow status endpoint needed)
   - 🔴 Token generation (NextAuth differs from JWT)
   - 🟡 Database connection (solvable, see migrate.ts)

---

### Migration Effort Estimate

| Phase | Tasks | Time | Status |
|-------|-------|------|--------|
| **Phase 1** | Infrastructure + argument parsing + DB utilities | 1-2 days | Blocking |
| **Phase 2** | games (list/create), users grant-admin, ask | 2-3 days | High priority |
| **Phase 3** | resources reprocess, users create/login-url | 3-4 days | Medium priority |
| **Testing** | Unit tests, integration tests, documentation | 2-3 days | Important |
| **Total** | Complete CLI migration | **8-12 days** | **Target: 2 weeks** |

---

### Recommended Next Steps

**This Week (Days 1-2):**
1. Approve `--production` flag pattern for database switching
2. Create CLI directory structure (`/nextjs/cli/`)
3. Implement Phase 1 infrastructure (argument parsing, DB utils)
4. Create first command stub for testing

**Next Week (Days 3-5):**
1. Implement Phase 2 commands (games, users grant-admin, ask)
2. Manual testing with local database
3. Add Makefile shortcuts

**Following Week (Days 6-9):**
1. Implement Phase 3 commands (resources, advanced user commands)
2. Full test coverage
3. Documentation
4. Plan Workers CLI deprecation

---

### Key Decisions Needed

1. **Server Action Refactoring** ❓
   - Should we extract business logic to reusable utilities?
   - Or use direct database access from CLI?
   - Impact on development time and code quality

2. **Production Flag Pattern** ❓
   - Approve `--production` flag for database switching?
   - How to handle production database access safely?
   - Audit logging requirements?

3. **Job Tracking API** ❓
   - Should we add workflow status query API now?
   - Or skip resource status command in MVP?
   - Timeline impact?

4. **User Creation** ❓
   - Is `users create` critical with NextAuth auto-creation?
   - Or optional for MVP?
   - Timeline savings: 3-4 hours

---

### Success Criteria

✅ All high-priority commands working locally  
✅ All commands support `--production` flag  
✅ CLI help text matches Workers version  
✅ No broken API dependencies  
✅ Unit + integration tests passing  
✅ Complete user and developer documentation  

---

## References

- **Workers CLI:** `/Users/dcramer/src/gamegame/workers/cli.ts` and `/workers/cli/commands/`
- **Next.js Current Structure:** `/Users/dcramer/src/gamegame/nextjs/lib/` and `/nextjs/app/`
- **CLAUDE.md:** Project context and architecture documentation

---

**Report Generated:** 2025-11-03  
**Status:** Ready for implementation planning
