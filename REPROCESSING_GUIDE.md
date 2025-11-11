# Advanced Reprocessing Controls in GameGame

## Executive Summary

GameGame implements a sophisticated 5-stage reprocessing system that allows admins to restart the PDF processing pipeline at different stages. This enables recovery from errors, optimization of specific processing steps, and incremental content improvement without full reprocessing.

---

## Complete List of Reprocessing Options

### 1. **Full Reprocess** (from: `ingest`)
**Description:** Complete pipeline from scratch
**What it does:**
- Extracts text and images from the source PDF using Mistral OCR
- Runs all subsequent stages (vision → cleanup → metadata → embed → finalize)
- Deletes ALL previous fragments, embeddings, and attachments
- Takes longest (~5-10 minutes depending on PDF size)

**Use cases:**
- PDF source file was updated
- Initial processing had major errors in extraction
- Want to regenerate everything from raw PDF

---

### 2. **Improve Image Descriptions** (from: `vision`)
**Description:** Re-analyze image content
**What it skips:**
- PDF extraction (uses existing text content)
- Runs vision analysis on images
- Continues with cleanup → metadata → embed → finalize
- Requires structured data from previous ingest stage

**Use cases:**
- Image descriptions are incomplete or inaccurate
- GPT-5 quality improved and want better captions
- Want to re-analyze diagrams without re-extracting text

**Prerequisites:** Must have completed at least ingest stage previously

---

### 3. **Clean Up Markdown** (from: `cleanup`)
**Description:** Fix formatting issues
**What it skips:**
- PDF extraction (uses existing text)
- Vision analysis (uses existing image descriptions)
- Runs markdown cleanup to fix formatting
- Continues with metadata → embed → finalize

**Use cases:**
- Markdown formatting has issues (bad line breaks, malformed tables)
- LLM cleanup prompt improved
- Want to fix formatting without re-analyzing images

**Prerequisites:** Must have completed ingest + vision stages previously

---

### 4. **Regenerate Metadata** (from: `metadata`)
**Description:** Update document title and description
**What it skips:**
- PDF extraction
- Vision analysis
- Markdown cleanup
- Runs metadata extraction (document title, description generation)
- Continues with embed → finalize

**Use cases:**
- Auto-generated title/description is wrong
- Want better naming without full reprocessing
- Metadata prompt improved and want to regenerate

**Prerequisites:** Must have completed ingest + vision + cleanup stages previously

---

### 5. **Regenerate Embeddings** (from: `embed`)
**Description:** Update search index
**What it skips:**
- PDF extraction
- Vision analysis
- Markdown cleanup
- Metadata generation
- Re-chunks content and generates embeddings
- Updates vector search index
- Continues with finalize

**Use cases:**
- Embedding model changed (e.g., OpenAI released better `text-embedding-3-large`)
- Chunking strategy improved
- Want to update search index without reprocessing content
- **Fastest option for incremental improvements** (~1-2 minutes)

**Prerequisites:** Must have completed all previous stages

---

## API Integration

### Base Endpoint
```
POST /resources/{resourceId}/reprocess[?from={stage}]
```

### Query Parameter
- `from`: Optional stage to start from
  - Values: `ingest`, `vision`, `cleanup`, `metadata`, `embed`
  - Default: `ingest` (if omitted)
  - Example: `/resources/abc123/reprocess?from=cleanup`

### Request
```bash
curl -X POST http://localhost:3000/api/resources/abc123/reprocess?from=vision \
  -H "Content-Type: application/json"
```

### Response (202 Accepted)
```json
{
  "resourceId": "abc123",
  "jobId": "job_xyz789",
  "status": "queued",
  "message": "Resource queued for vision re-analysis (skipping PDF extraction)"
}
```

### Error Responses

**400 Bad Request** - Invalid `from` parameter:
```json
{
  "error": "Invalid \"from\" parameter. Must be one of: ingest, vision, cleanup, metadata, embed"
}
```

**400 Bad Request** - Missing structured data (when skipping ingest):
```json
{
  "error": "No structured data found for this resource. Use ?from=ingest to extract from PDF first."
}
```

