# CLI Migration Audit: Workers → Next.js

## Executive Summary

The CLI from the Workers app has **NOT been migrated** to the Next.js app. The Workers app has a comprehensive CLI system with 7 commands across 4 resource types, while the Next.js app has:
- No CLI infrastructure
- Package.json references non-existent `cli/index.ts` file
- Database operations handled via server actions instead
- User management done through Makefile targets

## 1. Workers CLI Inventory

### Entry Point
- **File**: `/Users/dcramer/src/gamegame/workers/cli.ts`
- **Command**: `pnpm cli <resource> <action> [args]`
- **Execution**: Uses `tsx` to run TypeScript directly

### Command Structure

#### Resource: `games`
**File**: `/Users/dcramer/src/gamegame/workers/cli/commands/games.ts`

| Command | Purpose | Args | Implementation |
|---------|---------|------|-----------------|
| `games list` | List all games with resource counts | `[--remote]` | Executes Wrangler D1 SQL query |
| `games create <name>` | Create new game | `--bgg-url=<url>`, `--remote` | Generates nanoid, inserts game, verifies creation |

**Dependencies**: 
- Wrangler D1 for database
- SQL string execution via `execSync`

---

#### Resource: `resources`
**File**: `/Users/dcramer/src/gamegame/workers/cli/commands/resources.ts`

| Command | Purpose | Args | Implementation |
|---------|---------|------|-----------------|
| `resources create <game> <url>` | Upload PDF and start processing | `--name=<name>` | HTTP POST to `/api/resources/upload` |
| `resources status <job-id>` | Check processing status | None | HTTP GET `/api/resources/jobs/{jobId}` |
| `resources reprocess <resource-id>` | Reprocess single resource | `--from=<stage>` | HTTP POST `/api/resources/{id}/reprocess` |
| `resources reprocess-all` | Reprocess all resources | `--game=<slug>`, `--from=<stage>` | Fetches all resources, batches POST requests |

**Reprocess Stages**:
- `ingest` (default) - Full PDF extraction
- `vision` - Vision analysis 
- `cleanup` - Markdown cleanup
- `metadata` - Metadata generation
- `embed` - Chunking and embedding

**Dependencies**: 
- API endpoints in Workers runtime
- HTTP client (fetch)
- Async job processing backend

---

#### Resource: `users`
**File**: `/Users/dcramer/src/gamegame/workers/cli/commands/users.ts` (router)

##### Subcommand: `create`
**File**: `/Users/dcramer/src/gamegame/workers/cli/commands/create-user.ts`

| Command | Purpose | Args | Implementation |
|---------|---------|------|-----------------|
| `users create <email>` | Create new user | `--name="Full Name"`, `--admin`, `--remote` | Wrangler D1 SQL: Checks if exists, inserts, verifies |

**Details**:
- Uses UUID as user ID
- Supports optional display name
- Can grant admin on creation
- Works with local or remote database
- SQL injection protection via `escapeSql()`

---

##### Subcommand: `grant-admin`
**File**: `/Users/dcramer/src/gamegame/workers/cli/commands/grant-admin.ts`

| Command | Purpose | Args | Implementation |
|---------|---------|------|-----------------|
| `users grant-admin <email>` | Grant admin privileges | `--remote` | Wrangler D1 SQL file execution |

**Details**:
- Writes SQL to temp file
- Executes via `wrangler d1 execute --file=`
- Updates `is_admin = 1` and `updated_at`
- Verifies user exists and admin status set
- Cleans up temp file

---

##### Subcommand: `login-url`
**File**: `/Users/dcramer/src/gamegame/workers/cli/commands/login-url.ts`

| Command | Purpose | Args | Implementation |
|---------|---------|------|-----------------|
| `users login-url <email>` | Generate magic link | None | JWT signing with Hono |

**Details**:
- Creates JWT with 15-minute expiry
- Signs with JWT_SECRET from .dev.vars
- Returns URL: `http://localhost:4000/login/verify?token={token}`
- Uses Hono JWT library

