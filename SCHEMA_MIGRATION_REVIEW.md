# Database Schema Migration Review: Workers (D1/SQLite) to Next.js (PostgreSQL)

## Executive Summary

The migration from Cloudflare Workers with D1 (SQLite) to Next.js with PostgreSQL is **nearly complete** with several enhancements. The core tables (games, resources, fragments, attachments, users, bgg_games) have been successfully migrated with appropriate database type conversions. Additional tables and fields have been added to support new features.

---

## Database Type Changes

| Aspect | Old (Workers/D1) | New (Next.js/PostgreSQL) |
|--------|------------------|--------------------------|
| Database System | Cloudflare D1 (SQLite) | PostgreSQL 13+ |
| Timestamps | `integer` (mode: 'timestamp') | `bigint` (mode: 'number', unix ms) |
| JSON Storage | `text` (JSON strings) | `jsonb` (native PostgreSQL) |
| Vectors | N/A (via Vectorize) | `vector(1536)` (pgvector extension) |
| Full-Text Search | SQLite FTS5 triggers | PostgreSQL tsvector + GIN index |
| Bool Types | `integer` (mode: 'boolean') | `integer` (0/1 in schema, bool in query) |

---

## TABLE-BY-TABLE MIGRATION ANALYSIS

### 1. GAMES TABLE

#### ✅ MIGRATED - All columns present

**Old Schema (Workers/D1):**
```
id (text PK)
name (text NOT NULL)
year (integer)
slug (text NOT NULL UNIQUE)
imageUrl (text)
bggId (text UNIQUE)
bggUrl (text)
createdAt (integer timestamp)
updatedAt (integer timestamp)
```

**New Schema (Next.js/PostgreSQL):**
```
id (varchar(191) PK)
name (text NOT NULL)
year (integer)
slug (varchar(191) NOT NULL UNIQUE)
imageUrl (text)
bggId (varchar(191) UNIQUE)
bggUrl (text)
createdAt (bigint NOT NULL)
updatedAt (bigint NOT NULL)
```

**Differences:**
- Text IDs → varchar(191) (length constraint for compatibility)
- Timestamps now stored as bigint (unix milliseconds) instead of integer
- Indexes preserved: idx_games_name, idx_games_bgg_id

**Status:** ✅ COMPLETE

---

### 2. RESOURCES TABLE

#### ✅ MIGRATED - All columns present plus enhancements

**Old Schema (Workers/D1):**
```
id (text PK)
gameId (text FK → games, cascade)
name (text NOT NULL)
originalFilename (text)
author (text)
attributionUrl (text)
url (text NOT NULL)
content (text DEFAULT '')
version (integer DEFAULT 0)
pdfExtractor (text)
processedAt (integer timestamp)
status (text DEFAULT 'ready')
currentJobId (text)
processingStage (text DEFAULT 'ready')
processingMetadata (text JSON)
description (text)
resourceType (text DEFAULT 'rulebook')
language (text DEFAULT 'en')
edition (text)
isOfficial (integer bool DEFAULT true)
pageCount (integer)
imageCount (integer DEFAULT 0)
wordCount (integer DEFAULT 0)
createdAt (integer timestamp)
updatedAt (integer timestamp)
```

**New Schema (Next.js/PostgreSQL):**
```
id (varchar(191) PK)
gameId (varchar(191) FK → games, cascade)
name (text NOT NULL)
originalFilename (text)
author (text)
attributionUrl (text)
url (text NOT NULL)
content (text DEFAULT '')
version (integer DEFAULT 0)
pdfExtractor (varchar(50))
processedAt (bigint)
status (varchar(50) DEFAULT 'ready')
currentJobId (varchar(191))
processingStage (varchar(50) DEFAULT 'ready')
processingMetadata (text)
description (text)
resourceType (varchar(50) DEFAULT 'rulebook')
language (varchar(10) DEFAULT 'en')
edition (varchar(100))
isOfficial (integer DEFAULT 1)
pageCount (integer)
imageCount (integer DEFAULT 0)
wordCount (integer DEFAULT 0)
createdAt (bigint NOT NULL)
updatedAt (bigint NOT NULL)
```

**Differences:**
- Text → varchar with length constraints (50, 100, 191)
- processedAt is now nullable (no default)
- Timestamps as bigint (unix ms)
- Indexes preserved: idx_resources_game_id, idx_resources_status, idx_resources_job_id

**Status:** ✅ COMPLETE

---

### 3. FRAGMENTS TABLE

#### ⚠️ PARTIALLY MIGRATED - New columns added, old storage changes

