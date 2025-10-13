# Enhanced Add-Game Flow

## Overview

This specification describes the technical architecture for an enhanced game addition workflow that integrates BoardGameGeek (BGG) API search, automated image acquisition, and intelligent PDF discovery mechanisms.

## Goals

1. **Reduce manual data entry** through BGG API integration
2. **Ensure data quality** with standardized image formats and dimensions
3. **Streamline PDF discovery** using multiple search strategies
4. **Maintain data integrity** while simplifying the UX

## Current State

### Existing Workflow
1. Admin manually enters game name
2. Admin manually enters BGG URL (optional)
3. Admin manually uploads box art image (WebP only)
4. Game is created
5. Admin separately navigates to game and adds resources (PDF uploads)

### Current Constraints
- **Images**: Must be `image/webp` format
- **PDFs**: Must be `application/pdf` format, processed via pdfjs (basic) or Marker (subscription)
- **Storage**: Vercel Blob (production) or `public/uploads/` (development)
- **No validation** on image dimensions or quality
- **No automated metadata** fetching
- **PDF extraction**: Slow (30-120s with Marker) and loses structure (pdfjs)

## Enhanced Architecture

### Phase 1: BGG API Integration

#### BGG Search Service

**Location**: `lib/services/bgg.ts`

```typescript
interface BGGSearchResult {
  id: string;
  name: string;
  yearPublished: number;
  type: 'boardgame' | 'boardgameexpansion';
}

interface BGGGameDetails {
  id: string;
  name: string;
  description: string;
  yearPublished: number;
  minPlayers: number;
  maxPlayers: number;
  playingTime: number;
  imageUrl: string;
  thumbnailUrl: string;
  publishers: string[];
  designers: string[];
}
```

**Key Functions**:

1. `searchBGGGames(query: string): Promise<BGGSearchResult[]>`
   - Calls `https://boardgamegeek.com/xmlapi2/search?query={query}&type=boardgame`
   - Parses XML response
   - Returns array of results (limit to top 10)
   - Implements 5-second rate limiting between requests
   - Caches results for 1 hour (using KV if available, otherwise in-memory)

2. `getBGGGameDetails(bggId: string): Promise<BGGGameDetails>`
   - Calls `https://boardgamegeek.com/xmlapi2/thing?id={bggId}`
   - Parses XML response
   - Extracts game metadata and image URLs
   - Handles `//` prefix in image URLs (prepend `https:`)
   - Caches details for 24 hours

3. `downloadAndConvertImage(sourceUrl: string): Promise<Buffer>`
   - Downloads image from BGG CDN
   - Converts to WebP format if not already
   - Resizes to target dimensions (see Image Requirements)
   - Returns WebP buffer ready for upload

#### Image Requirements

**Target Specifications**:
- **Format**: WebP
- **Aspect Ratio**: 3:2 (width:height) - consistent with current UI expectations
- **Dimensions**:
  - Minimum: 600x400px
  - Target: 900x600px
  - Maximum: 1800x1200px (to keep file sizes reasonable)
- **Quality**: 85% WebP quality
- **File Size**: Target < 200KB after conversion

**Processing Pipeline**:
```
BGG Image URL → Download → Decode → Resize/Crop → Convert to WebP → Upload
```

**Implementation**:
- Use `sharp` library for image processing
- Crop to 3:2 aspect ratio (center crop if needed)
- Resize to target 900x600px
- Convert to WebP with 85% quality
- Fall back to manual upload if BGG image unavailable/fails

#### Rate Limiting Strategy

BGG API recommends 5-second delays between requests. Our implementation:

**Request Queue System**:
```typescript
class BGGRequestQueue {
  private lastRequestTime: number = 0;
  private readonly MIN_DELAY = 5000; // 5 seconds

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_DELAY) {
      await sleep(this.MIN_DELAY - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
    return fn();
  }
}
```

**Caching Strategy**:
- Search results: 1 hour (Redis/KV or in-memory Map)
- Game details: 24 hours
- Cache key: `bgg:search:{query}` or `bgg:game:{id}`

### Phase 2: PDF Discovery Mechanisms

#### Discovery Strategy Priority

The system attempts multiple strategies in order:

1. **BGG Manual URL** (if user provides BGG URL)
2. **Google Custom Search API** (if configured)
3. **Publisher Database Lookup** (curated list)
4. **Manual Entry** (always available as fallback)