---

#### Resource: `ask`
**File**: `/Users/dcramer/src/gamegame/workers/cli/commands/ask.ts`

| Command | Purpose | Args | Implementation |
|---------|---------|------|-----------------|
| `ask <game> <prompt>` | Ask LLM question about game | `--verbose` | HTTP POST to `/api/games/{game}/chat` with SSE streaming |

**Details**:
- Resolves game by ID or slug
- Streams SSE response
- Tracks timing metrics (request, stream, tool calls)
- Displays answer as JSON or plain text
- Shows verbose metrics: tokens, tool calls, step breakdown
- Pretty-prints tool call progress

**Features**:
- Tool call tracking and timing
- Performance metrics collection
- HTTP timing (request vs streaming)
- Step-by-step execution breakdown
- Token usage per step

---

### Scripts
**Files**: `/Users/dcramer/src/gamegame/workers/scripts/`

| Script | Purpose | Implementation |
|--------|---------|-----------------|
| `reset-local-db.js` | Reset local D1 database | Deletes `.wrangler` state dirs, re-runs migrations |
| `generate-favicon.ts` | Generate SVG favicons | Creates 4 favicon sizes from Lucide icon |
| `init-db.sh` | Initialize database | Bash wrapper around `pnpm db:migrate:local` |

---

### CLI Utilities
**File**: `/Users/dcramer/src/gamegame/workers/cli/utils.ts`

Provides:
- `loadDevVars()` - Load environment from `.dev.vars`
- `getApiUrl(isRemote)` - Get API URL (localhost:4000 or production)
- `getLocalD1()` - Get D1 database via Wrangler platform proxy
- `getLocalVectorize()` - Get Vectorize index (remote only)

---

## 2. Next.js CLI Inventory

### Entry Point
- **Package.json Reference**: `"cli": "tsx cli/index.ts"`
- **Status**: FILE DOES NOT EXIST
- **Directory**: `/Users/dcramer/src/gamegame/nextjs/cli/` does not exist

### Existing Infrastructure

#### Database Migration
**File**: `/Users/dcramer/src/gamegame/nextjs/lib/db/migrate.ts`

- Uses Drizzle ORM migrator
- Loads `.env.local` file
- Connects to PostgreSQL via connection string
- Runs migrations from `./drizzle/` directory
- Command: `pnpm db:migrate`

#### User Management
**Location**: `/Users/dcramer/src/gamegame/nextjs/Makefile`

| Command | Purpose | Implementation |
|---------|---------|-----------------|
| `make grant-admin` | Grant admin to user | Interactive prompt + direct PostgreSQL update |

**Details**:
- Prompts for email address
- Runs SQL: `UPDATE users SET admin = TRUE WHERE email = '...';`
- Uses Docker container: `docker exec -t gamegame-postgres-1`
- Sets `admin` column (boolean) not `is_admin` (integer)

#### Resource Management
**Location**: `/Users/dcramer/src/gamegame/nextjs/lib/actions/resources.ts`

- `createResource()` - Server action to process PDF
- Uses Mistral API for PDF extraction
- Generates embeddings with OpenAI
- Stores in PostgreSQL with vector search
- Async processing via workflow

#### Game Management
**Location**: `/Users/dcramer/src/gamegame/nextjs/lib/actions/games.ts`

- Server actions for game CRUD operations
- Integration with BGG API

---

## 3. Migration Status Matrix