**404 Not Found** - Resource doesn't exist:
```json
{
  "error": "Resource not found"
}
```

---

## UI Implementation

### Location
**Workers Admin Panel** → Resource Detail Page → Right Sidebar

**Path:** `/admin/games/{gameId}/resources/{resourceId}`

### Visual Layout
```
┌─────────────────────────────────────────┐
│           Reprocessing                  │ ← Section header (sticky)
├─────────────────────────────────────────┤
│ [Full Reprocess]                        │
│ Complete pipeline from scratch          │
├─────────────────────────────────────────┤
│ [Improve Image Descriptions]            │
│ Re-analyze image content                │
├─────────────────────────────────────────┤
│ [Clean Up Markdown]                     │
│ Fix formatting issues                   │
├─────────────────────────────────────────┤
│ [Regenerate Metadata]                   │
│ Update document title and description   │
├─────────────────────────────────────────┤
│ [Regenerate Embeddings]                 │
│ Update search index                     │
├─────────────────────────────────────────┤
│           Download                      │
├─────────────────────────────────────────┤
│ [Download Resource] Get original file   │
├─────────────────────────────────────────┤
│         Danger Zone                     │
├─────────────────────────────────────────┤
│ [Delete Resource] Permanently removes   │
└─────────────────────────────────────────┘
```

### Button Component
**Component:** `ActionButton`
- **Icon:** `RefreshCw` (lucide-react)
- **Size:** sm/md
- **Variant:** default (except Delete uses "danger")
- **Responsive:** Sticky sidebar on lg screens

### Implementation in React/Next.js

**Key File:** `/workers/app/routes/admin.games.$gameId.resources.$resourceId.tsx`

```typescript
const handleReprocess = async (
  from: 'ingest' | 'vision' | 'cleanup' | 'metadata' | 'embed' = 'cleanup'
) => {
  // Stage metadata
  const jobTitles = {
    ingest: { title: 'Full Reprocess', description: 'Complete pipeline from scratch' },
    vision: { title: 'Improve Image Descriptions', description: 'Re-analyzing image content' },
    cleanup: { title: 'Clean Up Markdown', description: 'Fixing formatting issues' },
    metadata: { title: 'Regenerate Metadata', description: 'Updating document title and description' },
    embed: { title: 'Regenerate Embeddings', description: 'Updating search index' },
  };

  // Show notification immediately
  const notificationId = addPendingJobNotification(title, description);

  // Call API
  const url = from === 'ingest'
    ? `/resources/${resourceId}/reprocess`
    : `/resources/${resourceId}/reprocess?from=${from}`;

  const response = await apiClient.fetch(url, { method: 'POST' });

  // Update UI with job status
  if (response.ok) {
    const data = await response.json();
    updatePendingJobWithId(notificationId, data.jobId);
  }
};
```

---

## Next.js Implementation (Main App)

### Current State in Next.js App
The main Next.js app at `/app/admin/` currently has **basic reprocessing only**:
- Simple "Reprocess" button that triggers full pipeline (from ingest)
- No stage-based options
- Located in `/app/admin/games/[gameId]/resource-list.tsx`

### What's Needed to Add Advanced Controls

