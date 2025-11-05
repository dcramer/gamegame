# Attachment Edit Page - Porting Documentation

## Overview

This directory contains comprehensive documentation for porting the Remix Attachment Edit page to Next.js App Router.

## Documents Included

### 1. ATTACHMENT_EDIT_QUICK_REFERENCE.md
**Start here** - Quick reference guide covering:
- Features to implement
- Files to create/update
- Data model
- Testing checklist
- Complexity assessment (4-6 hours)
- Common pitfalls

### 2. ATTACHMENT_EDIT_PORTING.md
**Detailed implementation guide** (1152 lines) with:
- Complete feature list with descriptions
- Full data model and types
- All 3 API endpoints with request/response examples
- Image quality indicator implementation details
- Vision reprocessing workflow step-by-step
- Complete Next.js implementation with full code
- Testing plan and manual testing checklist
- Migration checklist
- Performance and security considerations

### 3. ATTACHMENT_EDIT_ARCHITECTURE.md
**Visual reference** with:
- Component architecture diagram
- Data flow diagrams (save and reprocess operations)
- Database schema documentation
- API request/response examples
- State machine diagrams
- Error handling flow
- Security flow diagram
- Vision service integration diagram

## Key Features

The Attachment Edit page provides a comprehensive admin interface for managing image attachments from PDFs:

1. **Image Preview** - Display with dimensions and optional quality badge
2. **Metadata Editing** - Edit filename and AI-generated description
3. **Vision Reprocessing** - Regenerate description and quality assessment using GPT-5
4. **Quality Indicators** - Visual badges (good=green, bad=red)
5. **Breadcrumb Navigation** - Full navigation trail
6. **Error Handling** - User-friendly messages
7. **Metadata Display** - Read-only reference information

## Quick Start

### Prerequisites
- Next.js 15 with App Router
- PostgreSQL database with attachments table
- OpenAI API key for vision analysis
- Vercel Blob or local blob storage configured

### Files to Create
```
app/admin/games/[gameId]/[resourceId]/attachments/[attachmentId]/
├── page.tsx (server component - loads data)
└── client.tsx (client component - handles UI/interactions)
```

### Files to Update
```
app/api/attachments/[attachmentId]/route.ts
  └── Add: POST handler for /reprocess endpoint

app/admin/games/[gameId]/[resourceId]/attachment-list.tsx
  └── Add: Link to edit page for each attachment

lib/actions/attachments.ts
  └── Verify: getGame() function exists
```

### Implementation Steps
1. Start with POST /api/attachments/:attachmentId/reprocess endpoint
2. Create page.tsx and client.tsx components
3. Update attachment list with edit link
4. Write tests for new endpoints
5. Test vision API integration
6. Deploy and monitor

## API Endpoints

### Existing (Verify)
- `GET /api/attachments/:attachmentId` - Fetch attachment
- `PATCH /api/attachments/:attachmentId` - Update metadata

### To Implement
- `POST /api/attachments/:attachmentId/reprocess` - Vision reprocessing

## Key Implementation Details

### Vision Reprocessing Flow
```
User clicks "Reprocess with Vision"
    ↓
fetch POST /api/attachments/:id/reprocess
    ↓
Backend:
  1. Fetch attachment from DB
  2. Get image from blob storage
  3. Convert to base64
  4. Call analyzeImageWithVision()
  5. Update DB
    ↓
Return updated attachment
    ↓
Update local state and UI
```

### Quality Badge
- Only shown if `isGoodQuality !== null`
- Displayed in 2 places:
  1. Top-right overlay on image
  2. Below page number in metadata
- Icons: CheckCircle (good), XCircle (bad)

### Form State Management
- Separate state for inputs (description, filename)
- Current attachment state from DB
- Save status tracking (idle, success, error)
- Auto-reset status after 3 seconds

## Testing Checklist

- [ ] Load attachment edit page
- [ ] Edit and save filename
- [ ] Edit and save description
- [ ] Clear fields (set to null)
- [ ] Click "Reprocess with Vision"
- [ ] Verify description updates
- [ ] Verify quality badge updates
- [ ] Test without admin auth (401)
- [ ] Test with non-existent attachment (404)
- [ ] Verify breadcrumb navigation
- [ ] Test error messages

## Resources

- Vision service: `/lib/services/vision.ts`
- Blob storage: `/lib/services/blob-storage.ts`
- Auth helpers: `/lib/auth/helpers.ts`
- Database schema: `/lib/db/schema/attachments.ts`
- Existing tests: `/tests/api/attachments.test.ts`

## Common Pitfalls

1. Forget to await `props.params` in server component
2. Missing `"use client"` directive in client component
3. Not checking admin auth on protected endpoints
4. Not handling blob storage errors (missing images)
5. Not validating OpenAI API key exists
6. Image dimensions not set (causes layout shift)
7. Not resetting form state after operations
8. Vision API calls can be expensive - test carefully

## Architecture

### Server Component
- Loads data using server actions
- Handles 404 for missing data
- Generates metadata for SEO
- Renders client component

### Client Component
- Form state management
- API call handlers (save and reprocess)
- UI rendering with Tailwind
- Error/success notifications

### API Routes
- PATCH: Update attachment metadata
- POST: Trigger vision reprocessing

### Database
- Simple update operations
- No complex joins
- Good indexes on resource_id and game_id

## Performance

- Page load: ~200ms (server actions + DB query)
- Vision reprocessing: ~10-30s (depends on OpenAI)
- Form save: ~500ms (DB update + response)
- Image preview: Instant (using blob storage)

## Security

- All write operations require admin auth
- GET endpoint can be public (read-only)
- Input validation with Zod
- No file uploads (using existing files)
- CORS headers configured in blob storage

## Environment Variables

Required:
- `OPENAI_API_KEY` - For vision API
- `DATABASE_URL` - PostgreSQL connection

Optional:
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob (falls back to local)

## Support

For questions, refer to:
- Full documentation: `ATTACHMENT_EDIT_PORTING.md`
- Architecture diagrams: `ATTACHMENT_EDIT_ARCHITECTURE.md`
- Quick reference: `ATTACHMENT_EDIT_QUICK_REFERENCE.md`

## Status

- Documentation: Complete
- Implementation: Ready to start
- Tests: Placeholder provided
- Vision integration: Existing service available