#### 1. BGG Files Section Detection

**Not Implemented via API** - BGG XML API does not expose the files section. Alternative approach:

**Direct Link Strategy**:
- Extract BGG ID from game details
- Construct files section URL: `https://boardgamegeek.com/boardgame/{id}/{slug}/files`
- Display prominent button: "Browse BGG Files"
- Opens in new tab for user to manually find and copy PDF/Doc URLs

**Common File Formats on BGG**:
- PDF files (`.pdf`) - direct downloads
- Google Docs links - can be exported as PDF using `/export?format=pdf` suffix
- Dropbox/Drive links - may require conversion
- Direct image scans (less common)

**Handling Google Docs**:
```typescript
function convertGoogleDocsUrl(url: string): string | null {
  // Match: https://docs.google.com/document/d/{id}/edit
  const match = url.match(/docs\.google\.com\/document\/d\/([^\/]+)/);
  if (match) {
    return `https://docs.google.com/document/d/${match[1]}/export?format=pdf`;
  }
  return null;
}
```

**Future Enhancement**: Could implement BGG files scraping, but this:
- May violate BGG terms of service
- Requires handling authentication (many files are login-required)
- HTML structure is brittle and can change
- Should only be done with explicit BGG permission
- Alternative: Partner with BGG for official files API access

#### 2. Google Custom Search API Integration

**Configuration**:
```typescript
// lib/env.mjs additions
server: {
  GOOGLE_CSE_API_KEY: z.string().optional(),
  GOOGLE_CSE_ID: z.string().optional(),
}
```

**Service Implementation**: `lib/services/pdf-search.ts`

```typescript
interface PDFSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'google' | 'publisher' | 'manual';
}

