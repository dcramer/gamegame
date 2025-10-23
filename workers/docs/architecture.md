# GameGame Architecture Overview

## Core Domain Models

- `games` — Board game metadata (name, slug, year, hero image, BGG link). A game owns zero or more resources.
- `resources` — Rulebooks or other reference material tied to a single game. Each resource stores the canonical markdown content, processing status, statistics, and a pointer to the source file in R2.
- `attachments` — Extracted media (images, diagrams) from a resource. Attachments live under `resources/{resourceId}/attachments/{attachmentId}.{ext}` in R2 and are referenced from resource content using the `attachment://{id}` syntax.
- `fragments` — Text chunks generated from a resource for retrieval augmented generation (RAG). Each fragment is persisted in D1 and mirrored in Vectorize for semantic search, while an FTS5 virtual table backs keyword search.

Refer to `src/lib/db/schema/d1.ts` for the authoritative schema definitions.

## Storage Layout

| Data | Location | Notes |
| ---- | -------- | ----- |
| Relational entities (games/resources/attachments/fragments/users) | Cloudflare D1 | SQLite with integer timestamps and JSON stored as strings. |
| Vector embeddings | Cloudflare Vectorize | 1536‑dimension vectors keyed by fragment IDs (≤64 characters). |
| Source PDFs & images | Cloudflare R2 | PDFs stored as `resources/{resourceId}/source.pdf`; attachments under `resources/{resourceId}/attachments/`. |
| Background job state | Cloudflare KV (`JOB_STATUS_KV`) | Works in tandem with queue workers for progress reporting. |
| Rate limiting counters | Cloudflare KV (`RATE_LIMIT_KV`) | Simple fixed-window counters per IP. |

## Resource Lifecycle

1. **Upload / Creation**
   - Admin uploads a PDF via `/api/games/:id/resources`.
   - Source file is written to R2 and a `resources` row is seeded with status `processing`.
   - A job is registered in KV and a message is enqueued on `RESOURCE_QUEUE`.

2. **Async Processing Pipeline** (see `src/lib/processing/pdf-processor.ts`)
   - **INGEST**: Fetch PDF (from R2 or remote URL), run Mistral OCR, persist structured output (`structured.json`) and update resource metadata.
   - **VISION** (if images present): Call GPT‑vision to enhance image captions/quality flags; save updated structured data.
   - **CLEANUP**: Run markdown cleanup in parallel (with bounded concurrency) to strip boilerplate.
   - **EMBED**: Upload images to R2, rebuild markdown with `attachment://` links, compute statistics, generate embeddings, write fragments + attachments to D1, and push vectors to Vectorize.
   - **FINALIZE**: Delete temporary structured data, mark the resource `ready`, and close out the job in KV.

   Each stage updates `resources.processingStage`, `resources.processingMetadata`, and the KV job record so the UI can poll progress.

3. **Chat / Retrieval**
   - Chat requests call `findRelevantContent` (`src/lib/ai/search.ts`), which fuses Vectorize similarity results and FTS5 keyword matches via Reciprocal Rank Fusion.
   - When resource chunks reference `attachment://{id}`, the chat tool `getAttachment` resolves the final URL via R2 helpers in `src/lib/services/r2-storage.ts`.

## Administrative Operations

- **Reprocess** (`POST /api/resources/:id/reprocess`): Clears existing job linkage, queues a fresh ingest, and resets resource state so the pipeline can rebuild content, stats, attachments, fragments, and embeddings from scratch.
- **Delete Resource / Game**: Removes database records, batches Vectorize deletions, and paginates through R2 keys to ensure all blobs are deleted even when collections exceed 1,000 objects.
- **Manual Metadata Updates**: The admin PATCH endpoint permits editing descriptive fields (name, description, attribution) but blocks direct content edits to preserve data integrity—the pipeline is the sole writer of canonical markdown.

## Additional References

- `CLAUDE.md` — Automation guidance (includes Cloudflare stack overview).
- `README.md` — Setup instructions, tooling, and roadmap.
- `src/routes/api/*` — REST surface for admin and client behaviour.