#### 1. **Create Resource Detail Page**
```typescript
// app/admin/games/[gameId]/[resourceId]/details.tsx
'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { reprocessResource } from '@/lib/actions/resources';

interface ReprocessOption {
  stage: 'ingest' | 'vision' | 'cleanup' | 'metadata' | 'embed';
  title: string;
  description: string;
  icon?: React.ReactNode;
}

const reprocessOptions: ReprocessOption[] = [
  {
    stage: 'ingest',
    title: 'Full Reprocess',
    description: 'Complete pipeline from scratch'
  },
  {
    stage: 'vision',
    title: 'Improve Image Descriptions',
    description: 'Re-analyze image content'
  },
  {
    stage: 'cleanup',
    title: 'Clean Up Markdown',
    description: 'Fix formatting issues'
  },
  {
    stage: 'metadata',
    title: 'Regenerate Metadata',
    description: 'Update document title and description'
  },
  {
    stage: 'embed',
    title: 'Regenerate Embeddings',
    description: 'Update search index'
  }
];

export default function ResourceDetails({ resourceId }: { resourceId: string }) {
  const [isLoading, setLoading] = useState<string | null>(null);

  const handleReprocess = async (stage: string) => {
    setLoading(stage);
    try {
      await fetch(`/api/resources/${resourceId}/reprocess?from=${stage}`, {
        method: 'POST'
      });
      // Show success toast
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold mb-3">Reprocessing</h3>
      {reprocessOptions.map((option) => (
        <Button
          key={option.stage}
          onClick={() => handleReprocess(option.stage)}
          disabled={isLoading === option.stage}
          variant="outline"
          className="w-full justify-start"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          <div className="text-left flex-1">
            <div className="font-medium">{option.title}</div>
            <div className="text-xs text-muted-foreground">{option.description}</div>
          </div>
        </Button>
      ))}
    </div>
  );
}
```

#### 2. **Create API Route Handler**
```typescript
// app/api/resources/[resourceId]/reprocess/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  const { resourceId } = await params;
  const from = request.nextUrl.searchParams.get('from') || 'ingest';

  // Validate stage
  if (!['ingest', 'vision', 'cleanup', 'metadata', 'embed'].includes(from)) {
    return NextResponse.json(
      { error: 'Invalid stage parameter' },
      { status: 400 }
    );
  }

  await requireAdmin();

  try {
    // Forward to worker API with stage parameter
    const response = await fetch(
      `${process.env.WORKER_API_URL}/resources/${resourceId}/reprocess?from=${from}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`Worker API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to reprocess resource' },
      { status: 500 }
    );
  }
}
```

#### 3. **Add Server Action**
```typescript
// lib/actions/reprocess.ts
'use server';

import { requireAdmin } from '@/lib/auth/helpers';

export const reprocessResource = async (
  resourceId: string,
  stage: 'ingest' | 'vision' | 'cleanup' | 'metadata' | 'embed' = 'ingest'
) => {
  await requireAdmin();

  const response = await fetch(`/api/resources/${resourceId}/reprocess?from=${stage}`, {
    method: 'POST'
  });

  if (!response.ok) {
    throw new Error('Failed to reprocess resource');
  }

  return response.json();
};
```

#### 4. **Update Resource List Component**
Add "View Details" link to see the advanced reprocessing options:

```typescript
// app/admin/games/[gameId]/resource-list.tsx
<Link href={`/admin/games/${gameId}/${resourceId}/details`}>
  View Details & Reprocess Options
</Link>
```

---

## Server-Side Implementation Details

### Workers API Structure

**File:** `/workers/src/routes/api/resources.ts` (Hono router)

**Key Logic:**
```typescript
resourcesRouter.post('/:resourceId/reprocess', requireAdmin, async (c) => {
  const fromStage = (c.req.query('from') as string) || 'ingest';

  // Validate stage parameter
  if (!['ingest', 'vision', 'cleanup', 'metadata', 'embed'].includes(fromStage)) {
    return c.json({ error: 'Invalid "from" parameter' }, 400);
  }

  // Get resource
  const [resource] = await db.select().from(resources)
    .where(eq(resources.id, resourceId)).limit(1);

  // Delete old fragments and embeddings
  await db.delete(fragments).where(eq(fragments.resourceId, resourceId));
  await deleteEmbeddings(env.VECTORIZE, fragmentIds); // Cleanup vector index

  // Delete old attachments and R2 files
  await db.delete(attachments).where(eq(attachments.resourceId, resourceId));
  await bulkDeleteFromR2(env.FILES, keys); // Cleanup blob storage

  // Create job and queue for processing
  const jobId = await createJob(env.JOB_STATUS_KV, resourceId, resource.gameId);

  // Build processing metadata with stage completion status
  const processingMetadata = {
    structuredKey: `resources/${resourceId}/structured.json`,
    stages: {
      ingest: true,      // Mark completed stages as true
      vision: true,      // Only new stage is false
      cleanup: false,    // This stage will be run
      metadata: false,
      embed: false
    }
  };

  // Send to queue
  await env.RESOURCE_QUEUE.send({
    jobId,
    resourceId,
    type: stageToTaskType[fromStage], // VISION, CLEANUP, METADATA, or EMBED
    gameName: game.name,
    // Only include URL for INGEST stage
    url: fromStage === 'ingest' ? normalizedUrl : undefined,
  });

  return c.json({
    resourceId,
    jobId,
    status: 'queued',
    message: stageMessages[fromStage]
  }, 202);
});
```

