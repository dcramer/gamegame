# Attachment Edit Page - Quick Reference Summary

## What's Being Ported

The Remix Attachment Edit page is a comprehensive admin interface for managing image attachments extracted from PDFs. Located at:
```
workers/app/routes/admin.games.$gameId.resources.$resourceId.attachments.$attachmentId.tsx
```

## Key Features to Implement

1. **Image Preview** - Display attachment with quality badge overlay
2. **Metadata Editing** - Edit filename and description fields  
3. **Vision Reprocessing** - Regenerate description/quality using GPT-5 vision API
4. **Metadata Display** - Show ID, type, MIME type, caption
5. **Breadcrumb Navigation** - Admin > Games > Game > Resource > Attachment
6. **Error Handling** - User-friendly messages for all operations
7. **Quality Indicators** - Green checkmark for good, red X for bad quality

## Files to Create (3 new files)

### 1. Page Component (Server)
`/app/admin/games/[gameId]/[resourceId]/attachments/[attachmentId]/page.tsx`
- Loads attachment, resource, game data
- Renders client component
- Handles metadata generation

### 2. Client Component  
`/app/admin/games/[gameId]/[resourceId]/attachments/[attachmentId]/client.tsx`
- Form state management
- Save and reprocess handlers
- Image preview with quality badge
- Metadata cards

### 3. API Route Enhancement
Add POST handler to `/app/api/attachments/[attachmentId]/route.ts`
- Endpoint: `POST /api/attachments/:attachmentId/reprocess`
- Uses `analyzeImageWithVision()` from vision service
- Updates description and isGoodQuality fields

## Files to Update (2 existing files)

### 1. Attachment List Component
`/app/admin/games/[gameId]/[resourceId]/attachment-list.tsx`
- Add Link to edit page for each attachment

### 2. Attachment Actions (if needed)
`/lib/actions/attachments.ts`
- May need getGame() function added

## API Endpoints Required

**Already Exists:**
- `GET /api/attachments/:attachmentId` - Fetch attachment
- `PATCH /api/attachments/:attachmentId` - Update metadata

**Needs to be Added:**
- `POST /api/attachments/:attachmentId/reprocess` - Vision reprocessing

## Data Model

```typescript
Attachment {
  id: string                     // nanoid
  type: "image"                  // Attachment type
  mimeType: string | null        // e.g., "image/png"
  url: string                    // Public URL
  originalFilename: string | null
  pageNumber: number | null      // Page from PDF
  bbox: number[] | null          // [x1, y1, x2, y2]
  caption: string | null         // Auto-generated
  width: number | null           // Pixels
  height: number | null          // Pixels
  description: string | null     // AI-generated
  isGoodQuality: "good"|"bad"|null  // Quality assessment
}
```

## Vision Reprocessing Flow

```
User clicks "Reprocess with Vision"
         ↓
POST /api/attachments/:attachmentId/reprocess
         ↓
1. Fetch attachment from DB
2. Get image from blob storage (using blobKey)
3. Convert to base64
4. Call analyzeImageWithVision() with:
   - base64Image
   - empty surroundingText (single image)
   - openaiApiKey
   - metadata: { imageId, pageNumber }
5. Model (GPT-5 prod, GPT-4o-mini dev):
   - Generates short sentence description
   - Assesses quality (GOOD/BAD)
   - Returns { description, isGoodQuality }
6. Retry: max 3 attempts, 60s timeout, exponential backoff
7. Update DB with new description and isGoodQuality
8. Return updated attachment
         ↓
Update local form state
Display success message
```

## Key Implementation Details

### Authentication
- All write operations require `requireAdmin()` 
- GET endpoint can be public (read-only)

### Quality Badge Display
Shown in two places if `isGoodQuality !== null`:
1. Top-right overlay on image preview
2. Below page number in metadata section

Icon variants:
- Good: Green checkmark ✓
- Bad: Red X ✗