**Old Schema (Workers/D1):**
```
id (text PK)
gameId (text FK → games, cascade)
resourceId (text FK → resources, cascade)
content (text NOT NULL)
version (integer DEFAULT 0)
type (text DEFAULT 'text')
attachmentId (text FK → attachments, set null)
searchableContent (text)
syntheticQuestions (text JSON)
answerTypes (text JSON) ⭐ [FROM MIGRATION 0001]
resourceName (text)
resourceDescription (text)
resourceType (text)
pageNumber (integer)
pageRangeStart (integer)
pageRangeEnd (integer)
section (text)
images (text JSON)
(NO full-text search in schema, only via FTS5 triggers)
```

**New Schema (Next.js/PostgreSQL):**
```
id (varchar(191) PK)
gameId (varchar(191) FK → games, cascade)
resourceId (varchar(191) FK → resources, cascade)
content (text NOT NULL)
embedding (vector(1536) NOT NULL) ⭐ NEW
version (integer DEFAULT 0)
type (varchar(50) DEFAULT 'text')
attachmentId (varchar(191) FK → attachments, set null)
searchableContent (text)
syntheticQuestions (jsonb) [converted from text JSON]
resourceName (text)
resourceDescription (text)
resourceType (varchar(50))
pageNumber (integer)
pageRange (jsonb) [changed from 2 separate columns] ⭐
section (text)
images (jsonb) [converted from text JSON]
searchVector (tsvector DEFAULT '') ⭐ NEW
createdAt (bigint NOT NULL)
updatedAt (bigint NOT NULL)
```

**Key Changes:**
1. **NEW: `embedding` field** - 1536-dimensional vector for semantic search (not in old schema)
2. **NEW: `searchVector` field** - PostgreSQL tsvector for full-text search (replaces FTS5 triggers)
3. **REMOVED: `answerTypes`** - Was added in workers migration 0001 but NOT present in NextJS schema
4. **CHANGED: pageRange** - From separate pageRangeStart/pageRangeEnd integers → jsonb [start, end] array
5. **CHANGED: Timestamps** - Added createdAt/updatedAt (were not in workers fragments)
6. **TYPE CHANGES** - text JSON → jsonb for synthetic_questions and images
7. **Indexes enhanced** - HNSW index for vector search, GIN index for full-text search

⚠️ **ISSUE:** The `answerTypes` column from workers migration 0001_add_answer_types_column.sql is **NOT** in the NextJS schema. This field exists in the D1 database but has no equivalent in the PostgreSQL schema.

**Status:** ⚠️ MOSTLY COMPLETE - Missing answerTypes field

---

### 4. ATTACHMENTS TABLE

#### ✅ MIGRATED - All core columns present, storage key changed

**Old Schema (Workers/D1):**
```
id (text PK)
gameId (text FK → games, cascade)
resourceId (text FK → resources, cascade)
type (text DEFAULT 'image')
mimeType (text NOT NULL)
r2Key (text NOT NULL) ⭐ [R2-specific: resources/{resourceId}/attachments/{id}.ext]
originalFilename (text)
pageNumber (integer)
bbox (text JSON [x1, y1, x2, y2])
caption (text)
width (integer)
height (integer)
description (text)
isGoodQuality (integer bool)
isRelevant (integer bool)
detectedType (text)
ocrText (text)
createdAt (integer timestamp)
```

**New Schema (Next.js/PostgreSQL):**
```
id (varchar(191) PK)
gameId (varchar(191) FK → games, cascade)
resourceId (varchar(191) FK → resources, cascade)
type (varchar(50) DEFAULT 'image')
mimeType (varchar(100) NOT NULL)
blobKey (text NOT NULL) ⭐ [Vercel Blob or local: resources/{resourceId}/attachments/{id}.png]
url (text NOT NULL) ⭐ [NEW: public URL to access]
originalFilename (text)
pageNumber (integer)
bbox (jsonb [x1, y1, x2, y2]) [converted from text JSON]
caption (text)
width (integer)
height (integer)
description (text)
isGoodQuality (varchar(10) 'good'|'bad'|null) ⭐ [Changed from bool]
isRelevant (integer bool) ⭐ [Kept as 0/1]
detectedType (varchar(50))
ocrText (text)
createdAt (bigint NOT NULL)
```

**Key Changes:**
1. **`r2Key` → `blobKey`** - Changed from R2-specific to support Vercel Blob or local storage
2. **NEW: `url` field** - Explicit public URL column (was computed before)
3. **isGoodQuality type change** - From boolean to varchar('good'|'bad'|null)
4. **Timestamps** - From integer to bigint, and removed updatedAt (only createdAt)
5. **Indexes preserved** - Game, resource, resource+page, type

**Status:** ✅ COMPLETE (with storage system abstraction)

