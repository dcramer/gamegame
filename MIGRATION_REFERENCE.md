# Database Schema Migration Reference

## Document Locations

### Main Report
- **Comprehensive Review**: `/Users/dcramer/src/gamegame/SCHEMA_MIGRATION_REVIEW.md`
  - Detailed table-by-table analysis
  - Column-level comparisons
  - Architecture changes
  - Migration issues and gaps

## Schema File Locations

### Old Schema (Workers/D1 - SQLite)
- **Main Schema**: `/Users/dcramer/src/gamegame/workers/src/lib/db/schema/d1.ts`
  - All 10 tables: games, resources, fragments, attachments, users, bgg_games
  - Uses SQLite Drizzle syntax
  - No vector embeddings or separate auth tables

- **Migrations**:
  - `/Users/dcramer/src/gamegame/workers/drizzle/0000_chubby_tana_nile.sql` (Initial schema)
  - `/Users/dcramer/src/gamegame/workers/drizzle/0001_add_answer_types_column.sql` (Adds answerTypes)

### New Schema (Next.js/PostgreSQL)
- **Individual Schema Files**: `/Users/dcramer/src/gamegame/nextjs/lib/db/schema/`
  - `games.ts` (9 columns)
  - `resources.ts` (16 columns)
  - `fragments.ts` (16 columns) ⚠️ Missing answerTypes
  - `attachments.ts` (15 columns)
  - `users.ts` (5 columns)
  - `bgg_games.ts` (13 columns)
  - `auth.ts` (accounts, sessions, verification_tokens)
  - `jobs.ts` (job queue management)
  - `embeddings.ts` (vector embeddings for RAG)
  - `index.ts` (exports all schemas)

- **Migrations**:
  - `/Users/dcramer/src/gamegame/nextjs/drizzle/0000_uneven_jamie_braddock.sql` (Initial schema with embeddings)
  - `/Users/dcramer/src/gamegame/nextjs/drizzle/0001_brief_silver_fox.sql` (Auth tables)

## Key Schema Differences

### Tables Comparison Summary

| Table | Old | New | Status |
|-------|-----|-----|--------|
| games | ✅ | ✅ | Complete |
| resources | ✅ | ✅ | Complete |
| fragments | ✅ | ⚠️ | Partial (missing answerTypes) |
| attachments | ✅ | ✅ | Complete |
| users | ✅ | ✅ | Complete |
| bgg_games | ✅ | ✅ | Complete |
| accounts | ❌ | ✅ | New (NextAuth v5) |
| sessions | ❌ | ✅ | New (NextAuth v5) |
| verification_tokens | ❌ | ✅ | New (NextAuth v5) |
| jobs | ❌ | ✅ | New (KV → Table) |
| embeddings | ❌ | ✅ | New (Vectorize → pgvector) |

## Critical Issues

### 1. Missing answerTypes Column
- **Location**: fragments table
- **Old**: Exists in D1 database (added via migration 0001)
- **New**: Missing from PostgreSQL schema
- **Risk**: Data loss during migration
- **Fix**: `ALTER TABLE fragments ADD COLUMN answer_types jsonb;`

### 2. Vector Embeddings
- **Old**: Cloudflare Vectorize (external service)
- **New**: PostgreSQL pgvector extension
- **Requirement**: Extension must be installed
- **Action**: Regenerate all embeddings (old format incompatible)

### 3. Full-Text Search
- **Old**: SQLite FTS5 with triggers
- **New**: PostgreSQL tsvector with GIN index
- **Action**: Recompute searchVector for all fragments

## Architecture Changes

### Infrastructure Changes
| Component | Old | New |
|-----------|-----|-----|
| Database | Cloudflare D1 (SQLite) | PostgreSQL |
| Vector Search | Cloudflare Vectorize | pgvector extension |
| Job Queue | Vercel KV | PostgreSQL jobs table |
| Storage | Cloudflare R2 | Vercel Blob (or local) |
| Authentication | Custom | NextAuth v5 |
| Full-Text Search | SQLite FTS5 | PostgreSQL tsvector |

### Data Type Conversions
- **Timestamps**: `integer` (mode: 'timestamp') → `bigint` (unix milliseconds)
- **JSON**: `text` (JSON strings) → `jsonb` (native PostgreSQL)
- **IDs**: `text` → `varchar(191)` (length constraint)
- **Booleans**: `integer` (mode: 'boolean') → `integer` (0/1) or `varchar`
- **Vectors**: N/A (Vectorize) → `vector(1536)` (pgvector)

## New Features

### NextAuth v5 Tables
- **accounts**: OAuth provider connections
- **sessions**: User sessions
- **verification_tokens**: Email verification

### Job Queue Table
- Replaced KV-based job tracking
- Structured fields: type, status, progress, error, metadata
- Indexed for efficient queries

### Vector Embeddings Table
- One table for all embeddings (content + questions)
- 1536-dimensional vectors (OpenAI text-embedding-3-small)
- IVFFlat indexing for similarity search
- Separate entries for HyDE synthetic questions

## Migration Checklist

- [ ] Review SCHEMA_MIGRATION_REVIEW.md for complete details
- [ ] Verify PostgreSQL version (13+)
- [ ] Install pgvector extension: `CREATE EXTENSION vector;`
- [ ] Install PostGIS extension: `CREATE EXTENSION postgis;`
- [ ] Add missing answerTypes column to fragments
- [ ] Create data migration script for D1 → PostgreSQL
- [ ] Regenerate all embeddings using OpenAI API
- [ ] Recompute full-text search vectors
- [ ] Test FTS ranking and relevance
- [ ] Verify all foreign key relationships
- [ ] Validate indexes created properly
- [ ] Test cascade deletes

## Database Connection Examples

### Old (Workers)
```typescript
import { drizzle } from 'drizzle-orm/d1';
const db = drizzle(env.DB);
```

### New (Next.js)
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);
```

## Extension Requirements (PostgreSQL)

```sql
-- Required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify installation
SELECT * FROM pg_extension WHERE extname IN ('vector', 'postgis');
```

## Query Pattern Changes

### Example: Vector Search
```typescript
// Old (Vectorize - external)
const results = await vectorize.query(embedding, { topK: 10 });

// New (pgvector - in PostgreSQL)
const results = await db
  .select()
  .from(embeddings)
  .orderBy(sql`embedding <=> ${embedding}::vector`)
  .limit(10);
```

### Example: Full-Text Search
```typescript
// Old (SQLite FTS5)
const results = await db.query.fragmentsFts.findMany({
  where: sql`fragments_fts MATCH 'search term'`
});

// New (PostgreSQL tsvector)
const results = await db
  .select()
  .from(fragments)
  .where(sql`search_vector @@ websearch_to_tsquery('english', 'search term')`);
```

## Support & Questions

For detailed information, refer to:
1. `/Users/dcramer/src/gamegame/SCHEMA_MIGRATION_REVIEW.md` - Complete analysis
2. Individual schema files in `/nextjs/lib/db/schema/`
3. Migration SQL files in `/nextjs/drizzle/`