| Workers Command | Next.js Equivalent | Status | Notes |
|-----------------|-------------------|--------|-------|
| `games list` | **NOT MIGRATED** | ❌ Missing | No CLI command; handled via admin UI |
| `games create` | **NOT MIGRATED** | ❌ Missing | No CLI command; handled via admin UI (`/admin/add-game`) |
| `resources create` | Server Action: `createResource()` | ⚠️ Partial | Functionality exists but not exposed as CLI |
| `resources status` | **NOT MIGRATED** | ❌ Missing | No job tracking equivalent |
| `resources reprocess` | **NOT MIGRATED** | ❌ Missing | No reprocessing capability in Next.js |
| `resources reprocess-all` | **NOT MIGRATED** | ❌ Missing | No batch reprocessing |
| `users create` | **NOT MIGRATED** | ❌ Missing | NextAuth handles user creation on first login |
| `users grant-admin` | `make grant-admin` | ✅ Migrated | Implemented as Makefile target (differs: uses `admin` boolean vs `is_admin` integer) |
| `users login-url` | **NOT MIGRATED** | ❌ Missing | NextAuth handles magic links automatically |
| `ask <game> <prompt>` | **NOT MIGRATED** | ❌ Missing | Chat functionality in web UI only |

---

## 4. Missing Commands (High Priority)

### P0: Database/Admin Commands
1. **`games list`** - List all games with metadata
2. **`games create <name>`** - Create game via CLI
3. **`users create <email>`** - Create user account
4. **`users grant-admin <email>`** - Grant admin privileges (exists but different implementation)

### P1: Resource Processing
5. **`resources create <game> <url>`** - Upload and process PDF
6. **`resources reprocess <resource-id>`** - Reprocess single resource
7. **`resources reprocess-all [--game=<slug>]`** - Batch reprocess all resources
8. **`resources status <job-id>`** - Check processing status

### P2: Development/Testing
9. **`ask <game> <prompt> [--verbose]`** - Test LLM responses from CLI
10. **`users login-url <email>`** - Generate test login links

---

## 5. Implementation Differences

### Architecture Changes

| Aspect | Workers | Next.js |
|--------|---------|---------|
| **Database** | Wrangler D1 (SQLite) | PostgreSQL |
| **Database Queries** | Raw SQL via `execSync` + wrangler | Drizzle ORM |
| **API Integration** | HTTP calls to local API | Direct server actions |
| **Authentication** | JWT tokens from .dev.vars | NextAuth v5 |
| **File Storage** | R2 (implied) | Vercel Blob / Local filesystem |
| **Vector DB** | Cloudflare Vectorize | PostgreSQL pgvector |
| **Async Jobs** | Background processing API | Vercel Workflows |
| **Config Loading** | `.dev.vars` manual parsing | `.env.local` via dotenv |

### CLI Technology Differences

| Aspect | Workers | Next.js (If Migrated) |
|--------|---------|----------------------|
| **SQL Execution** | Wrangler D1 CLI wrapper | Drizzle ORM client |
| **Column Names** | `is_admin` (integer 0/1) | `is_admin` (integer 0/1) but Makefile uses `admin` boolean |
| **User ID Format** | UUID v4 | nanoid (Workers also uses nanoid for games) |
| **Timestamps** | Unix epoch seconds (bigint) | Unix epoch milliseconds (bigint) |
| **Email Handling** | Manual SQL escaping | ORM-handled escaping |
| **HTTP API Calls** | Directly to Workers API | Could use server actions instead |
| **Job Status** | Backend HTTP API | Not yet implemented; needs Vercel Workflows |

### Schema Differences Found

**Users Table - Workers (D1)**:
```sql
is_admin INTEGER (0 or 1)
created_at BIGINT (Unix seconds)
updated_at BIGINT (Unix seconds)
```

**Users Table - Next.js (PostgreSQL)**:
```sql
is_admin INTEGER (0 or 1)  -- Same, but Makefile uses boolean 'admin' column
created_at BIGINT (Unix milliseconds)  -- Different: milliseconds not seconds
updated_at BIGINT (Unix milliseconds)  -- Different: milliseconds not seconds
```

**Users ID Format**:
- Workers: `randomUUID()` (standard UUID v4)
- Next.js: `nanoid()` (21 character string)

---

## 6. Code Quality Observations

### Workers CLI
- ✅ Well-organized command structure
- ✅ Proper error handling with descriptive messages
- ✅ Input validation
- ✅ SQL injection protection via `escapeSql()`
- ⚠️ String-based SQL construction (not type-safe)
- ⚠️ Heavy reliance on `execSync` (blocks main thread)
- ⚠️ JSON parsing from wrangler output (brittle)