### Database State Management

**Before reprocessing:**
```sql
-- Fragments to be deleted
DELETE FROM fragments WHERE resource_id = 'abc123';

-- Attachments to be deleted
DELETE FROM attachments WHERE resource_id = 'abc123';

-- Resource status updated
UPDATE resources
SET status = 'processing',
    processing_stage = 'cleanup', -- Set to starting stage
    processing_metadata = '{"structuredKey":"...","stages":{...}}',
    current_job_id = 'job_xyz'
WHERE id = 'abc123';
```

### Queue Message Format

**For `from=vision`:**
```json
{
  "jobId": "job_xyz789",
  "resourceId": "abc123",
  "gameId": "game_456",
  "type": "VISION",
  "gameName": "Arcs",
  "url": null,  // Not needed - using existing text
  "sourceKey": null
}
```

**For `from=embed`:**
```json
{
  "jobId": "job_xyz789",
  "resourceId": "abc123",
  "gameId": "game_456",
  "type": "EMBED",
  "gameName": "Arcs",
  "url": null,
  "sourceKey": null
}
```

---

## Processing Stages Explained

### Stage 1: INGEST
**Executed by:** `workflows/steps/resource-processing/ingest.step.ts`
**What it does:**
- Fetches PDF from URL or blob storage
- Calls Mistral OCR API to extract text and images
- Stores extracted content as structured JSON
- Creates `resources/{resourceId}/structured.json` with all extracted data

**Output:** Structured JSON with:
- Pages array (text per page)
- Images array (base64 + bounding boxes)
- Metadata (dimensions, DPI, etc)

**Cannot skip:** This is the entry point - all other stages depend on structured data

---

### Stage 2: VISION
**Executed by:** `workflows/steps/resource-processing/vision.step.ts`
**What it does:**
- Analyzes extracted images with GPT-5 vision
- Generates descriptive captions for diagrams, tables, screenshots
- Uses game name for context
- Caches vision results in structured JSON

**Input:** Structured data from INGEST
**Output:** Same structured data with image descriptions added

**Can skip:** If you're happy with image descriptions, skip to CLEANUP

---

### Stage 3: CLEANUP
**Executed by:** `workflows/steps/resource-processing/cleanup.step.ts`
**What it does:**
- Processes markdown with LLM
- Fixes formatting issues (line breaks, table alignment, etc)
- Improves readability
- Replaces image references with `attachment://` syntax

**Input:** Structured data with images analyzed
**Output:** Cleaned markdown content

**Can skip:** If you like the markdown formatting, skip to METADATA

---

### Stage 4: METADATA
**Executed by:** `workflows/steps/resource-processing/metadata.step.ts`
**What it does:**
- Extracts document title and description using LLM
- Updates resource name/description fields
- Analyzes page count, word count, image count

**Input:** Cleaned markdown content
**Output:** Resource metadata (title, description, stats)

**Can skip:** If metadata is correct, skip to EMBED

---

### Stage 5: EMBED
**Executed by:** `workflows/steps/resource-processing/embed.step.ts`
**What it does:**
- Chunks content using `RecursiveCharacterTextSplitter`
- Generates embeddings for each chunk via OpenAI
- Stores fragments with vector + full-text search indices
- Critical for RAG search functionality

**Input:** Final markdown content
**Output:** Fragments table with embeddings

**Can skip:** No, this is required for search to work

---

### Stage 6: FINALIZE
**Executed by:** `workflows/steps/resource-processing/finalize.step.ts`
**What it does:**
- Verifies all data was written correctly
- Marks resource as 'ready'
- Sets `processedAt` timestamp
- Updates job status to 'completed'