### Form State Management
- Separate state for form inputs vs. attachment data
- Sync from DB on successful save/reprocess
- Save status: idle, success, error
- Auto-reset status after 3 seconds

### Image Preview
- Uses Next.js Image component
- Set `unoptimized` for external blob URLs
- Fallback message if type is not image

## Required Services & Dependencies

**Vision Analysis**
- `lib/services/vision.ts` - `analyzeImageWithVision()`
- Already exists in codebase
- Returns: `{ description: string, isGoodQuality: 'good'|'bad' }`

**Blob Storage**
- `lib/services/blob-storage` - `getBlob()`, `blobKeyToUrl()`
- Fetch image by blobKey, convert to public URL

**Authentication**
- `lib/auth/helpers.ts` - `requireAdmin()`
- Protects admin endpoints

**Database**
- Drizzle ORM with PostgreSQL
- attachments table with all fields

**Environment**
- `OPENAI_API_KEY` - Required for vision API

## UI Components (All Already Exist)

- Button, Input, Label, Textarea, Badge
- Card, CardContent, CardHeader, CardTitle
- Icons: CheckCircle, XCircle, RefreshCw
- Next.js Image, Link

## Testing Checklist

- [ ] Load edit page with valid attachment
- [ ] Edit and save filename
- [ ] Edit and save description  
- [ ] Clear fields (set to null)
- [ ] Reprocess with vision - verify updates
- [ ] Verify quality badge updates
- [ ] Test without admin auth (401)
- [ ] Test with non-existent attachment (404)
- [ ] Test missing OpenAI API key error
- [ ] Verify breadcrumb navigation works
- [ ] Verify image preview displays correctly
- [ ] Test all error messages and toasts

## Complexity Assessment

**Overall Complexity: Medium**

- Simple CRUD operations (existing pattern)
- Vision API integration (existing service)
- Form state management (standard React patterns)
- 3 new files, 1 API endpoint, 2 minor updates

**Estimated Effort: 4-6 hours**
- 2 hours: Page components
- 1 hour: API endpoint
- 1 hour: Integration with vision service
- 1-2 hours: Testing and refinement

## Key Differences from Remix

| Aspect | Remix | Next.js |
|--------|-------|---------|
| Page Structure | Single file route | Server + Client components |
| Form Submission | Native form | Fetch API |
| Loader/Action | Remix loaders | Server actions + API routes |
| Navigation | useNavigate hook | Next.js Link |
| Toast Notifications | No built-in | Use custom or library |
| Image Handling | Img tag | Next.js Image |

## Common Pitfalls to Avoid

1. Don't forget to await `props.params` in server components
2. Mark client components with `"use client"`
3. Use `requireAdmin()` on all protected endpoints
4. Handle blob storage errors (missing images)
5. Validate OpenAI API key before calling vision API
6. Set proper image dimensions for layout stability
7. Remember to reset form state after save/reprocess
8. Test with real OpenAI API (vision model is expensive)

## File Locations Reference

```
NEW:
  app/admin/games/[gameId]/[resourceId]/attachments/[attachmentId]/page.tsx
  app/admin/games/[gameId]/[resourceId]/attachments/[attachmentId]/client.tsx

UPDATE:
  app/api/attachments/[attachmentId]/route.ts (add POST)
  app/admin/games/[gameId]/[resourceId]/attachment-list.tsx (add link)
  lib/actions/attachments.ts (verify getGame exists)

REFERENCE:
  lib/services/vision.ts (analyzeImageWithVision)
  lib/services/blob-storage.ts (getBlob, blobKeyToUrl)
  lib/auth/helpers.ts (requireAdmin)
  lib/db/schema/attachments.ts (schema reference)
```

## Next Steps

1. Review full analysis: `/Users/dcramer/src/gamegame/ATTACHMENT_EDIT_PORTING.md`
2. Start with API endpoint (POST reprocess)
3. Build page and client components
4. Update attachment list with edit link
5. Test vision integration
6. Write tests
7. Deploy and verify