### Proposed Next.js CLI
**Recommendations**:
- Use Drizzle ORM for type-safe queries
- Use async/await instead of execSync
- Create structured types for command inputs
- Use dedicated CLI library (e.g., Commander.js, Yargs) for routing
- Store configs in environment variables, not .dev.vars
- Handle PostgreSQL-specific features (arrays, jsonb, vectors)

---

## 7. File Locations Summary

### Workers App
```
/Users/dcramer/src/gamegame/workers/
├── cli.ts                           # Main entry point
├── cli/
│   ├── commands/
│   │   ├── games.ts
│   │   ├── resources.ts
│   │   ├── users.ts
│   │   ├── create-user.ts
│   │   ├── grant-admin.ts
│   │   ├── login-url.ts
│   │   └── ask.ts
│   ├── utils.ts
│   └── utils/
│       └── sse-stream.ts
├── scripts/
│   ├── reset-local-db.js
│   ├── generate-favicon.ts
│   └── init-db.sh
└── package.json               # Scripts: cli, db:generate, db:migrate:*, db:studio
```

### Next.js App
```
/Users/dcramer/src/gamegame/nextjs/
├── Makefile                         # Manual grant-admin target
├── package.json                     # cli script references non-existent cli/index.ts
├── lib/
│   ├── db/
│   │   ├── migrate.ts              # DB migration runner
│   │   └── schema/
│   │       ├── users.ts            # Schema definition
│   │       └── [others]
│   ├── actions/
│   │   ├── resources.ts            # createResource server action
│   │   ├── games.ts
│   │   └── [others]
│   └── services/                    # Business logic (not CLI)
└── drizzle/                         # Migrations directory (referenced by migrate.ts)
```

---

## 8. Recommendations

### Immediate Actions (MVP)

1. **Create CLI Infrastructure**
   - [ ] Create `/Users/dcramer/src/gamegame/nextjs/cli/index.ts` entry point
   - [ ] Create `/Users/dcramer/src/gamegame/nextjs/cli/commands/` directory
   - [ ] Choose CLI library: Commander.js (recommended) or Yargs
   - [ ] Create base command routing similar to Workers but using ORM

2. **Migrate Core Commands**
   - [ ] `games list` - Query games table with resource counts
   - [ ] `games create <name>` - Insert game with slug generation
   - [ ] `users grant-admin <email>` - Update user admin flag (fix schema inconsistency)
   - [ ] `resources create <game> <url>` - Expose server action via CLI

3. **Fix Schema Inconsistencies**
   - [ ] Align user table schema (timestamp units, admin column name)
   - [ ] Use consistent ID generation (nanoid vs UUID)
   - [ ] Document schema in migration files

### Short Term (P1)

4. **Implement Job Tracking**
   - [ ] Add job status queries to resources table
   - [ ] Implement `resources status <job-id>` command
   - [ ] Expose job progress via Vercel Workflows

5. **Add Resource Reprocessing**
   - [ ] Implement `resources reprocess <resource-id>` API endpoint
   - [ ] Add CLI command to trigger reprocessing
   - [ ] Implement `resources reprocess-all` with batch processing

6. **Testing Commands**
   - [ ] `ask <game> <prompt> [--verbose]` - Query chat API from CLI
   - [ ] Replicate Workers' verbose metrics output

### Medium Term (P2)

7. **Complete Migration**
   - [ ] Migrate all utility scripts from `/scripts/` directory
   - [ ] Create standardized logging similar to Workers
   - [ ] Add configuration management (replaces .dev.vars)

8. **Modernization**
   - [ ] Replace direct HTTP API calls with server actions
   - [ ] Replace command string routing with proper CLI routing library
   - [ ] Add interactive prompts for complex operations
   - [ ] Add batch operation support
   - [ ] Add dry-run capabilities

---

## 9. Complexity Estimates

