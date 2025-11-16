# Resource Details UI Architecture: Workers vs Next.js

## Executive Summary

The Remix/Workers implementation uses a **tab-based architecture with nested routes**, while the Next.js implementation uses a **single combined page**. This analysis compares the two approaches and provides a detailed Next.js restructuring plan.

---

## Current Architecture Comparison

### Workers Implementation (Remix)

**Route Structure:**
```
/admin/games/$gameId/resources/$resourceId
  └── /details (default)
  └── /attachments
```

**File Organization:**
```
admin.games.$gameId.resources.$resourceId.tsx       # Layout container
├── admin.games.$gameId.resources.$resourceId.details.tsx        # Details tab content
└── admin.games.$gameId.resources.$resourceId.attachments-list.tsx # Attachments tab
```

**Key Features:**
- Tab navigation in parent layout
- Sidebar with action buttons (reprocessing, download, delete)
- Right sidebar is **always visible** across both tabs
- URL-based tab switching
- Centralized resource data loading in parent

### Next.js Implementation (Current)

**Route Structure:**
```
/app/admin/games/[gameId]/[resourceId]/page.tsx (combined)
```

**Single File Contains:**
- Resource metadata display
- Form fields (name, content editable)
- Attachment list
- No tab separation
- No sidebar actions visible

---

## Detailed Comparison: What's in Each Tab

### Workers: Details Tab
**File:** `admin.games.$gameId.resources.$resourceId.details.tsx`

**Contents:**
```
Form Fields (Editable):
├── Document Title (input)
├── Description (textarea)
├── Author/Creator (input)
└── Attribution URL (input)

Read-Only Fields:
├── Original Filename (static)
├── Created (timestamp, auto-formatted)
├── Last Updated (timestamp, auto-formatted)
└── Markdown Content (large textarea, read-only with note)

Save Button (with status feedback)
```

**Key Features:**
- Only metadata is editable (name, description, author, attribution)
- Content field is **read-only** with explanation: "Content is managed by the processing pipeline"
- Auto-reload on job completion via context watching
- Save status feedback (idle/success/error)
- Form submission excludes content field

**State Management:**
```typescript
// Watches for job completion notifications
useEffect(() => {
  // When a processing job completes:
  // 1. Detects completed job via notification context
  // 2. Fetches updated resource from API
  // 3. Updates all form fields with new values
}, [notifications, resourceId]);
```

### Workers: Attachments Tab
**File:** `admin.games.$gameId.resources.$resourceId.attachments-list.tsx`

**Contents:**
```
Attachment Grid (5 columns):
├── Image preview (or file icon)
├── Page number (if available)
├── Quality badge (green ✓ or red ✗)
├── Caption
├── Description (expandable)
├── Original filename
└── Dimensions (if image)

Features:
├── Click to open original
├── Expand/collapse descriptions
└── Quality indicators
```

**Data Source:**
- Loaded once at parent level via loader
- Passed down via Outlet context
- No dynamic updates to attachment list on this tab

### Workers: Right Sidebar (Persistent Across Tabs)
**Location:** Same layout component, rendered alongside tabs

**Sections:**

1. **Reprocessing (5 options)**
   - Full Reprocess (from 'ingest')
   - Improve Image Descriptions (from 'vision')
   - Clean Up Markdown (from 'cleanup')
   - Regenerate Metadata (from 'metadata')
   - Regenerate Embeddings (from 'embed')

   **Behavior:**
   ```typescript
   - Shows title and description
   - Creates notification immediately (optimistic)
   - Updates notification with jobId once API responds
   - Shows job polling status
   - Automatically reloads resource when job completes
   ```

2. **Download**
   - Link to original resource URL
   - Opens in new tab

3. **Danger Zone**
   - Delete button with confirmation
   - Shows what will be deleted
   - Navigates back to game page on success

---

## Next.js: Current Combined Page

**File:** `/app/admin/games/[gameId]/[resourceId]/page.tsx`