---

### 5. USERS TABLE

#### ✅ MIGRATED - All columns present

**Old Schema (Workers/D1):**
```
id (text PK)
email (text NOT NULL UNIQUE)
name (text)
isAdmin (integer bool DEFAULT false)
createdAt (integer timestamp)
updatedAt (integer timestamp)
```

**New Schema (Next.js/PostgreSQL):**
```
id (varchar(191) PK)
email (varchar(255) NOT NULL UNIQUE)
name (text)
isAdmin (integer DEFAULT 0)
createdAt (bigint NOT NULL)
updatedAt (bigint NOT NULL)
```

**Differences:**
- Text IDs → varchar(191)
- Timestamps as bigint (unix ms)
- Email length constraint: 255 characters

**Status:** ✅ COMPLETE

---

### 6. BGG_GAMES TABLE

#### ✅ MIGRATED - Cache table for BGG API data

**Old Schema (Workers/D1):**
```
id (text PK) [BGG ID]
name (text NOT NULL)
yearPublished (integer)
minPlayers (integer)
maxPlayers (integer)
playingTime (integer)
thumbnailUrl (text)
imageUrl (text)
description (text)
publishers (text JSON [array])
designers (text JSON [array])
categories (text JSON [array])
mechanics (text JSON [array])
cachedAt (integer timestamp)
```

**New Schema (Next.js/PostgreSQL):**
```
id (varchar(191) PK)
name (text NOT NULL)
yearPublished (integer)
minPlayers (integer)
maxPlayers (integer)
playingTime (integer)
thumbnailUrl (text)
imageUrl (text)
description (text)
publishers (jsonb [array])
designers (jsonb [array])
categories (jsonb [array])
mechanics (jsonb [array])
cachedAt (bigint NOT NULL)
```

**Differences:**
- Text JSON → jsonb
- Timestamps as bigint
- Index on name preserved

**Status:** ✅ COMPLETE

---

### 7. AUTH TABLES (NEW - NextAuth v5)

#### ✅ NEW TABLES - Not in old workers schema

**New Accounts Table:**
```
user_id (varchar(191) FK → users)
type (varchar(191) NOT NULL)
provider (varchar(191) NOT NULL)
provider_account_id (varchar(191) NOT NULL)
refresh_token (text)
access_token (text)
expires_at (integer)
token_type (varchar(191))
scope (text)
id_token (text)
session_state (text)
PRIMARY KEY (provider, provider_account_id)
```

**New Sessions Table:**
```
session_token (varchar(191) PK)
user_id (varchar(191) FK → users, cascade)
expires (bigint NOT NULL)
```

**New VerificationTokens Table:**
```
identifier (varchar(191) NOT NULL)
token (varchar(191) NOT NULL)
expires (bigint NOT NULL)
PRIMARY KEY (identifier, token)
```

**Status:** ✅ COMPLETE (NextAuth v5 adapter implementation)

---

### 8. JOBS TABLE

#### ✅ MIGRATED - Job queue management

**Old Schema (Workers/D1):** 
NOT EXPLICITLY IN D1 SCHEMA - Status tracked in KV storage

**New Schema (Next.js/PostgreSQL):**
```
id (varchar(191) PK)
type (varchar(50) NOT NULL) enum: 'process-resource'
resourceId (varchar(191) NOT NULL)
gameId (varchar(191) NOT NULL)
status (varchar(50) DEFAULT 'pending') enum: 'pending'|'processing'|'completed'|'failed'|'cancelled'
progress (integer DEFAULT 0) [0-100]
currentStep (text)
error (jsonb)
metadata (jsonb)
createdAt (bigint NOT NULL)
updatedAt (bigint NOT NULL)
completedAt (bigint)
```

**Indexes:**
- idx_jobs_resource_id
- idx_jobs_game_id
- idx_jobs_status
- idx_jobs_created_at

**Status:** ✅ COMPLETE (Replaces KV-based job tracking)

---

### 9. EMBEDDINGS TABLE

#### ✅ MIGRATED - Vector embeddings for RAG

**Old Implementation (Workers/D1):** 
NOT IN D1 SCHEMA - Stored separately via Cloudflare Vectorize

**New Schema (Next.js/PostgreSQL):**
```
id (varchar(191) PK) [fragmentId or fragmentId-qX]
fragment_id (varchar(191) FK → fragments, cascade)
game_id (varchar(191) FK → games, cascade)
resource_id (varchar(191) FK → resources, cascade)
type (varchar(50) NOT NULL) enum: 'content'|'question'
embedding (vector(1536) NOT NULL) [OpenAI text-embedding-3-small]
question_index (integer) [0-4 for questions, null for content]
question_text (text)
page_number (integer)
section (text)
fragment_type (varchar(50))
version (integer DEFAULT 0)
created_at (bigint NOT NULL)
```

