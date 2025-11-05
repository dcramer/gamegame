# Attachment Edit Page - Complete Porting Analysis

## Executive Summary

The Remix attachment edit page (`admin.games.$gameId.resources.$resourceId.attachments.$attachmentId.tsx`) is a feature-rich admin interface for managing image attachments extracted from PDF resources. It includes:

- **Image preview** with quality indicators
- **Form editing** for metadata (description, filename)
- **Vision reprocessing** workflow to regenerate AI descriptions
- **Metadata display** card showing attachment details

The implementation uses Next.js App Router and can leverage existing infrastructure in the Next.js codebase.

---

## Complete Feature List

### 1. Attachment Display & Preview
- Image preview with fallback for non-image types
- Dimensions display (width × height)
- Page number indicator
- Quality badge with visual indicators:
  - Green checkmark for "good" quality
  - Red X for "low" quality
  - Only shown if quality assessment exists

### 2. Form Fields & Editing
- **Filename Field**
  - Text input for `originalFilename`
  - Optional (can be cleared to null)
  - Placeholder: "image.png"

- **Description Field**
  - Textarea (4 rows)
  - Rich AI-generated content
  - Optional field with explanation text
  - Placeholder: "AI-generated description of the image content"
  - Helper text: "This description helps the AI understand what's in the image when answering questions."

### 3. Form State Management
- Separate state for form fields vs. attachment metadata
- Initial state loaded from database
- Save status tracking (idle, success, error)
- Toast notifications for user feedback
- Save button with loading state

### 4. Vision Reprocessing
- "Reprocess with Vision" button
- Triggers `/attachments/{id}/reprocess` POST endpoint
- Refreshes description and quality assessment using GPT vision API
- Loading spinner during processing
- Updates local form state with new description
- Error handling with user-friendly messages

### 5. Metadata Display Card
- Read-only information display:
  - ID (monospace font)
  - Type (image, video, etc.)
  - MIME Type
  - Caption (if available)

### 6. Navigation & Breadcrumbs
- PageHeader component with breadcrumb trail
- Breadcrumbs show: Admin > Games > Game Name > Resource Name > Edit Attachment
- Page title: "Edit Attachment"
- Page stats: "Page {number}" indicator

### 7. Error Handling & User Feedback
- Try-catch blocks with appropriate error messages
- Toast notifications:
  - Success: "Attachment details saved successfully!"
  - Error: "Failed to save attachment details. Please try again."
  - Vision error: "Reprocessing failed: {error message}"
  - Network errors caught and user-friendly messages shown

---

## Data Model & Types

### Attachment Schema (Zod)

```typescript
interface Attachment {
  id: string;                    // nanoid - primary key
  gameId: string;                // Foreign key to games
  resourceId: string;            // Foreign key to resources
  type: string;                  // 'image' or other types
  mimeType: string | null;       // e.g., 'image/png'
  blobKey: string;              // Storage location (Vercel Blob or local)
  url: string;                   // Public URL to access
  originalFilename: string | null;
  pageNumber: number | null;     // Page from PDF (1-indexed)
  bbox?: number[] | null;        // [x1, y1, x2, y2] - bounding box
  caption: string | null;        // Auto-generated caption
  width: number | null;          // Image width in pixels
  height: number | null;         // Image height in pixels
  description: string | null;    // AI-generated description
  isGoodQuality?: 'good' | 'bad' | null;  // Quality assessment
  createdAt: number;             // Timestamp
}
```

### Extended Schema for UI
```typescript
const extendedAttachmentSchema = attachmentSchema.extend({
  description: z.string().nullable().optional(),
  isGoodQuality: z.boolean().nullable().optional(),  // Note: UI treats as boolean
});
```

---

## API Endpoints Needed

### 1. GET /api/attachments/:attachmentId
**Purpose**: Fetch single attachment details

**Request**: `GET /api/attachments/abc123`