**Input:** All previous stages completed
**Output:** Resource marked ready for use

**Cannot skip:** Final step

---

## Performance Implications

| Stage | Typical Time | Notes |
|-------|-------------|-------|
| INGEST | 3-10 min | Mistral OCR, depends on PDF size |
| VISION | 2-5 min | GPT-5 vision API calls, parallel batch |
| CLEANUP | 30 sec-2 min | LLM processing, usually fast |
| METADATA | 10-30 sec | Single LLM call per resource |
| EMBED | 1-3 min | OpenAI embeddings API, depends on tokens |
| FINALIZE | 5 sec | Database updates |
| **FULL (INGEST)** | **~10-20 min** | All stages + overhead |
| **FROM EMBED** | **~2 min** | Fastest incremental update |

**Best practice:** Use `from=embed` for most iterative improvements since it's ~10x faster than full reprocess.

---

## Job Status Tracking

### Job ID Generation
```typescript
// Workers: Create job in KV store
const jobId = await createJob(c.env.JOB_STATUS_KV, resourceId, resource.gameId);
```

### Job Status States
- `pending` → `processing` → `completed` | `failed`

### Client Polling
The Next.js app polls job status:
```typescript
const checkResourceStatus = async (resourceId: string) => {
  const response = await fetch(`/api/resources/${resourceId}`);
  const { status, processingStage, currentJobId } = await response.json();
  
  // Update UI based on status
  if (status === 'ready') {
    // Mark as complete
  } else if (status === 'failed') {
    // Show error
  }
};

// Poll every 3 seconds
useEffect(() => {
  const interval = setInterval(checkResourceStatus, 3000);
  return () => clearInterval(interval);
}, []);
```

---

## Error Recovery

### Canceling a Job
**API:** `POST /jobs/{jobId}/cancel`
```typescript
await apiClient.fetch(`/jobs/${jobId}/cancel`, { method: 'POST' });
```

**Effect:**
- Job marked as failed in KV
- Resource status set to 'failed'
- User can retry or delete

### Retrying a Failed Job
**API:** `POST /jobs/{jobId}/retry`
```typescript
await apiClient.fetch(`/jobs/${jobId}/retry`, { method: 'POST' });
```

**Effect:**
- New job created
- Resource re-queued from last failed stage
- Deletes old job from KV

---

## Data Cleanup During Reprocess

### Fragments
```sql
DELETE FROM fragments WHERE resource_id = 'abc123';
-- Automatically deletes embeddings from Vectorize
```

### Attachments
```sql
DELETE FROM attachments WHERE resource_id = 'abc123';
-- Automatically deletes files from R2 blob storage
```

### Structured Data
```
// Preserved in R2 to allow stage-based restart
resources/{resourceId}/structured.json
```

This design allows:
- Skipping INGEST stage without losing OCR results
- Retrying from any stage without re-extracting PDF
- Safe reprocessing without orphaned data

---

## Recommendations for Implementation

### Priority 1: Essential Features
1. **Add stage selector to resource detail page**
   - Radio buttons or dropdown menu
   - Show "Reprocess from [stage]" button
   - Add descriptions of what each stage does

2. **Add progress indication**
   - Show current stage in UI
   - Display job status (pending/processing/completed/failed)

3. **Add error details**
   - Show error message if reprocessing fails
   - Provide "Retry" option

### Priority 2: Enhancements
1. **Batch reprocessing** - Reprocess all resources in a game
2. **Progress percentages** - Show completion percentage per stage
3. **Activity log** - History of reprocessing operations
4. **Conditional buttons** - Disable stages that aren't applicable
5. **Keyboard shortcuts** - Quick trigger for common reprocessing

### Priority 3: Advanced Features
1. **A/B testing** - Compare results from different chunks strategies
2. **Stage validation** - Check if structured data exists before allowing skip
3. **Performance metrics** - Show time taken for each stage
4. **Rollback capability** - Keep previous embeddings/attachments for comparison