async function searchGoogleForPDF(
  gameName: string,
  options?: { publisher?: string }
): Promise<PDFSearchResult[]> {
  const query = options?.publisher
    ? `${gameName} ${options.publisher} rulebook OR manual`
    : `${gameName} rulebook OR manual`;

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', env.GOOGLE_CSE_API_KEY);
  url.searchParams.set('cx', env.GOOGLE_CSE_ID);
  url.searchParams.set('q', query);
  url.searchParams.set('fileType', 'pdf');
  url.searchParams.set('num', '5');

  const response = await fetch(url.toString());
  const data = await response.json();

  return data.items?.map(item => ({
    title: item.title,
    url: item.link,
    snippet: item.snippet,
    source: 'google' as const,
  })) ?? [];
}
```

**Cost Considerations**:
- Free tier: 100 queries/day
- Paid tier: $5 per 1,000 queries (up to 10,000/day)
- Cache results per game (24 hours)
- Only trigger on explicit user action (button click)

**Search Query Patterns**:
```
"{game name}" rulebook filetype:pdf
"{game name}" rules manual filetype:pdf
"{game name}" "{publisher}" rulebook filetype:pdf
```

#### 3. Publisher Database Lookup

**Database Table**: `publishers` (new)

```typescript
// lib/db/schema/publishers.ts
export const publishers = pgTable('publisher', {
  id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => nanoid()),
  name: text('name').notNull().unique(),
  resourcesUrl: text('resources_url'), // URL to their resources page
  websiteUrl: text('website_url'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

// Join table for game-publisher relationships
export const gamePublishers = pgTable('game_publisher', {
  gameId: varchar('game_id', { length: 191 })
    .references(() => games.id, { onDelete: 'cascade' })
    .notNull(),
  publisherId: varchar('publisher_id', { length: 191 })
    .references(() => publishers.id, { onDelete: 'cascade' })
    .notNull(),
}, (table) => ({
  pk: primaryKey(table.gameId, table.publisherId),
}));
```

**Curated Publisher List** (initial seed data):
```json
[
  {
    "name": "Leder Games",
    "resourcesUrl": "https://ledergames.com/pages/resources",
    "websiteUrl": "https://ledergames.com"
  },
  {
    "name": "Stonemaier Games",
    "resourcesUrl": "https://stonemaiergames.com/games/",
    "websiteUrl": "https://stonemaiergames.com"
  },
  {
    "name": "CMON",
    "resourcesUrl": "https://cmon.com/support",
    "websiteUrl": "https://cmon.com"
  }
]
```

**Lookup Strategy**:
- Extract publisher from BGG API details
- Match against known publishers in database
- Return `resourcesUrl` if match found
- Display as helpful link: "Check {Publisher} Resources Page"

### Phase 3: Multi-Step Workflow UI

#### New Add-Game Flow

**Step 1: Search** (`/admin/add-game`)

```tsx
// UI Components
- Search input field (debounced, 500ms)
- Loading state during BGG search
- Results grid showing:
  - Game name + year
  - Thumbnail image
  - Game type badge
  - "Select" button

// State Management
const [searchResults, setSearchResults] = useState<BGGSearchResult[]>([]);
const [selectedGame, setSelectedGame] = useState<BGGGameDetails | null>(null);
```

**Step 2: Preview** (`/admin/add-game/preview`)

```tsx
// Shows fetched data from BGG:
- Game name (editable)
- Box art preview (can replace with upload)
- BGG URL (read-only, auto-constructed)
- Year, players, play time (display only)
- Publishers (extracted from BGG)

// Actions
- "Edit Details" - modify name or upload different image
- "Continue to Resources" - proceed to PDF discovery
- "Skip Resources" - create game without resources
```

**Step 3: Resource Discovery** (`/admin/add-game/resources`)

```tsx
// Multiple discovery options displayed:

1. Manual URL Input (always available)
   - Text input for PDF URL or Google Docs URL
   - Auto-detects Google Docs and converts to export URL
   - "Add Resource" button
   - Helper text: "Supports PDF URLs and Google Docs links"

2. BGG Files Link (if BGG URL available)
   - Prominent button: "Browse BGG Files →"
   - Opens: https://boardgamegeek.com/boardgame/{id}/{slug}/files
   - Helper text: "Find rulebook PDFs or Google Docs, then paste URL above"
   - Badge showing number of files (if available from BGG API stats)

3. Google Search Results (if API configured)
   - "Search for PDFs" button (triggers API call)
   - Shows top 5 results with:
     - PDF title
     - Source domain
     - Snippet preview
     - "Use this PDF" button
   - Rate limited (cached per game)

4. Publisher Resources (if publisher matched)
   - Display: "This is a {Publisher} game"
   - Link to publisher resources page
   - "Check {Publisher} Resources"

// State
const [pdfUrls, setPdfUrls] = useState<string[]>([]);
const [isSearching, setIsSearching] = useState(false);

// Actions
- "Add Another Resource" - add multiple PDFs
- "Create Game" - finalize and create game + resources
```

#### Server Actions

**New Actions**: `lib/actions/bgg.ts`

```typescript
export async function searchBGG(query: string) {
  // Call BGG search API
  // Return results for autocomplete
}

export async function fetchBGGGame(bggId: string) {
  // Get full game details
  // Download and convert image
  // Return game data ready for preview
}

export async function createGameFromBGG(data: {
  bggId: string;
  name?: string; // override if edited
  imageOverride?: File; // if user uploaded different image
  pdfUrls: string[];
}) {
  // Create game record
  // Upload/use box art
  // Create resources from PDF URLs (process in background)
  // Return game ID
}
```

### Error Handling

**BGG API Failures**:
- Network timeout: Retry once after 2 seconds, then show error
- Rate limit hit: Show message with countdown timer
- Invalid response: Log error, fall back to manual entry
- Image download fails: Allow manual image upload

**PDF Processing Failures**:
- Invalid PDF URL: Validate URL format before accepting
- PDF download fails: Show error, allow user to retry or remove
- PDF parsing fails: Still create resource with URL, mark as "needs reprocessing"
- Timeout during processing: Queue for background processing, notify user

**Validation**:
- Game name: Required, 1-200 characters
- BGG URL: Optional, must match pattern `https://boardgamegeek.com/boardgame/{id}/*`
- Image: Must be valid image format (will convert to WebP)
- PDF URL: Must be valid URL, should be accessible (HEAD request check)

## Database Schema Changes

### New Tables

```sql
-- Publishers table
CREATE TABLE publisher (
  id VARCHAR(191) PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  resources_url TEXT,
  website_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Game-Publisher relationship
CREATE TABLE game_publisher (
  game_id VARCHAR(191) NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  publisher_id VARCHAR(191) NOT NULL REFERENCES publisher(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, publisher_id)
);

-- BGG metadata cache (optional, could use KV instead)
CREATE TABLE bgg_cache (
  key VARCHAR(191) PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bgg_cache_expires ON bgg_cache(expires_at);
```

### Modified Tables

```sql
-- Add BGG ID to games table for linking
ALTER TABLE game ADD COLUMN bgg_id VARCHAR(50);
CREATE UNIQUE INDEX idx_game_bgg_id ON game(bgg_id) WHERE bgg_id IS NOT NULL;

-- Add publisher info extracted from BGG
ALTER TABLE game ADD COLUMN publishers TEXT[]; -- Array of publisher names

-- Add metadata to resources for better tracking
ALTER TABLE resource
  ADD COLUMN source VARCHAR(50) DEFAULT 'manual', -- 'manual', 'bgg', 'google', 'publisher'
  ADD COLUMN auto_discovered BOOLEAN DEFAULT FALSE,
  ADD COLUMN original_url TEXT; -- If fetched from external source
```

## Configuration

### Environment Variables

```bash
# BGG API (no key required, but rate limited)
# No env vars needed - uses public XML API

# Google Custom Search (optional, for PDF discovery)
GOOGLE_CSE_API_KEY=your_api_key_here
GOOGLE_CSE_ID=your_search_engine_id_here

# PDF Extraction (recommended: mistral)
DEFAULT_PDF_EXTRACTOR=mistral  # "pdfjs", "marker", or "mistral"
MISTRAL_API_KEY=your_mistral_api_key  # Required for mistral extractor
DATALAB_API_KEY=your_datalab_key  # Only if using marker (deprecated)

# Image Processing
IMAGE_TARGET_WIDTH=900
IMAGE_TARGET_HEIGHT=600
IMAGE_QUALITY=85
```

## Performance Considerations

**BGG API Calls**:
- Average latency: 200-500ms per request
- Rate limit: 1 request per 5 seconds
- Cache aggressively to minimize API calls
- Search results cached for 1 hour
- Game details cached for 24 hours

**Image Processing**:
- Download time: ~500ms - 2s (depends on BGG CDN)
- Conversion time: ~100-300ms (using sharp)
- Total: ~1-3 seconds per image
- Process in background if queue is long

**PDF Discovery**:
- Google CSE: ~200-500ms per query
- Limit to 5 results to keep UI clean
- Cache results to avoid repeated API calls
- Only trigger on explicit user action (not automatic)

**Overall Add-Game Flow**:
- Step 1 (Search): 200-500ms per search query
- Step 2 (Preview): 2-4 seconds (fetch details + process image)
- Step 3 (Resources): 3-5 seconds per PDF with Mistral OCR (vs 30-120s with Marker)
- Total optimistic: ~5-10 seconds for complete flow (game + 1 resource)

**Note**: Using Mistral OCR dramatically reduces PDF processing time. See `specs/mistral-ocr-integration.md` for details.

## Migration Strategy

**Phase 1** (Weeks 1-2):
- Implement BGG service layer
- Add search UI to add-game form
- Deploy with feature flag

**Phase 2** (Weeks 3-4):
- Add image processing pipeline
- Implement preview step
- Test with real BGG data

**Phase 3** (Weeks 5-6):
- Build PDF discovery mechanisms
- Add Google CSE integration (if keys available)
- Create publisher database

**Phase 4** (Week 7):
- Polish UX/UI
- Add error handling and validation
- Enable for all admins

## Security Considerations

1. **Admin-Only Access**: All add-game endpoints require admin authentication
2. **URL Validation**: Validate all external URLs before fetching
3. **Rate Limiting**: Respect BGG's rate limits, implement our own for user actions
4. **SSRF Protection**: Validate PDF URLs are not internal IPs or localhost
5. **File Size Limits**: Cap PDF downloads at 50MB, images at 10MB
6. **API Key Security**: Store Google CSE credentials server-side only

## Monitoring

**Metrics to Track**:
- BGG API success/failure rates
- Average time for image processing
- PDF discovery success rates by source
- Cache hit rates for BGG data
- Number of manual vs automated game additions

**Logging**:
- Log all BGG API calls (for debugging rate limits)
- Log image processing failures
- Log PDF discovery attempts and results
- Alert on repeated failures for same game

## Future Enhancements

1. **Bulk Import**: CSV upload with game names → batch BGG lookup
2. **BGG Collection Sync**: Import user's BGG collection automatically
3. **Image Gallery**: Show multiple images from BGG, let user choose
4. **Community Contributions**: Let users suggest PDFs for games
5. **OCR Fallback**: If PDF is scanned images, run OCR to extract text
6. **Multi-language Support**: Detect and support rulebooks in different languages