**Response** (200 OK):
```json
{
  "id": "abc123",
  "resourceId": "res456",
  "type": "image",
  "mimeType": "image/png",
  "originalFilename": "board.png",
  "pageNumber": 5,
  "bbox": [100, 200, 300, 400],
  "caption": "Game board setup",
  "width": 800,
  "height": 600,
  "description": "Game board showing 4 player tracks",
  "isGoodQuality": "good",
  "url": "https://blob.vercel.com/..."
}
```

**Error** (404):
```json
{
  "error": "Attachment not found"
}
```

### 2. PATCH /api/attachments/:attachmentId
**Purpose**: Update attachment metadata

**Authentication**: Admin required

**Request**:
```json
{
  "description": "Updated AI description",
  "originalFilename": "updated_name.png"
}
```

**Response** (200 OK): Same as GET response with updated fields

**Validation Errors** (400):
```json
{
  "error": "Validation error",
  "details": [...]
}
```

**Auth Errors** (401/403):
```json
{
  "error": "Unauthorized"
}
```

### 3. POST /api/attachments/:attachmentId/reprocess
**Purpose**: Regenerate description and quality assessment using vision API

**Authentication**: Admin required

**Request**: `POST /api/attachments/abc123/reprocess`

**Process**:
1. Fetch attachment from database
2. Retrieve image file from blob storage using `blobKey`
3. Convert image to base64
4. Call OpenAI vision API via `analyzeImageWithVision()` from `lib/services/vision.ts`
5. Update attachment with new description and `isGoodQuality` field
6. Return updated attachment

**Response** (200 OK):
```json
{
  "id": "abc123",
  "description": "Newly generated description",
  "isGoodQuality": "good",
  ...rest of attachment
}
```

**Error Responses**:
```json
{
  "error": "Attachment not found",
  "details": "Attachment has no R2 key"
}

{
  "error": "Vision analysis failed",
  "details": "OpenAI API error message"
}
```

---

## Image Quality Indicators Implementation

### Visual Indicators
```typescript
// Good Quality Badge
<Badge variant="success">
  <CheckCircle className="w-3 h-3 mr-1" />
  Good Quality
</Badge>

// Low Quality Badge
<Badge variant="error">
  <XCircle className="w-3 h-3 mr-1" />
  Low Quality
</Badge>
```

### Display Conditions
- Only shown if `isGoodQuality` is not null
- Displayed in two places:
  1. Top-right corner of image preview (overlay)
  2. Below page number in metadata section

### Quality Assessment Source
- Generated during PDF processing via vision API
- Can be regenerated via "Reprocess with Vision" button
- Comes from vision model evaluation of image clarity and relevance

---

## Vision Reprocessing Workflow

### Step-by-Step Flow

```
User clicks "Reprocess with Vision"
         ↓
POST /api/attachments/:attachmentId/reprocess
         ↓
[Backend Processing]
1. Fetch attachment from DB
2. Retrieve image from blob storage (using blobKey)
3. Convert to base64 (using Workers-compatible method)
4. Validate OpenAI API key exists
5. Call analyzeImageWithVision() {
     - Build context-aware prompt
     - Send to OpenAI GPT-5 vision model (or GPT-4o-mini in dev)
     - Parse JSON response with description and quality
     - Handle retry with exponential backoff (3 attempts, 60s timeout)
   }
6. Update DB: set description and isGoodQuality
         ↓
Return updated attachment
         ↓
Update local state with new values
         ↓
Display success toast: "Vision analysis completed successfully!"
```

### Vision Analysis Details

**Prompt Engineering**:
```
Describe this rulebook image in ONE SHORT sentence. 
Focus on what game elements it shows and what it's used for 
(e.g., "Player board showing resource tracks" or "Card back design"). 
Be specific and concise.

Also assess quality: Mark as "BAD" only if severely cropped, 
extremely blurry, corrupted, or missing critical parts. 
Minor issues are "GOOD".

Format as JSON:
{
  "description": "One sentence description",
  "quality": "GOOD" or "BAD"
}
```

**Model Selection**:
- Production: GPT-5 vision model
- Development: GPT-4o-mini (fallback)
- Configured via `getModel('vision', environment)` from vision.ts

**Retry Strategy**:
- Max 3 retries with exponential backoff (1s, 2s, 4s delays)
- 60-second timeout per attempt
- Logs all retry attempts and failures

