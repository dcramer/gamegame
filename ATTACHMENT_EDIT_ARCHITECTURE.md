# Attachment Edit - Architecture & Data Flow Diagrams

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Page Component (Server)                                         │
│ [gameId]/[resourceId]/attachments/[attachmentId]/page.tsx      │
├─────────────────────────────────────────────────────────────────┤
│ • Load data: getAttachment(), getResource(), getGame()         │
│ • Generate metadata for SEO                                     │
│ • Handle 404 for missing attachments                           │
│ • Pass data to client component                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ props
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Client Component                                                 │
│ AttachmentEditClient                                             │
├─────────────────────────────────────────────────────────────────┤
│ State:                                                           │
│  • attachment (current DB state)                               │
│  • description (form input)                                     │
│  • originalFilename (form input)                               │
│  • saving (boolean)                                             │
│  • saveStatus (idle|success|error)                             │
│  • reprocessing (boolean)                                       │
│                                                                 │
│ UI Sections:                                                    │
│  1. Breadcrumb Navigation                                      │
│  2. Page Header                                                │
│  3. Image Preview with Quality Badge                           │
│  4. Edit Form (filename, description)                          │
│  5. Buttons (Save Changes, Reprocess with Vision)              │
│  6. Metadata Card (ID, Type, MIME, Caption)                    │
└────────────────┬─────────────┬────────────────────────────────┘
                 │             │
        ┌────────▼─────┐   ┌───▼────────────┐
        │ handleSave   │   │ handleReprocess│
        └────────┬─────┘   └───┬────────────┘
                 │             │
      ┌──────────▼──────────────▼──────────┐
      │ Fetch API to Backend Routes        │
      └──────────┬──────────────┬──────────┘
                 │              │
         ┌───────▼────────┐  ┌──▼───────────────┐
         │ PATCH Endpoint │  │ POST Reprocess   │
         │ /attachments/  │  │ /attachments/    │
         │ :attachmentId  │  │ :attachmentId/   │
         │                │  │ reprocess        │
         └───────┬────────┘  └──┬───────────────┘
                 │              │
      ┌──────────▼──────────────▼──────────┐
      │ API Routes (/app/api/attachments)  │
      │ route.ts                            │
      └──────────┬──────────────┬──────────┘
                 │              │
         ┌───────▼─────┐    ┌────▼────────────────┐
         │ • Validate  │    │ • Validate auth     │
         │   schema    │    │ • Fetch attachment  │
         │ • Auth      │    │ • Get blob from     │
         │   check     │    │   storage           │
         │ • Update DB │    │ • Convert to base64 │
         │ • Return    │    │ • Call vision API   │
         │   updated   │    │ • Update DB         │
         │   data      │    │ • Return updated    │
         └─────┬──────┘    └────┬────────────────┘
               │                │
    ┌──────────▼────────────────▼──────┐
    │ Database (PostgreSQL)             │
    │ • attachments table               │
    │ • Update fields:                  │
    │   - description                   │
    │   - originalFilename              │
    │   - isGoodQuality                 │
    └──────────────┬─────────────────────┘
                   │
                   │ Return updated row
                   ▼
    ┌───────────────────────────────┐
    │ Client State Updates           │
    │ setAttachment(updated)         │
    │ setDescription(new value)      │
    │ setSaveStatus('success')       │
    └───────────────────────────────┘
```

## Data Flow Diagram - Save Operation

```
User edits form
         │
         ▼
handleSave() triggered
         │
         ├─ Validate form: trim whitespace
         │
         ├─ Build payload:
         │  {
         │    description: string|null,
         │    originalFilename: string|null
         │  }
         │
         ├─ setSaving(true)
         │
         ▼
PATCH /api/attachments/:attachmentId
         │
         ├─ await requireAdmin() ──┬──> Not admin ──> Return 401
         │                          └──> Is admin ──> Continue
         │
         ├─ Parse request body with Zod
         │
         ├─ db.update(attachments) ────┬──> Update fails ──> Return 404
         │                               └──> Update OK ──> Continue
         │
         ├─ Get public URL via blobKeyToUrl()
         │
         ├─ Parse bbox JSON safely
         │
         ▼
Return 200 with updated attachment
         │
         ├─ Parse response JSON
         │
         ├─ setAttachment(updated)
         ├─ setDescription(updated.description)
         ├─ setOriginalFilename(updated.originalFilename)
         ├─ setSaveStatus('success')
         ├─ setSaving(false)
         │
         ▼
setTimeout(() => setSaveStatus('idle'), 3000)
Display: "✓ Saved successfully"
```

## Data Flow Diagram - Vision Reprocessing

```
User clicks "Reprocess with Vision"
         │
         ├─ setReprocessing(true)
         │
         ▼