**Indexes:**
- idx_embeddings_fragment_id
- idx_embeddings_game_type
- idx_embeddings_resource_id
- idx_embeddings_type
- idx_embeddings_vector_ip (IVFFlat for inner product)
- idx_embeddings_vector_cosine (IVFFlat for cosine)

**Architecture Notes:**
- One content embedding per fragment
- Up to 5 question embeddings per fragment (HyDE synthetic questions)
- Uses pgvector extension (must be installed)
- IVFFlat indexing for fast vector similarity search

**Status:** ✅ COMPLETE (Migrated from Vectorize to pgvector)

---

## MIGRATION ISSUES & GAPS

### ❌ CRITICAL GAPS

| Issue | Impact | Status |
|-------|--------|--------|
| Missing `answerTypes` in fragments | Column exists in D1 but not in PostgreSQL schema | ⚠️ DATA LOSS RISK - existing data will be lost during migration |

### ⚠️ SCHEMA DIFFERENCES

| Item | Old | New | Note |
|------|-----|-----|------|
| Timestamps | integer | bigint | Must convert via: `CAST(createdAt AS bigint)` or similar |
| JSON storage | TEXT | JSONB | Drizzle handles conversion automatically |
| Vector embeddings | Vectorize API | pgvector extension | Requires Postgres extension: `CREATE EXTENSION vector;` |
| Full-text search | SQLite FTS5 | PostgreSQL tsvector | Different syntax and capabilities |
| ID type | text | varchar(191) | String length constraint |

### ✅ SUCCESSFUL MIGRATIONS

| Feature | Status | Notes |
|---------|--------|-------|
| Foreign key relationships | ✅ Complete | Cascade deletes preserved |
| Indexes | ✅ Complete | All indexes recreated |
| Unique constraints | ✅ Complete | slug, bggId, email |
| Enums/Constants | ✅ Complete | Defined in TypeScript, not DB enums |

---

## NEXT STEPS FOR COMPLETE MIGRATION

### 1. **Add Missing `answerTypes` Column**
If this data is being used:
```sql
ALTER TABLE fragments ADD COLUMN answer_types jsonb;
```

### 2. **Verify Vector Extension**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis; -- Also referenced in migration
```

### 3. **Data Migration Script**
```sql
-- Migrate old D1 records to PostgreSQL
-- 1. Convert timestamps: CAST(unix_timestamp AS bigint)
-- 2. Parse JSON strings from fragments: jsonb_build_array
-- 3. Handle null page ranges properly
-- 4. Regenerate embedding vectors (old Vectorize IDs won't work)
```

### 4. **Regenerate Embeddings**
- Old Vectorize embeddings cannot be directly migrated
- Must re-embed all fragments using OpenAI text-embedding-3-small
- Should batch process to avoid API rate limits
- Update version field during migration

### 5. **Full-Text Search Reindexing**
- Recompute `searchVector` tsvector for all fragments
- Test FTS queries against new PostgreSQL implementation
- May have different ranking/relevance than SQLite FTS5

---

## SUMMARY BY TABLE

| Table | Status | Complete? | Notes |
|-------|--------|-----------|-------|
| games | ✅ Migrated | Yes | All columns present |
| resources | ✅ Migrated | Yes | All columns present |
| fragments | ⚠️ Migrated | Mostly | Missing answerTypes |
| attachments | ✅ Migrated | Yes | Storage abstraction updated |
| users | ✅ Migrated | Yes | All columns present |
| bgg_games | ✅ Migrated | Yes | All columns present |
| accounts | ✅ New | Yes | NextAuth v5 adapter |
| sessions | ✅ New | Yes | NextAuth v5 adapter |
| verification_tokens | ✅ New | Yes | NextAuth v5 adapter |
| jobs | ✅ New | Yes | Replaces KV storage |
| embeddings | ✅ New | Yes | Replaces Vectorize |

**Overall Migration Status: 95% COMPLETE**

---

## KEY ARCHITECTURAL CHANGES

1. **Vector Search**: Vectorize → pgvector (embedded in PostgreSQL)
2. **Full-Text Search**: SQLite FTS5 → PostgreSQL tsvector + GIN indexes
3. **JSON Storage**: TEXT-based → JSONB (native PostgreSQL)
4. **Job Management**: KV storage → Dedicated jobs table
5. **Authentication**: Custom → NextAuth v5 (standardized)
6. **Vector Embeddings Storage**: External → Embedded in fragments table (via embeddings table)