**Error Fallback**:
- If JSON parsing fails, regex extraction from response text
- Always returns valid description and quality

### Context Passed to Vision API

```typescript
{
  gameName?: string;           // Game name for context
  sectionHierarchy?: string;   // Section path (e.g., "Setup > Player Setup")
}
```

---

## Complete Next.js Implementation Plan

### Directory Structure

```
/Users/dcramer/src/gamegame/
├── app/
│   ├── admin/
│   │   ├── games/
│   │   │   └── [gameId]/
│   │   │       └── [resourceId]/
│   │   │           ├── page.tsx (existing - add link to attachment edit)
│   │   │           ├── attachment-list.tsx (existing - add link to edit)
│   │   │           └── attachments/
│   │   │               └── [attachmentId]/
│   │   │                   └── page.tsx (NEW - attachment edit page)
│   │
│   └── api/
│       └── attachments/
│           └── [attachmentId]/
│               ├── route.ts (existing - extend with POST reprocess)
│               └── reprocess/ (alternative structure)
│                   └── route.ts (NEW)
│
├── lib/
│   ├── services/
│   │   └── vision.ts (existing - already has analyzeImageWithVision)
│   │
│   ├── actions/
│   │   └── attachments.ts (existing - has getAttachment, getResourceAttachments)
│   │
│   └── auth/
│       └── helpers.ts (existing - has requireAdmin)
│
└── components/
    └── ui/
        ├── button.tsx (existing)
        ├── label.tsx (existing)
        ├── input.tsx (existing)
        ├── textarea.tsx (existing)
        └── badge.tsx (existing)
```

### 1. API Endpoint: POST /api/attachments/:attachmentId/reprocess

**File**: `/Users/dcramer/src/gamegame/app/api/attachments/[attachmentId]/route.ts`

**Changes**: Add POST handler to existing file

```typescript
/**
 * POST /api/attachments/:attachmentId/reprocess
 * Reprocess attachment with vision analysis (admin only)
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ attachmentId: string }> }
) {
  try {
    // Require admin authentication
    await requireAdmin();

    const params = await props.params;
    const { attachmentId } = params;

    // Fetch attachment from database
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    if (!attachment) {
      return NextResponse.json(
        { error: 'Attachment not found' },
        { status: 404 }
      );
    }

    try {
      // Validate blobKey exists
      if (!attachment.blobKey) {
        return NextResponse.json(
          { error: 'Attachment has no blob key' },
          { status: 400 }
        );
      }

      // Fetch image from blob storage
      const { getBlob } = await import('@/lib/services/blob-storage');
      const imageData = await getBlob(attachment.blobKey);
      
      if (!imageData) {
        return NextResponse.json(
          { error: 'Attachment not found in storage' },
          { status: 404 }
        );
      }

      // Convert to base64
      const base64Image = Buffer.from(imageData).toString('base64');

      // Validate OpenAI API key
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        return NextResponse.json(
          { error: 'OpenAI API key not configured' },
          { status: 500 }
        );
      }

      // Run vision analysis
      const { analyzeImageWithVision } = await import('@/lib/services/vision');
      const analysis = await analyzeImageWithVision(
        base64Image,
        '',  // No surrounding text for single attachment reprocess
        openaiApiKey,
        undefined,  // No context
        { imageId: attachmentId, pageNumber: attachment.pageNumber ?? undefined }
      );

      if (!analysis || typeof analysis.description !== 'string') {
        return NextResponse.json(
          { error: 'Vision analysis returned invalid result' },
          { status: 500 }
        );
      }

      // Update attachment with new description and quality
      const [updated] = await db
        .update(attachments)
        .set({
          description: analysis.description,
          isGoodQuality: analysis.isGoodQuality === 'good' ? 'good' : 'bad',
        })
        .where(eq(attachments.id, attachmentId))
        .returning();

      if (!updated) {
        return NextResponse.json(
          { error: 'Failed to update attachment' },
          { status: 500 }
        );
      }

      // Return updated attachment
      const { blobKeyToUrl } = await import('@/lib/services/blob-storage');
      const result = {
        ...updated,
        url: updated.blobKey ? blobKeyToUrl(updated.blobKey) : null,
        bbox: parseBbox(updated.bbox),
      };

      return NextResponse.json(result);
    } catch (error) {
      console.error('Vision analysis failed:', error);
      return NextResponse.json(
        {
          error: 'Vision analysis failed',
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[POST /api/attachments/:attachmentId/reprocess] Error:', error);
    return NextResponse.json(
      { error: 'Failed to reprocess attachment' },
      { status: 500 }
    );
  }
}
```