| Command | Complexity | Est. Hours | Dependencies |
|---------|------------|-----------|--------------|
| CLI framework setup | Medium | 2-3 | Commander.js, routing |
| `games list` | Low | 1 | Drizzle query |
| `games create` | Low | 1-2 | Slug generation, validation |
| `users grant-admin` | Low | 1 | Schema fix, SQL update |
| `resources create` | Medium | 2-3 | Expose existing server action |
| `resources status` | Medium | 2-3 | Job tracking implementation |
| `resources reprocess` | High | 4-5 | Job handling, workflow integration |
| `resources reprocess-all` | High | 3-4 | Batch processing, queuing |
| `ask` command | Medium | 2-3 | SSE streaming, metrics |
| Overall CLI parity | **High** | **20-30 hours** | All above + testing |

---

## 10. Blockers & Risks

### Architectural
1. **Job Processing**: Workers has async job queue via API; Next.js needs Vercel Workflows equivalent
2. **Vector Storage**: Vectorize → pgvector transition requires compatibility testing
3. **File Storage**: R2 → Vercel Blob/local storage requires path handling updates
4. **Schema Mismatch**: User table has different timestamp units and admin column naming

### Technical
1. **No job tracking in Next.js**: Need to implement status/progress endpoints
2. **No reprocessing pipeline**: Need to refactor resource processing for re-entrancy
3. **Missing .dev.vars equivalent**: Next.js uses .env.local but with different loading

### Testing
1. **No existing CLI tests**: Need to add test coverage for commands
2. **Database state management**: CLI commands modify databases; need migration strategy
3. **Integration tests**: Need to test CLI against real PostgreSQL instance

---

## 11. Success Criteria

CLI migration is complete when:

- [ ] All 10 commands have Next.js equivalents (or documented deprecations)
- [ ] Package.json `cli` script points to working `cli/index.ts`
- [ ] All commands handle both local (dev) and remote (production) databases
- [ ] Schema inconsistencies resolved
- [ ] Job tracking implemented for resource processing
- [ ] Tests pass for all commands
- [ ] Documentation updated with new CLI syntax
- [ ] Backward compatibility path for existing automation scripts

---

## Appendix: Command Reference

### Workers Commands (Definitive)
```bash
pnpm cli games list                                    # List games
pnpm cli games create "Arcs" --bgg-url="https://..."  # Create game
pnpm cli resources create arcs https://...pdf          # Upload resource
pnpm cli resources status job-123                      # Check job
pnpm cli resources reprocess res-123 --from=embed      # Reprocess
pnpm cli resources reprocess-all --game=arcs           # Batch reprocess
pnpm cli users create user@example.com --admin         # Create user
pnpm cli users grant-admin user@example.com --remote   # Grant admin
pnpm cli users login-url user@example.com              # Get login link
pnpm cli ask arcs "How do I setup?" --verbose          # Ask LLM
```

### Next.js Makefile Commands (Current)
```bash
make setup                   # Install + create DBs + migrate
make reset-db               # Drop and recreate databases
make grant-admin             # Grant admin (interactive)
make db:generate            # Generate new migration
make db:migrate             # Run migrations
```

### Recommended Next.js CLI Pattern (Future)
```bash
pnpm cli games list
pnpm cli games create "Arcs" --bgg-url="https://..."
pnpm cli resources add arcs https://...pdf
pnpm cli resources status job-123
pnpm cli resources reprocess res-123 --from=chunks
pnpm cli admin grant-admin user@example.com
pnpm cli admin create-user user@example.com --name="User"
```

---

## Summary Statistics

| Metric | Workers | Next.js | Gap |
|--------|---------|---------|-----|
| CLI Commands | 10 | 0 | -10 |
| Command Files | 7 | 0 | -7 |
| Scripts | 3 | 0 | -3 |
| Utility Files | 2 | 0 | -2 |
| Database Support | D1 (SQLite) | PostgreSQL | Requires adapter |
| Migration Status | N/A | 0% | 100% required |