POST /api/attachments/:attachmentId/reprocess
         │
         ├─ await requireAdmin() ──┬──> Not admin ──> Return 401
         │                          └──> Is admin ──> Continue
         │
         ├─ db.select() attachment ────┬──> Not found ──> Return 404
         │                              └──> Found ──> Continue
         │
         ├─ Validate blobKey exists ────┬──> Missing ──> Return 400
         │                              └──> Exists ──> Continue
         │
         ├─ getBlob(attachment.blobKey) ┬──> Fails ──> Return 404
         │                              └──> Success ──> Continue
         │
         ├─ Convert to base64:
         │  Buffer.from(imageData).toString('base64')
         │
         ├─ Validate OPENAI_API_KEY ────┬──> Missing ──> Return 500
         │                              └──> Exists ──> Continue
         │
         ▼
analyzeImageWithVision(
  base64Image,
  '',                              // No surrounding text
  OPENAI_API_KEY,
  undefined,                       // No context
  { imageId, pageNumber }
)
         │
         ├─ Build vision prompt:
         │  - Describe in one sentence
         │  - Assess quality (GOOD/BAD only if severely bad)
         │  - Return JSON: { description, quality }
         │
         ├─ Call OpenAI GPT-5 (or GPT-4o-mini in dev)
         │  with abortSignal and 60s timeout
         │
         ├─ Retry logic (3 attempts):
         │  Attempt 1: 0s
         │  Attempt 2: 1s delay
         │  Attempt 3: 2s delay
         │  Attempt 4: 4s delay (all with 60s timeout)
         │
         ├─ Parse JSON response
         │  Fallback: regex extraction if JSON parse fails
         │
         ▼
{
  description: "Generated description",
  isGoodQuality: 'good'|'bad'
}
         │
         ├─ db.update(attachments):
         │  SET {
         │    description,
         │    isGoodQuality: quality === 'GOOD' ? 'good' : 'bad'
         │  }
         │
         ├─ Get public URL via blobKeyToUrl()
         │
         ├─ Parse bbox JSON safely
         │
         ▼
Return 200 with updated attachment
         │
         ├─ Parse response JSON
         │
         ├─ setAttachment(updated)
         ├─ setDescription(updated.description)
         ├─ setReprocessing(false)
         │
         ▼
Display: "✓ Vision analysis completed successfully!"
Update UI with new description and quality badge
```

## Database Schema

```sql
attachments TABLE
├── id (varchar, PRIMARY KEY, nanoid)
├── gameId (varchar, FOREIGN KEY -> games.id)
├── resourceId (varchar, FOREIGN KEY -> resources.id)
├── type (varchar) - 'image'
├── mimeType (varchar) - e.g., 'image/png'
├── blobKey (text) - Storage path
├── url (text) - Public URL (denormalized)
├── originalFilename (text, nullable)
├── pageNumber (integer, nullable) - 1-indexed PDF page
├── bbox (jsonb, nullable) - [x1, y1, x2, y2]
├── caption (text, nullable) - Auto-generated caption
├── width (integer, nullable) - Image width
├── height (integer, nullable) - Image height
├── description (text, nullable) - AI-generated (EDITABLE)
├── isGoodQuality (varchar, nullable) - 'good'|'bad' (EDITABLE)
└── createdAt (bigint) - Timestamp

INDEXES:
├── idx_attachments_game_id
├── idx_attachments_resource_id
├── idx_attachments_resource_page
└── idx_attachments_type
```

## API Request/Response Examples

### PATCH /api/attachments/:attachmentId (Save Metadata)

**Request:**
```bash
curl -X PATCH http://localhost:3000/api/attachments/abc123 \
  -H "Content-Type: application/json" \
  -H "Cookie: authToken=..." \
  -d '{
    "description": "Updated description about the image",
    "originalFilename": "board_setup.png"
  }'
```

**Response (200 OK):**
```json
{
  "id": "abc123",
  "resourceId": "res456",
  "type": "image",
  "mimeType": "image/png",
  "url": "https://blob.vercel.com/.../abc123.png",
  "originalFilename": "board_setup.png",
  "pageNumber": 5,
  "bbox": [100, 200, 300, 400],
  "caption": "Game board setup",
  "width": 800,
  "height": 600,
  "description": "Updated description about the image",
  "isGoodQuality": "good"
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Unauthorized"
}
```

**Response (404 Not Found):**
```json
{
  "error": "Attachment not found"
}
```

### POST /api/attachments/:attachmentId/reprocess (Vision Analysis)

**Request:**
```bash
curl -X POST http://localhost:3000/api/attachments/abc123/reprocess \
  -H "Cookie: authToken=..."
```

**Response (200 OK):**
```json
{
  "id": "abc123",
  "resourceId": "res456",
  "type": "image",
  "mimeType": "image/png",
  "url": "https://blob.vercel.com/.../abc123.png",
  "originalFilename": "board.png",
  "pageNumber": 5,
  "bbox": [100, 200, 300, 400],
  "caption": "Game board setup",
  "width": 800,
  "height": 600,
  "description": "Game board with resource tracks and player areas",
  "isGoodQuality": "good"
}
```

**Response (500 Vision Analysis Failed):**
```json
{
  "error": "Vision analysis failed",
  "details": "OpenAI API rate limit exceeded"
}
```

## State Machine Diagrams

### Save Operation State

```
┌─────────┐
│  IDLE   │◄──────────────────────────────┐
└────┬────┘                               │
     │ handleSave()                       │
     │ setSaving(true)                    │
     ▼                                    │