### 2. Attachment Edit Page Component

**File**: `/Users/dcramer/src/gamegame/app/admin/games/[gameId]/[resourceId]/attachments/[attachmentId]/page.tsx`

**Structure**: Server component that loads data and renders client component

```typescript
import { notFound } from "next/navigation";
import { getGame } from "@/lib/actions/games";
import { getResource } from "@/lib/actions/resources";
import { getAttachment } from "@/lib/actions/attachments";
import AttachmentEditClient from "./client";

export const maxDuration = 300;

export async function generateMetadata(props: {
  params: Promise<{ gameId: string; resourceId: string; attachmentId: string }>;
}) {
  const params = await props.params;
  
  try {
    const attachment = await getAttachment(params.attachmentId);
    const resource = await getResource(params.resourceId, true);
    const game = await getGame(params.gameId);

    if (!attachment || !resource || !game) {
      return { title: 'Attachment Not Found' };
    }

    const attachmentName =
      attachment.originalFilename ||
      attachment.description ||
      `Attachment ${attachment.id}`;

    return {
      title: `${attachmentName} - GameGame Admin`,
      description: `Edit attachment from ${resource.name}.`,
    };
  } catch {
    return { title: 'Attachment Not Found' };
  }
}

export default async function Page(props: {
  params: Promise<{ gameId: string; resourceId: string; attachmentId: string }>;
}) {
  const params = await props.params;

  try {
    const [attachment, resource, game] = await Promise.all([
      getAttachment(params.attachmentId),
      getResource(params.resourceId, true),
      getGame(params.gameId),
    ]);

    if (!attachment || !resource || !game) {
      notFound();
    }

    return (
      <AttachmentEditClient
        attachment={attachment}
        resource={resource}
        game={game}
        gameId={params.gameId}
        resourceId={params.resourceId}
      />
    );
  } catch (error) {
    console.error('Failed to load attachment:', error);
    notFound();
  }
}
```

### 3. Client Component for Editing

**File**: `/Users/dcramer/src/gamegame/app/admin/games/[gameId]/[resourceId]/attachments/[attachmentId]/client.tsx`

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, RefreshCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Attachment = {
  id: string;
  type: string;
  url: string;
  mimeType: string | null;
  originalFilename: string | null;
  pageNumber: number | null;
  bbox?: number[];
  caption: string | null;
  width: number | null;
  height: number | null;
  description: string | null;
  isGoodQuality?: "good" | "bad" | null;
};

type Resource = {
  id: string;
  name: string;
};

type Game = {
  id: string;
  name: string;
};