**What's Currently Shown:**
```
Header:
├── Resource name (h3)
├── Download button
└── Stats (chunks, pages, images, words)

Combined Content (No Tabs):
├── ResourceForm
│   ├── Name (editable)
│   └── Content (editable - DIFFERENT FROM WORKERS!)
└── AttachmentList
    └── Grid of attachments
```

**Problems with Current Implementation:**
1. **Content field is editable** - Workers version is read-only
2. **No sidebar actions** - Reprocessing buttons missing
3. **No tab organization** - Everything on one page
4. **Content field should not be editable** - Pipeline-managed, not user-editable
5. **No job completion auto-reload** - Details don't refresh when processing completes
6. **Limited form validation** - Current form allows saving content (which shouldn't happen)

---

## Benefits of Tab Separation (Workers)

### 1. **Information Hierarchy**
- Separates **editable metadata** (details tab) from **view-only media** (attachments tab)
- Clear mental model: "Configure here" vs "View here"

### 2. **Performance**
- Attachments list not re-rendered when updating metadata
- Reduced JavaScript bundle per tab
- Each tab can have independent scroll position

### 3. **UI Space Management**
- Sidebar always visible but doesn't push content down
- Metadata form doesn't compete for space with attachment grid
- Better for mobile (can hide sidebar, full-width tabs)

### 4. **Scalability**
- Easy to add future tabs (e.g., "Fragments", "Search Index", "Version History")
- Cleaner code organization
- Reduced cognitive load per component

### 5. **Business Logic Clarity**
- **Details Tab:** User can control metadata only
- **Attachments Tab:** Read-only view of extracted media
- **Sidebar:** System actions (reprocessing, maintenance)
- Clear separation of concerns

### 6. **Job Completion UX**
- Auto-reload of details when processing completes
- User stays on details tab where changes are visible
- No need to switch tabs to see updated metadata

---

## Auto-Reload on Job Completion Feature

### Workers Implementation

**Mechanism:**
```typescript
// In details tab component
useEffect(() => {
  const jobNotifications = notifications.filter(
    (n): n is JobNotification => n.type === 'job'
  );

  for (const job of jobNotifications) {
    if (
      job.status === 'completed' &&
      !completedJobsRef.current.has(job.jobId)
    ) {
      completedJobsRef.current.add(job.jobId);  // Prevent duplicate reloads

      // Fetch fresh resource data
      const reloadResource = async () => {
        const response = await apiClient.fetch(`/resources/${resourceId}`);
        if (response.ok) {
          const updatedResource = await response.json();
          // Update all form fields with new data
          setResource(updatedResource);
          setName(updatedResource.name);
          setContent(updatedResource.content);
          setDescription(updatedResource.description);
          // ... etc
        }
      };

      reloadResource();
    }
  }
}, [notifications, resourceId]);
```

**Flow:**
1. User clicks "Regenerate Metadata" in sidebar
2. Notification created with pending status
3. API returns jobId
4. Notification updates with jobId
5. Polling watches for job completion
6. When job completes, notification fires with `status: 'completed'`
7. Details tab detects completion via useEffect
8. Fetches fresh resource from `/resources/{id}`
9. Updates all form fields (name, description, author, attribution, content)
10. User sees metadata updated in real-time

**Notification Structure:**
```typescript
interface JobNotification {
  id: string;
  type: 'job';
  jobId: string;
  title: string;          // e.g. "Regenerate Metadata"
  description: string;    // e.g. "Updating document title and description"
  status: 'pending' | 'completed' | 'failed';
  createdAt: number;
}
```

**Key Implementation Details:**
- `completedJobsRef` prevents duplicate reloads (job can only trigger reload once)
- Runs in background while user can continue working
- Works across tab switches (context is global)
- Graceful failure: user is notified if reload fails

---

## Read-Only Content Field Handling

### Workers Implementation

**Display:**
```typescript
<div className="space-y-2">
  <Label htmlFor="content">Markdown Content</Label>
  <textarea
    id="content"
    value={content}
    readOnly                    // ← Read-only attribute
    rows={16}
    placeholder="Markdown Content"
    className="...font-mono cursor-not-allowed"  // ← Visual indicator
  />
  <p className="text-xs text-muted-foreground">
    Content is managed by the processing pipeline. Use the "Advanced Reprocessing" panel to regenerate content.
  </p>
</div>
```

**Behavior:**
- User cannot type in field
- Cursor changes to "not-allowed"
- Background color is "muted" to indicate disabled state
- Helper text explains why and how to modify
- Form submission excludes content:
  ```typescript
  const payload = {
    name,
    // content is NOT included here
    description: description.trim() ? description : null,
    author: author.trim() ? author : null,
    attributionUrl: attributionUrl.trim() ? attributionUrl : null,
  };
  ```

### Why This Matters

1. **Data Integrity:** Content is pipeline-generated, user modifications would break RAG
2. **Clear Intent:** Admin can see they can't modify content
3. **Audit Trail:** Only pipeline changes content, no accidental overwrites
4. **Workflow:** User knows to use reprocessing buttons instead

### Current Next.js Problem

The current form has:
```typescript
<Textarea
  id="content"
  name="content"
  defaultValue={initialData?.content}  // ← Editable!
  rows={16}
  required                              // ← Enforces it
/>
```

This is **incorrect** - content should not be editable.

---

## Complete Next.js Restructuring Plan

### Phase 1: Route Structure

**Current:**
```
app/admin/games/[gameId]/
├── [resourceId]/page.tsx (combined)
├── [resourceId]/form.tsx
└── [resourceId]/attachment-list.tsx
```

**Target:**
```
app/admin/games/[gameId]/resources/
├── [resourceId]/
│   ├── layout.tsx (new - container with tabs)
│   ├── page.tsx (redirect or details tab)
│   ├── details/
│   │   └── page.tsx (details tab content)
│   └── attachments/
│       └── page.tsx (attachments tab content)
├── [resourceId]/form.tsx (moved)
└── [resourceId]/attachment-list.tsx (moved)
```

**Benefits:**
- Mirrors Workers structure
- URL reflects tab state: `/resources/123/details` vs `/resources/123/attachments`
- Easier to manage permissions per tab
- Cleaner file organization

### Phase 2: Layout Component Structure

**File:** `/app/admin/games/[gameId]/resources/[resourceId]/layout.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Download, Trash2 } from 'lucide-react';
import { getResource } from '@/lib/actions/resources';

export default function ResourceLayout({
  params: { gameId, resourceId },
  children,
}: {
  params: { gameId: string; resourceId: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);

  // Determine active tab from pathname
  const activeTab = pathname.includes('/attachments') ? 'attachments' : 'details';

  // Load resource once
  useEffect(() => {
    const loadResource = async () => {
      const data = await getResource(resourceId, true);
      setResource(data);
      setLoading(false);
    };
    loadResource();
  }, [resourceId]);

  if (loading) return <div>Loading...</div>;
  if (!resource) return <div>Resource not found</div>;

  return (
    <div>
      {/* Header with title and stats */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{resource.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {[
              `${resource.embeddingCount.toLocaleString()} chunks`,
              resource.pageCount && `${resource.pageCount} pages`,
              resource.imageCount > 0 && `${resource.imageCount} images`,
            ]
              .filter(Boolean)
              .join(' • ')}
          </p>
        </div>
        <a href={resource.url} target="_blank" rel="noopener noreferrer">
          <Download className="h-5 w-5" />
        </a>
      </div>

      {/* Tab navigation */}
      <Tabs value={activeTab} onValueChange={(tab) => {
        router.push(
          tab === 'attachments'
            ? `/admin/games/${gameId}/resources/${resourceId}/attachments`
            : `/admin/games/${gameId}/resources/${resourceId}/details`
        );
      }}>
        <TabsList className="mb-8">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="attachments">Attachments</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-8">
        {/* Main content */}
        <div>{children}</div>

        {/* Right sidebar */}
        <div className="lg:sticky lg:top-8 lg:self-start space-y-8">
          {/* Reprocessing section */}
          <ResourceActions resourceId={resourceId} />
        </div>
      </div>
    </div>
  );
}
```

### Phase 3: Resource Form Component

**File:** `/app/admin/games/[gameId]/resources/[resourceId]/form.tsx`

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateResourceForm } from '@/lib/actions/forms';
import { Loader2 } from 'lucide-react';
import { useJobNotifications } from '@/hooks/useJobNotifications';