┌─────────────┐  Save fails     ┌──────────────────────┐
│  SAVING     │────────────────►│ SAVE ERROR           │
└─────────────┘                 │ setSaveStatus(error) │
     │                          │ displayErrorToast()  │
     │ Save succeeds           └──────────┬────────────┘
     │ setSaveStatus(success)              │
     ▼                                    │ setTimeout
┌─────────────┐                          │ 3 seconds
│  SAVED      │◄─────────────────────────┘
│ Display     │
│ success UI  │
└─────────────┘
```

### Reprocess Operation State

```
┌─────────────┐
│    IDLE     │◄──────────────────────────────┐
└────┬────────┘                               │
     │ handleReprocess()                      │
     │ setReprocessing(true)                  │
     ▼                                        │
┌──────────────┐  Vision fails  ┌──────────────────────┐
│ REPROCESSING │──────────────► │ REPROCESS ERROR      │
└──────────────┘                │ showErrorAlert()     │
     │                          └──────────┬───────────┘
     │ Vision succeeds                     │
     │ Update state:                       │
     │ • setAttachment(updated)            │
     │ • setDescription(new)               │
     │ • setReprocessing(false)            │
     ▼                                     │
┌──────────────┐                          │
│ REPROCESSED  │◄─────────────────────────┘
│ UI updated   │
│ with new     │
│ description  │
│ and quality  │
└──────────────┘
```

## Error Handling Flow

```
Operation Error
         │
         ├─ Network Error
         │  └─ Catch block
         │     └─ Show alert: "Failed to [operation] attachment"
         │
         ├─ API Error Response
         │  ├─ response.ok === false
         │  └─ res.json(): { error, details }
         │     ├─ 401 -> Redirect to login
         │     ├─ 403 -> Show: "Unauthorized"
         │     ├─ 404 -> Show: "Attachment not found"
         │     ├─ 400 -> Show: "Validation error"
         │     └─ 500 -> Show: "Server error: {details}"
         │
         ├─ Vision API Error
         │  ├─ Timeout (60s)
         │  ├─ Rate limit
         │  ├─ Invalid response format
         │  └─ Fallback: Extract text via regex
         │
         └─ Database Error
            ├─ Attachment not found (404)
            ├─ Permission denied (403)
            ├─ Constraint violation (400)
            └─ Connection error (500)
```

## URL Routing

```
Breadcrumb Navigation Structure:

/admin
  ▼
/admin/games
  ▼
/admin/games/[gameId]
  ▼
/admin/games/[gameId]/[resourceId]
  ├─ Page displays: Resource details + AttachmentList
  │
  └─ AttachmentList has links:
     /admin/games/[gameId]/[resourceId]/attachments/[attachmentId]
       ▼
       Attachment Edit Page
       └─ Can link back to resource page
          /admin/games/[gameId]/[resourceId]
```

## Vision Service Integration

```
Your Code                    Vision Service (lib/services/vision.ts)
     │
     ├─ POST /api/attachments/:id/reprocess
     │
     └─► analyzeImageWithVision(
           base64Image,
           surroundingText = '',
           openaiApiKey,
           context = undefined,
           metadata = { imageId, pageNumber },
           logContext = undefined,
           environment = undefined
         )
           │
           ├─ Input validation
           ├─ Prompt construction
           ├─ withRetry() wrapper
           │  ├─ Max 3 retries
           │  ├─ Exponential backoff
           │  └─ 60s timeout per attempt
           │
           ├─ OpenAI API call (generateText)
           │  └─ Model: GPT-5 (prod) or GPT-4o-mini (dev)
           │
           ├─ Response parsing
           │  ├─ JSON extraction from markdown blocks
           │  ├─ Fallback: regex parsing
           │  └─ Validation
           │
           └─► Return {
                 description: string,
                 isGoodQuality: 'good'|'bad'
               }
```

## Security Flow

```
HTTP Request
     │
     ▼
NextAuth Session Check
     │
     ├─ No session ──> Return 401 (unauthenticated)
     │
     ├─ Session exists
     │  ▼
     │  requireAdmin()
     │  │
     │  ├─ User NOT admin ──> Return 403 (forbidden)
     │  │
     │  └─ User IS admin ──> Continue
     │     │
     │     ├─ Validate request body (Zod)
     │     │  ├─ Invalid ──> Return 400
     │     │  └─ Valid ──> Continue
     │     │
     │     ├─ Check resource ownership (implicit via attachmentId)
     │     │  ├─ Not found ──> Return 404
     │     │  └─ Found ──> Continue
     │     │
     │     ▼
     │     Execute database operation
     │     │
     │     ├─ Success ──> Return 200
     │     └─ Failure ──> Return 500
     │
     └─ Return error response with appropriate status code
```