export default function AttachmentEditClient({
  attachment: initialAttachment,
  resource,
  game,
  gameId,
  resourceId,
}: {
  attachment: Attachment;
  resource: Resource;
  game: Game;
  gameId: string;
  resourceId: string;
}) {
  const router = useRouter();
  const [attachment, setAttachment] = useState<Attachment>(initialAttachment);
  const [description, setDescription] = useState(initialAttachment.description || "");
  const [originalFilename, setOriginalFilename] = useState(
    initialAttachment.originalFilename || ""
  );
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [reprocessing, setReprocessing] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    setSaveStatus("idle");

    try {
      const payload = {
        description: description.trim() ? description : null,
        originalFilename: originalFilename.trim() ? originalFilename : null,
      };

      const response = await fetch(`/api/attachments/${attachment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const updatedAttachment = (await response.json()) as Attachment;
        setAttachment(updatedAttachment);
        setDescription(updatedAttachment.description || "");
        setOriginalFilename(updatedAttachment.originalFilename || "");
        setSaveStatus("success");
        
        // Reset status after 3 seconds
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
      }
    } catch (error) {
      console.error("Save error:", error);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const handleReprocess = async () => {
    setReprocessing(true);

    try {
      const response = await fetch(`/api/attachments/${attachment.id}/reprocess`, {
        method: "POST",
      });

      if (response.ok) {
        const updatedAttachment = (await response.json()) as Attachment;
        setAttachment(updatedAttachment);
        setDescription(updatedAttachment.description || "");
      } else {
        const errorJson = await response.json();
        const errorMsg = (errorJson as { error?: string }).error || "Unknown error";
        alert(`Reprocessing failed: ${errorMsg}`);
      }
    } catch (error) {
      console.error("Reprocess error:", error);
      alert("Failed to reprocess attachment");
    } finally {
      setReprocessing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">
          Admin
        </Link>
        <span>/</span>
        <Link href="/admin/games" className="hover:text-foreground">
          Games
        </Link>
        <span>/</span>
        <Link href={`/admin/games/${gameId}`} className="hover:text-foreground">
          {game.name}
        </Link>
        <span>/</span>
        <Link
          href={`/admin/games/${gameId}/${resourceId}`}
          className="hover:text-foreground"
        >
          {resource.name}
        </Link>
        <span>/</span>
        <span>Edit Attachment</span>
      </nav>

      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Edit Attachment</h1>
        {attachment.pageNumber && (
          <p className="text-muted-foreground mt-1">
            Page {attachment.pageNumber}
          </p>
        )}
      </div>

      {/* Image Preview */}
      <div>
        <Label className="mb-2 block">Preview</Label>
        <div className="border rounded-lg overflow-hidden max-w-2xl bg-muted">
          {attachment.type === "image" && attachment.mimeType?.startsWith("image/") ? (
            <div className="relative">
              <Image
                src={attachment.url}
                alt={attachment.description || attachment.originalFilename || "Attachment"}
                width={attachment.width || 600}
                height={attachment.height || 400}
                className="w-full h-auto"
              />
              {attachment.isGoodQuality && (
                <div className="absolute top-2 right-2">
                  {attachment.isGoodQuality === "good" ? (
                    <div className="bg-white rounded-full p-1">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                  ) : (
                    <div className="bg-white rounded-full p-1">
                      <XCircle className="h-5 w-5 text-red-600" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center p-12">
              <p className="text-muted-foreground">Preview not available</p>
            </div>
          )}
        </div>
        {attachment.width && attachment.height && (
          <p className="text-sm text-muted-foreground mt-2">
            {attachment.width} × {attachment.height}
          </p>
        )}
        {attachment.isGoodQuality !== null && (
          <div className="mt-2">
            <Badge variant={attachment.isGoodQuality === "good" ? "success" : "destructive"}>
              {attachment.isGoodQuality === "good" ? (
                <>
                  <CheckCircle className="w-3 h-3 mr-1 inline" />
                  Good Quality
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3 mr-1 inline" />
                  Low Quality
                </>
              )}
            </Badge>
          </div>
        )}
      </div>

      {/* Edit Form */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Attachment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="originalFilename">Filename</Label>
              <Input
                id="originalFilename"
                type="text"
                value={originalFilename}
                onChange={(e) => setOriginalFilename(e.target.value)}
                placeholder="image.png"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="AI-generated description of the image content"
              />
              <p className="text-xs text-muted-foreground">
                This description helps the AI understand what's in the image when answering questions.
              </p>
            </div>

            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>

              {saveStatus === "success" && (
                <span className="text-sm text-green-600 flex items-center">
                  ✓ Saved successfully
                </span>
              )}
              {saveStatus === "error" && (
                <span className="text-sm text-red-600 flex items-center">
                  ✗ Failed to save
                </span>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={handleReprocess}
                disabled={reprocessing}
              >
                {reprocessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Reprocessing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reprocess with Vision
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Metadata Card */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="font-medium text-muted-foreground">ID</dt>
              <dd className="font-mono text-xs">{attachment.id}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Type</dt>
              <dd>{attachment.type}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">MIME Type</dt>
              <dd className="font-mono text-xs">{attachment.mimeType || "N/A"}</dd>
            </div>
            {attachment.caption && (
              <div className="col-span-2">
                <dt className="font-medium text-muted-foreground">Caption</dt>
                <dd>{attachment.caption}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 4. Update Attachment List to Include Edit Link

**File**: `/Users/dcramer/src/gamegame/app/admin/games/[gameId]/[resourceId]/attachment-list.tsx`

**Changes**: Add edit link to each attachment

```typescript
// In the map function, wrap the anchor with Link to edit page
<Link href={`/admin/games/${gameId}/${resourceId}/attachments/${attachment.id}`}>
  <a href="#"> {/* Show as link */}
    {/* existing preview code */}
  </a>
</Link>
```

### 5. Database Queries (Server Actions)

**File**: `/Users/dcramer/src/gamegame/lib/actions/attachments.ts`

**Add function to get game by ID** (if not exists):

```typescript
export async function getGame(gameId: string) {
  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  return game || null;
}
```

### 6. Authentication Helper

**File**: `/Users/dcramer/src/gamegame/lib/auth/helpers.ts`

Verify `requireAdmin()` function exists and works with API routes.

---

## Testing Plan

### 1. Unit Tests

**File**: `/Users/dcramer/src/gamegame/tests/api/attachments.test.ts`

Add test for POST reprocess endpoint:

```typescript
describe('POST /api/attachments/:attachmentId/reprocess', () => {
  it('should reprocess attachment with vision analysis', async () => {
    // Setup: Create test attachment
    // Mock: OpenAI vision API call
    // Execute: POST to reprocess endpoint
    // Assert: Description and quality updated
  });

  it('should return 401 without admin auth', async () => {
    // Execute: POST without auth
    // Assert: 401 status
  });

  it('should return 404 for non-existent attachment', async () => {
    // Execute: POST to invalid ID
    // Assert: 404 status
  });
});
```

### 2. Integration Tests

**File**: `/Users/dcramer/src/gamegame/tests/admin/attachment-edit.test.ts`

```typescript
describe('Attachment Edit Page', () => {
  it('should load attachment edit page', async () => {
    // Arrange: Create test data
    // Act: Navigate to attachment edit page
    // Assert: Page loads with attachment data
  });

  it('should save attachment changes', async () => {
    // Arrange: Load edit page
    // Act: Update description and filename
    // Assert: Changes persisted to DB
  });

  it('should reprocess with vision', async () => {
    // Arrange: Load edit page
    // Act: Click reprocess button
    // Assert: Description updated, UI reflects changes
  });
});
```

### 3. Manual Testing Checklist

- [ ] Load attachment edit page with valid attachment
- [ ] Edit filename field - verify save works
- [ ] Edit description field - verify save works
- [ ] Clear filename field (set to empty) - verify null in DB
- [ ] Clear description field - verify null in DB
- [ ] Click "Reprocess with Vision" - wait for completion
- [ ] Verify new description appears
- [ ] Verify quality indicator updates
- [ ] Test with missing OpenAI API key - should show error
- [ ] Test with non-existent attachment - should 404
- [ ] Test without admin auth - should 401
- [ ] Test image preview with various formats
- [ ] Test breadcrumb navigation
- [ ] Test toast notifications (success/error)

---

## Migration Checklist

### Pre-Migration
- [ ] Review vision.ts `analyzeImageWithVision` function signature
- [ ] Verify blob storage service API (`getBlob`, `blobKeyToUrl`)
- [ ] Check `requireAdmin()` middleware availability
- [ ] Confirm database schema matches (attachments table fields)

### Migration Steps
1. [ ] Create `/app/admin/games/[gameId]/[resourceId]/attachments/[attachmentId]/page.tsx`
2. [ ] Create `/app/admin/games/[gameId]/[resourceId]/attachments/[attachmentId]/client.tsx`
3. [ ] Add POST handler to `/app/api/attachments/[attachmentId]/route.ts`
4. [ ] Add edit link in `attachment-list.tsx`
5. [ ] Add missing server actions to `lib/actions/attachments.ts` if needed
6. [ ] Create tests in `tests/api/attachments.test.ts` and integration tests
7. [ ] Update admin layout/navigation if needed

### Post-Migration
- [ ] Run all tests
- [ ] Test vision API integration with real OpenAI key
- [ ] Verify blob storage paths work correctly
- [ ] Check authentication flow for admin-only endpoints
- [ ] Performance test with large images
- [ ] Test error scenarios (network failures, API timeouts)

---

## Key Dependencies & Services

### Required Services
1. **Vision API**: `lib/services/vision.ts` - `analyzeImageWithVision()`
2. **Blob Storage**: `lib/services/blob-storage` - `getBlob()`, `blobKeyToUrl()`
3. **Database**: Drizzle ORM with PostgreSQL
4. **Auth**: NextAuth v5 with `requireAdmin()` helper
5. **OpenAI**: API key for vision analysis

### UI Components (already exist)
- Button, Input, Label, Textarea, Badge, Card
- Icons: CheckCircle, XCircle, RefreshCw
- Image component from Next.js
- Link navigation

### Environment Variables Needed
- `OPENAI_API_KEY` - for vision analysis
- `DATABASE_URL` - PostgreSQL connection
- `AUTH_SECRET` - NextAuth configuration
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob (optional if using local storage)

---

## Performance Considerations

1. **Vision API Calls**
   - 60-second timeout per image
   - Retry up to 3 times with exponential backoff
   - Should be fast for single images (compared to batch processing)

2. **Image Preview**
   - Use Next.js Image component with `unoptimized` for external URLs
   - Set proper dimensions for layout stability

3. **Database Queries**
   - Simple single-record fetches (indexed by ID)
   - Updates are single-row operations
   - No N+1 queries

4. **File Size**
   - Base64 encoding increases size by ~33%
   - Consider limiting to reasonable image sizes (< 10MB recommended)

---

## Security Considerations

1. **Authentication**
   - All endpoints protected with `requireAdmin()`
   - GET endpoint can be public (read-only metadata)

2. **Input Validation**
   - Description and filename validated with Zod schema
   - Null handling for optional fields
   - No file uploads (using existing stored images)

3. **Authorization**
   - Admin-only for PATCH and POST endpoints
   - Verify user owns the game/resource/attachment

4. **Rate Limiting**
   - Vision API calls should be rate-limited to prevent abuse
   - Consider adding request throttling for reprocess endpoint

---

## Alternative Approaches Considered

### 1. Dedicated reprocess step file
Instead of inline in route.ts, could extract to `lib/actions/attachments.ts`:
```typescript
export async function reprocessAttachmentVision(attachmentId: string) {
  // Implementation here
}
```
**Benefit**: Reusable from multiple endpoints
**Drawback**: Adds indirection for single use case

### 2. Streaming vision updates
Could stream vision analysis progress back to client:
```typescript
// Server-sent events for real-time progress
export async function POST(...) {
  const stream = new ReadableStream({...});
  return new Response(stream);
}
```
**Benefit**: Better UX for long-running operations
**Drawback**: More complex, not necessary for single images

### 3. Batch reprocess for resource
Could add endpoint to reprocess all images in resource at once:
```typescript
POST /api/resources/:resourceId/reprocess-all
```
**Benefit**: Bulk operations faster
**Drawback**: Requires separate UI, workflow complexity

---

## Summary

The Attachment Edit page is a comprehensive admin interface requiring:

- **3 new files**: page.tsx, client.tsx, and updated API route
- **1 API enhancement**: POST reprocess endpoint
- **1 UI update**: Link in attachment list
- **Vision service integration**: Uses existing analyzeImageWithVision()
- **Admin authentication**: Protects editing and reprocessing
- **Database operations**: Simple CRUD with single record lookups

The implementation follows Next.js 15 App Router patterns and integrates seamlessly with the existing GameGame architecture. All dependencies (vision API, blob storage, auth) are already available in the codebase.