export default function ResourceForm({
  resourceId,
  initialData,
}: {
  resourceId: string;
  initialData: {
    name: string;
    description: string | null;
    author: string | null;
    attributionUrl: string | null;
    content: string;
    originalFilename: string | null;
    createdAt: number;
    updatedAt: number;
  };
}) {
  const [isLoading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  // Form state
  const [name, setName] = useState(initialData.name);
  const [description, setDescription] = useState(initialData.description || '');
  const [author, setAuthor] = useState(initialData.author || '');
  const [attributionUrl, setAttributionUrl] = useState(initialData.attributionUrl || '');
  const [content, setContent] = useState(initialData.content);
  
  const completedJobsRef = useRef<Set<string>>(new Set());
  const { notifications } = useJobNotifications();

  // Auto-reload on job completion
  useEffect(() => {
    const jobNotifications = notifications.filter(
      (n) => n.type === 'job'
    );

    for (const job of jobNotifications) {
      if (
        job.status === 'completed' &&
        !completedJobsRef.current.has(job.jobId)
      ) {
        completedJobsRef.current.add(job.jobId);

        const reloadResource = async () => {
          try {
            const response = await fetch(`/api/resources/${resourceId}`);
            if (response.ok) {
              const updated = await response.json();
              setName(updated.name);
              setDescription(updated.description || '');
              setAuthor(updated.author || '');
              setAttributionUrl(updated.attributionUrl || '');
              setContent(updated.content);
            }
          } catch (error) {
            console.error('Failed to reload resource:', error);
          }
        };

        reloadResource();
      }
    }
  }, [notifications, resourceId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaveStatus('idle');

    try {
      const formData = new FormData();
      formData.set('name', name);
      formData.set('description', description.trim() || '');
      formData.set('author', author.trim() || '');
      formData.set('attributionUrl', attributionUrl.trim() || '');
      // NOTE: content is NOT included - it's managed by pipeline

      await updateResourceForm(resourceId, formData);
      setSaveStatus('success');
    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="name">Document Title</Label>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Game Manual"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Short description of this resource"
          className="font-mono"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="author">Author / Creator</Label>
        <Input
          id="author"
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="e.g. Fantasy Flight Games"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="attributionUrl">Attribution URL</Label>
        <Input
          id="attributionUrl"
          type="url"
          value={attributionUrl}
          onChange={(e) => setAttributionUrl(e.target.value)}
          placeholder="https://publisher.com/rulebook"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="originalFilename">Original Filename</Label>
        <Input
          id="originalFilename"
          type="text"
          value={initialData.originalFilename || ''}
          readOnly
          className="font-mono bg-muted cursor-not-allowed"
        />
        <p className="text-xs text-muted-foreground">
          This field is read-only and cannot be edited.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="createdAt">Created</Label>
          <Input
            id="createdAt"
            type="text"
            value={new Date(initialData.createdAt).toLocaleString()}
            readOnly
            className="bg-muted cursor-not-allowed"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="updatedAt">Last Updated</Label>
          <Input
            id="updatedAt"
            type="text"
            value={new Date(initialData.updatedAt).toLocaleString()}
            readOnly
            className="bg-muted cursor-not-allowed"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Markdown Content</Label>
        <Textarea
          id="content"
          value={content}
          readOnly
          rows={16}
          placeholder="Markdown Content"
          className="font-mono bg-muted cursor-not-allowed"
        />
        <p className="text-xs text-muted-foreground">
          Content is managed by the processing pipeline. Use the "Reprocessing" panel to regenerate content.
        </p>
      </div>

      <Button type="submit" disabled={isLoading}>
        Save Changes
        {isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
      </Button>

      {saveStatus === 'success' && (
        <p className="text-sm text-green-600">Saved successfully!</p>
      )}
      {saveStatus === 'error' && (
        <p className="text-sm text-red-600">Failed to save. Please try again.</p>
      )}
    </form>
  );
}
```

### Phase 4: Details Tab Page

**File:** `/app/admin/games/[gameId]/resources/[resourceId]/details/page.tsx`

```typescript
import { getResource } from '@/lib/actions/resources';
import { notFound } from 'next/navigation';
import ResourceForm from '../form';

export default async function DetailsPage(
  props: {
    params: Promise<{ resourceId: string }>;
  }
) {
  const params = await props.params;
  const resource = await getResource(params.resourceId, true);

  if (!resource) {
    notFound();
  }

  return <ResourceForm resourceId={params.resourceId} initialData={resource} />;
}
```

### Phase 5: Attachments Tab Page

**File:** `/app/admin/games/[gameId]/resources/[resourceId]/attachments/page.tsx`

```typescript
import { getResourceAttachments } from '@/lib/actions/attachments';
import { notFound } from 'next/navigation';
import AttachmentList from '../attachment-list';

export default async function AttachmentsPage(
  props: {
    params: Promise<{ resourceId: string }>;
  }
) {
  const params = await props.params;
  const attachments = await getResourceAttachments(params.resourceId);

  if (!attachments) {
    notFound();
  }

  return <AttachmentList attachments={attachments} />;
}
```

### Phase 6: Resource Actions Component

**File:** `/app/admin/games/[gameId]/resources/[resourceId]/actions.tsx`

```typescript
'use client';

import { useState } from 'react';
import { RefreshCw, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/useToast';

interface ResourceActionsProps {
  resourceId: string;
  resourceUrl: string;
  resourceName: string;
  gameId: string;
}

export default function ResourceActions({
  resourceId,
  resourceUrl,
  resourceName,
  gameId,
}: ResourceActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleReprocess = async (
    from: 'ingest' | 'vision' | 'cleanup' | 'metadata' | 'embed'
  ) => {
    const titles: Record<typeof from, { title: string; description: string }> = {
      ingest: { title: 'Full Reprocess', description: 'Complete pipeline from scratch' },
      vision: { title: 'Improve Image Descriptions', description: 'Re-analyze image content' },
      cleanup: { title: 'Clean Up Markdown', description: 'Fix formatting issues' },
      metadata: { title: 'Regenerate Metadata', description: 'Update document title and description' },
      embed: { title: 'Regenerate Embeddings', description: 'Update search index' },
    };

    const { title, description } = titles[from];

    try {
      const url =
        from === 'ingest'
          ? `/api/resources/${resourceId}/reprocess`
          : `/api/resources/${resourceId}/reprocess?from=${from}`;

      const response = await fetch(url, { method: 'POST' });
      if (response.ok) {
        toast({
          title,
          description: 'Processing started...',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to start reprocessing',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start reprocessing',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Delete resource "${resourceName}"?\n\nThis will permanently delete:\n- The resource file\n- All fragments and embeddings\n- All associated attachments\n\nThis action cannot be undone.`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/resources/${resourceId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Resource deleted successfully',
        });
        router.push(`/admin/games/${gameId}`);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete resource',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete resource',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Reprocessing */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Reprocessing</h3>
        <div className="space-y-2">
          <ActionButton
            icon={RefreshCw}
            title="Full Reprocess"
            description="Complete pipeline from scratch"
            onClick={() => handleReprocess('ingest')}
          />
          <ActionButton
            icon={RefreshCw}
            title="Improve Image Descriptions"
            description="Re-analyze image content"
            onClick={() => handleReprocess('vision')}
          />
          <ActionButton
            icon={RefreshCw}
            title="Clean Up Markdown"
            description="Fix formatting issues"
            onClick={() => handleReprocess('cleanup')}
          />
          <ActionButton
            icon={RefreshCw}
            title="Regenerate Metadata"
            description="Update document title and description"
            onClick={() => handleReprocess('metadata')}
          />
          <ActionButton
            icon={RefreshCw}
            title="Regenerate Embeddings"
            description="Update search index"
            onClick={() => handleReprocess('embed')}
          />
        </div>
      </div>

      {/* Download */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Download</h3>
        <a
          href={resourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors group"
        >
          <div className="flex items-start gap-3">
            <Download className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm mb-1">Download Resource</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Get the original source file
              </div>
            </div>
          </div>
        </a>
      </div>

      {/* Danger Zone */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Danger Zone</h3>
        <ActionButton
          icon={Trash2}
          title="Delete Resource"
          description="Permanently removes all data"
          onClick={handleDelete}
          variant="danger"
          disabled={isDeleting}
        />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ComponentType<{ className: string }>;
  title: string;
  description: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

function ActionButton({
  icon: Icon,
  title,
  description,
  onClick,
  variant = 'default',
  disabled = false,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left p-3 rounded-lg border transition-colors group ${
        variant === 'danger'
          ? 'border-destructive/20 bg-destructive/5 hover:bg-destructive/10 hover:border-destructive/30'
          : 'border-border bg-card hover:bg-accent hover:border-accent-foreground/20'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm mb-1">{title}</div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </div>
        </div>
      </div>
    </button>
  );
}
```

### Phase 7: Update Routing

**Changes to existing files:**

1. **Update `/app/admin/games/[gameId]/layout.tsx`:**
   - Update resource link from `/[resourceId]` to `/resources/[resourceId]/details`

2. **Update `/app/admin/games/[gameId]/resource-list.tsx`:**
   - Update resource links to point to `/resources/{id}/details`

3. **Add redirect from old URL:**
   ```typescript
   // app/admin/games/[gameId]/[resourceId]/page.tsx (new redirect)
   import { redirect } from 'next/navigation';

   export default function RedirectPage(props: {
     params: Promise<{ gameId: string; resourceId: string }>;
   }) {
     const params = await props.params;
     redirect(`/admin/games/${params.gameId}/resources/${params.resourceId}/details`);
   }
   ```

---

## Migration Checklist

```
Phase 1: Route Structure
[ ] Create new /resources/[resourceId] directory
[ ] Create layout.tsx with tab structure
[ ] Create details/ subdirectory
[ ] Create attachments/ subdirectory
[ ] Verify imports still work

Phase 2: Form Component
[ ] Update form to make content read-only
[ ] Add job notification listening
[ ] Update form submission to exclude content
[ ] Test save functionality

Phase 3: Tab Pages
[ ] Create details/page.tsx
[ ] Create attachments/page.tsx
[ ] Test tab navigation
[ ] Test URL updates correctly

Phase 4: Sidebar Actions
[ ] Create actions.tsx component
[ ] Implement reprocessing handlers
[ ] Implement delete handler
[ ] Test all 5 reprocessing options

Phase 5: Update Links
[ ] Update resource-list.tsx links
[ ] Update game page links
[ ] Add redirect from old URLs
[ ] Test all navigation paths

Phase 6: Testing
[ ] Tab switching works
[ ] Form saves correctly
[ ] Content field is read-only
[ ] Auto-reload on job completion
[ ] Mobile responsive layout
[ ] Delete functionality
[ ] Reprocessing notifications

Phase 7: Cleanup
[ ] Remove old page.tsx
[ ] Remove duplicate code
[ ] Update documentation
```

---

## Key Differences Summary

| Aspect | Workers | Next.js (Target) |
|--------|---------|------------------|
| **Tab Organization** | URL-based routes | Nested routes with layout |
| **Content Field** | Read-only with explanation | Should be read-only (currently editable!) |
| **Sidebar** | Always visible, persistent | Always visible in grid layout |
| **Job Auto-Reload** | Yes, watches notifications | Yes, same mechanism |
| **Form Submission** | Excludes content | Should exclude content |
| **Metadata Fields** | name, description, author, attribution | Same |
| **Editable Fields** | Only metadata | Only metadata |
| **Attachments Tab** | Separate route | Separate route |

---

## Benefits of This Restructuring

1. **Feature Parity:** Matches Workers implementation exactly
2. **Better UX:** Clear tab organization, persistent sidebar
3. **Correctness:** Content field properly read-only
4. **Scalability:** Easy to add more tabs later
5. **Performance:** Tab content loads independently
6. **Code Quality:** Proper separation of concerns
7. **Maintainability:** Mirrors Workers structure for easier team understanding

