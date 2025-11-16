# Annotated Response Flow with Source Citations

## Overview

This specification describes the technical architecture for enhancing LLM responses with precise source citations (page numbers, sections) and embedded visual content (diagrams, tables, component images) extracted from game manuals.

## Goals

1. **Provenance Tracking**: Every answer shows WHERE in the manual the information came from
2. **Visual Context**: Responses include relevant diagrams, tables, and images from manuals
3. **Verifiability**: Users can jump to exact source locations to verify information
4. **Enhanced RAG**: Improve retrieval quality with richer fragment metadata

## Current State

### Existing Fragment Structure

**Database Schema** (`fragments` table):
```typescript
{
  id: string;
  gameId: string;
  resourceId: string;
  content: text;              // Plain text or markdown
  embedding: vector(1536);    // OpenAI embedding
  searchVector: tsvector;     // PostgreSQL full-text search
  version: number;
}
```

**Current Limitations**:
- ❌ No page number tracking
- ❌ No section/heading context
- ❌ No visual content (diagrams, tables)
- ❌ Cannot link back to specific manual locations
- ❌ All content is text-only

### Current Response Format

```json
{
  "answer": "markdown text",
  "resources": [
    {
      "id": "resource-123",
      "name": "Core Rulebook.pdf"
    }
  ],
  "followUps": ["question 1", "question 2"]
}
```

**Limitations**:
- Shows which resource was used, but not where in the resource
- No visual aids to supplement explanations
- User must download entire PDF to verify

## Enhanced Architecture

### Phase 1: Rich Fragment Metadata

#### Enhanced Fragment Schema

```sql
-- Add new columns to fragments table
ALTER TABLE fragment
  ADD COLUMN page_number INTEGER,           -- PDF page number (1-indexed)
  ADD COLUMN page_label VARCHAR(50),        -- e.g., "ii", "A-3", "Setup"
  ADD COLUMN section_heading TEXT,          -- Parent section title
  ADD COLUMN subsection_heading TEXT,       -- Subsection title (if any)
  ADD COLUMN fragment_type VARCHAR(50)      -- 'text', 'table', 'list', 'example'
    DEFAULT 'text',
  ADD COLUMN confidence_score FLOAT         -- Quality of extraction (0-1)
    DEFAULT 1.0,
  ADD COLUMN metadata JSONB;                -- Flexible metadata storage

-- Index for quick page lookups
CREATE INDEX idx_fragment_page ON fragment(resource_id, page_number);
CREATE INDEX idx_fragment_type ON fragment(fragment_type);

-- Images extracted from PDFs
CREATE TABLE fragment_image (
  id VARCHAR(191) PRIMARY KEY,
  fragment_id VARCHAR(191) NOT NULL
    REFERENCES fragment(id) ON DELETE CASCADE,
  resource_id VARCHAR(191) NOT NULL
    REFERENCES resource(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  image_url TEXT NOT NULL,              -- URL to stored image
  image_type VARCHAR(50),               -- 'diagram', 'table', 'photo', 'icon'
  alt_text TEXT,                        -- Extracted caption or OCR
  bounding_box JSONB,                   -- {x, y, width, height} on page
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fragment_image_fragment ON fragment_image(fragment_id);
CREATE INDEX idx_fragment_image_resource ON fragment_image(resource_id, page_number);
```

**Metadata JSONB Structure**:
```json
{
  "bounding_box": {
    "page": 5,
    "x": 100,
    "y": 200,
    "width": 400,
    "height": 300
  },
  "styling": {
    "is_bold": false,
    "is_italic": false,
    "font_size": 12
  },
  "context": {
    "nearby_images": ["image-123"],
    "table_id": "table-456"
  }
}
```

#### Enhanced PDF Extraction with Mistral OCR

**Current Extractors** (to be replaced):
1. `pdfjs` - Basic text extraction, no page numbers, no structure
2. `marker` - Markdown with formatting, async polling (30-120s)

**New Approach: Mistral OCR** (recommended)

Mistral OCR provides native support for all the features we need:
- ✅ Page-level structure (no parsing needed)
- ✅ Native page numbers
- ✅ Markdown formatted text
- ✅ Extracted images with base64 data
- ✅ Auto-generated image annotations (captions)
- ✅ Bounding box coordinates
- ✅ Page dimensions (DPI, width, height)
- ✅ Synchronous API (3-5 seconds, no polling)
- ✅ Transparent pricing ($0.001/page)

**Mistral OCR Implementation**:

```typescript
// lib/pdf.ts - Mistral OCR extraction
import { Mistral } from '@mistralai/mistralai';
import { env } from './env.mjs';

const mistralClient = new Mistral({ apiKey: env.MISTRAL_API_KEY });

interface MistralOCRResult {
  pages: Array<{
    index: number;
    markdown: string;
    images: Array<{
      id: string;
      topLeftX: number;
      topLeftY: number;
      bottomRightX: number;
      bottomRightY: number;
      imageBase64: string;
      imageAnnotation: string;  // Auto-generated caption!
    }>;
    dimensions: {
      dpi: number;
      height: number;
      width: number;
    };
  }>;
  model: string;
  usageInfo: {
    pagesProcessed: number;
    docSizeBytes: number;
  };
}

export async function extractTextFromPdf_Mistral(
  buf: Buffer
): Promise<MistralOCRResult> {
  console.log('Extracting PDF with Mistral OCR');

  const base64 = buf.toString('base64');

  const result = await mistralClient.ocr.process({
    model: 'mistral-ocr-latest',
    document: {
      type: 'document_base64',
      documentBase64: base64,
    },
    includeImageBase64: true,  // Essential for image extraction
  });

  // Mistral returns native page structure with images
  // No parsing or polling needed!
  return result;
}
```

**Native Page Structure**:

Mistral OCR returns a structured response with native pages array:

```typescript
// No parsing needed! Pages come pre-structured
const extraction = await extractTextFromPdf_Mistral(pdfBuffer);

// Direct access to pages
for (const page of extraction.pages) {
  console.log(`Page ${page.index + 1}:`);
  console.log(`  Markdown: ${page.markdown.substring(0, 100)}...`);
  console.log(`  Images: ${page.images.length}`);
  console.log(`  Dimensions: ${page.dimensions.width}x${page.dimensions.height}`);

  // Images come with base64 data and annotations
  for (const image of page.images) {
    console.log(`  - ${image.imageAnnotation}`);
    console.log(`    Position: (${image.topLeftX}, ${image.topLeftY})`);
    // image.imageBase64 is ready to decode and use
  }
}
```

**Benefits**:
- ✅ No regex parsing needed
- ✅ No fragile markdown marker detection
- ✅ Direct access to structured data
- ✅ Images already decoded and annotated
- ✅ Bounding boxes for layout context

#### Enhanced Fragment Generation with Mistral OCR

**Simplified Chunking Strategy**:

With Mistral's native page structure, chunking is much simpler:

```typescript
// lib/ai/search.ts - Enhanced chunking with Mistral OCR
interface EnhancedFragment {
  content: string;
  embedding: number[];
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  pageDpi: number;
  sectionHeading?: string;
  fragmentType: 'text' | 'table' | 'list' | 'example';
  images: Array<{
    id: string;
    url: string;
    annotation: string;
    boundingBox: BoundingBox;
  }>;
}

async function generateEnhancedEmbeddings(
  extraction: MistralOCRResult,
  resourceId: string
): Promise<EnhancedFragment[]> {
  const fragments: EnhancedFragment[] = [];

  // Process each page from Mistral
  for (const page of extraction.pages) {
    // Split page markdown into semantic chunks
    const chunks = await splitIntoSemanticChunks(page.markdown, {
      maxChunkSize: 1000,
      respectBoundaries: ['heading', 'list', 'table', 'paragraph'],
    });

    // Upload page images to storage
    const uploadedImages = await Promise.all(
      page.images.map(async (img) => {
        // Decode base64 and convert to WebP
        const imageBuffer = Buffer.from(img.imageBase64, 'base64');
        const webpBuffer = await sharp(imageBuffer)
          .webp({ quality: 90 })
          .toBuffer();

        // Upload to blob storage
        const url = await uploadToBlob(
          `${resourceId}/page-${page.index + 1}-${img.id}.webp`,
          webpBuffer
        );

        return {
          id: img.id,
          url,
          annotation: img.imageAnnotation,  // Free from Mistral!
          boundingBox: {
            topLeftX: img.topLeftX,
            topLeftY: img.topLeftY,
            bottomRightX: img.bottomRightX,
            bottomRightY: img.bottomRightY,
          },
        };
      })
    );

    // Create fragments for this page
    for (const chunk of chunks) {
      const [embedding] = await generateEmbedding(chunk.content);

      // Find images mentioned in this chunk
      const chunkImages = uploadedImages.filter(img =>
        chunk.content.toLowerCase().includes(img.annotation.toLowerCase())
      );

      fragments.push({
        content: chunk.content,
        embedding,
        pageNumber: page.index + 1,  // Convert to 1-indexed
        pageWidth: page.dimensions.width,
        pageHeight: page.dimensions.height,
        pageDpi: page.dimensions.dpi,
        sectionHeading: chunk.heading,
        fragmentType: detectFragmentType(chunk.content),
        images: chunkImages,
      });
    }
  }

  return fragments;
}

function detectFragmentType(content: string): FragmentType {
  if (content.match(/^\|(.+)\|$/m)) return 'table';
  if (content.match(/^[\s]*[-*+]\s+/m)) return 'list';
  if (content.match(/example:/i)) return 'example';
  return 'text';
}
```

**Key Simplifications**:
- ✅ No markdown parsing for page boundaries
- ✅ Images come pre-extracted with base64
- ✅ Annotations (captions) provided for free
- ✅ Native page dimensions available
- ✅ Bounding boxes for spatial context

#### Image Extraction and Storage with Mistral OCR

**Simplified Image Processing**:

Mistral OCR provides images with annotations, eliminating the need for GPT-4 Vision:

```typescript
// lib/services/image-extraction.ts
interface MistralImage {
  id: string;
  imageBase64: string;
  imageAnnotation: string;  // Free caption from Mistral!
  topLeftX: number;
  topLeftY: number;
  bottomRightX: number;
  bottomRightY: number;
}

async function processExtractedImages(
  images: MistralImage[],
  pageNumber: number,
  resourceId: string
): Promise<FragmentImage[]> {
  const results: FragmentImage[] = [];

  for (const image of images) {
    // Decode base64 from Mistral response
    const imageBuffer = Buffer.from(image.imageBase64, 'base64');

    // Convert to WebP for consistent storage
    const webpBuffer = await sharp(imageBuffer)
      .webp({ quality: 90 })
      .toBuffer();

    // Upload to blob storage
    const filename = `${resourceId}/page-${pageNumber}-${image.id}.webp`;
    const imageUrl = await uploadToBlob(filename, webpBuffer, 'image/webp');

    results.push({
      id: nanoid(),
      resourceId,
      pageNumber,
      imageUrl,
      imageType: classifyImageType(image.imageAnnotation),
      altText: image.imageAnnotation,  // No GPT-4 Vision needed!
      boundingBox: {
        topLeftX: image.topLeftX,
        topLeftY: image.topLeftY,
        bottomRightX: image.bottomRightX,
        bottomRightY: image.bottomRightY,
      },
      fragmentId: null, // Linked later during fragment creation
    });
  }

  return results;
}

function classifyImageType(annotation: string): string {
  const lower = annotation.toLowerCase();
  if (lower.includes('diagram')) return 'diagram';
  if (lower.includes('table')) return 'table';
  if (lower.includes('setup')) return 'setup';
  if (lower.includes('component')) return 'component';
  if (lower.includes('example')) return 'example';
  return 'other';
}
```

**Cost Savings**:
- ✅ **No GPT-4 Vision API calls** ($0.01-0.03 per image)
- ✅ Mistral annotations included in OCR price
- ✅ For 15 images: Save ~$0.15-0.45 per resource
- ✅ Plus faster processing (no additional API calls)

### Phase 2: Enhanced Response Format

#### New Response Schema

```typescript
// lib/ai/prompt.ts - Enhanced response schema
export const AnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({
      resourceId: z.string(),
      resourceName: z.string(),
      pageNumber: z.number().optional(),
      pageLabel: z.string().optional(),
      sectionHeading: z.string().optional(),
      fragmentId: z.string(), // For exact linking
      quoteSnippet: z.string().optional(), // Short quote from source
    })
  ).default([]),
  images: z.array(
    z.object({
      url: z.string(),
      altText: z.string(),
      pageNumber: z.number(),
      caption: z.string().optional(),
    })
  ).default([]),
  resources: z.array(
    z.object({
      name: z.string(),
      id: z.string(),
    })
  ).default([]),
  followUps: z.array(z.string()).default([]),
});

type EnhancedAnswer = z.infer<typeof AnswerSchema>;
```

#### Enhanced Prompt Instructions

```typescript
export const buildPrompt = (game: Game) => {
  return `
    ... [existing prompt] ...

    ## Response Format

    Your response must ALWAYS be in the following JSON format:

    {
      "answer": "your answer in markdown",
      "citations": [
        {
          "resourceId": "resource-id",
          "resourceName": "Core Rulebook.pdf",
          "pageNumber": 5,
          "pageLabel": "5",
          "sectionHeading": "Game Setup",
          "fragmentId": "fragment-id",
          "quoteSnippet": "Place the board in the center of the table"
        }
      ],
      "images": [
        {
          "url": "https://...",
          "altText": "Board setup diagram",
          "pageNumber": 5,
          "caption": "Figure 1: Initial board setup"
        }
      ],
      "resources": [...],
      "followUps": [...]
    }

    ## Using Citations

    When you retrieve information using the 'getKnowledge' tool, you will receive:
    - resourceId and resourceName
    - pageNumber and sectionHeading (if available)
    - fragmentId for exact reference
    - Associated images

    ALWAYS include these in your citations array for each fact you reference.

    ## Including Visual Content

    When answering questions about:
    - Setup procedures
    - Component identification
    - Game board layout
    - Turn structure diagrams
    - Card/token reference

    Check if the retrieved fragments have associated images. If they do, include
    them in the 'images' array to provide visual context.

    Example: If asked "How do I set up the board?", include the board setup diagram
    from the manual in your response.
  `;
};
```

#### Enhanced getKnowledge Tool

```typescript
// lib/ai/prompt.ts
export const getTools = (gameId: string) => {
  return {
    getKnowledge: tool({
      description: 'Get information from the knowledge base with source citations',
      parameters: z.object({
        question: z.string().describe("the user's question"),
      }),
      execute: async ({ question }) => {
        const results = await findRelevantContent(gameId, question);

        // Enhanced results include metadata
        return results.map(r => ({
          content: r.content,
          resourceId: r.resourceId,
          resourceName: r.resourceName,
          pageNumber: r.pageNumber,
          pageLabel: r.pageLabel,
          sectionHeading: r.sectionHeading,
          fragmentId: r.fragmentId,
          images: r.images, // Associated images from fragment
        }));
      },
    }),
    // ... other tools
  };
};
```

#### Enhanced Search Function

```typescript
// lib/ai/search.ts
export const findRelevantContent = async (
  gameId: string,
  userQuery: string
): Promise<EnhancedSearchResult[]> => {
  const [userQueryEmbedding] = await generateEmbedding(userQuery);

  const matchCount = 10;
  const rrfK = 50;
  const fullTextWeight = 1;
  const semanticWeight = 1;

  const matchingContent = await db.execute<{
    fragment_id: string;
    resource_id: string;
    resource_name: string;
    content: string;
    page_number: number | null;
    page_label: string | null;
    section_heading: string | null;
    subsection_heading: string | null;
    fragment_type: string;
  }>(sql`
    WITH full_text AS (
      SELECT
        ${fragments.id},
        row_number() OVER (
          ORDER BY ts_rank_cd(${fragments.searchVector},
                              websearch_to_tsquery(${userQuery})) DESC
        ) AS rank_ix
      FROM ${fragments}
      WHERE ${fragments.searchVector} @@ websearch_to_tsquery(${userQuery})
        AND ${fragments.gameId} = ${gameId}
      ORDER BY rank_ix
      LIMIT ${matchCount} * 2
    ),
    semantic AS (
      SELECT
        ${fragments.id},
        row_number() OVER (
          ORDER BY ${innerProduct(fragments.embedding, userQueryEmbedding)} DESC
        ) AS rank_ix
      FROM ${fragments}
      WHERE ${fragments.gameId} = ${gameId}
      ORDER BY rank_ix
      LIMIT ${matchCount} * 2
    )
    SELECT
      ${fragments.id} AS fragment_id,
      ${resources.id} AS resource_id,
      ${resources.name} AS resource_name,
      ${fragments.content},
      ${fragments.pageNumber} AS page_number,
      ${fragments.pageLabel} AS page_label,
      ${fragments.sectionHeading} AS section_heading,
      ${fragments.subsectionHeading} AS subsection_heading,
      ${fragments.fragmentType} AS fragment_type
    FROM full_text
    FULL OUTER JOIN semantic ON full_text.id = semantic.id
    JOIN ${fragments} ON COALESCE(full_text.id, semantic.id) = ${fragments.id}
    JOIN ${resources} ON ${fragments.resourceId} = ${resources.id}
    ORDER BY
      COALESCE(1.0 / (${rrfK} + full_text.rank_ix), 0.0) * ${fullTextWeight} +
      COALESCE(1.0 / (${rrfK} + semantic.rank_ix), 0.0) * ${semanticWeight}
      DESC
    LIMIT ${matchCount}
  `);

  // Fetch associated images for each fragment
  const fragmentIds = matchingContent.rows.map(r => r.fragment_id);
  const images = await db
    .select()
    .from(fragmentImages)
    .where(sql`${fragmentImages.fragmentId} = ANY(${fragmentIds})`);

  // Group images by fragment
  const imagesByFragment = images.reduce((acc, img) => {
    if (!acc[img.fragmentId]) acc[img.fragmentId] = [];
    acc[img.fragmentId].push({
      url: img.imageUrl,
      altText: img.altText || '',
      pageNumber: img.pageNumber,
      imageType: img.imageType,
    });
    return acc;
  }, {} as Record<string, any[]>);

  return matchingContent.rows.map(row => ({
    fragmentId: row.fragment_id,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    content: row.content,
    pageNumber: row.page_number,
    pageLabel: row.page_label,
    sectionHeading: row.section_heading,
    subsectionHeading: row.subsection_heading,
    fragmentType: row.fragment_type,
    images: imagesByFragment[row.fragment_id] || [],
  }));
};
```

### Phase 3: Enhanced UI Display

#### Citation Display Component

```tsx
// components/citation.tsx
interface Citation {
  resourceId: string;
  resourceName: string;
  pageNumber?: number;
  pageLabel?: string;
  sectionHeading?: string;
  fragmentId: string;
  quoteSnippet?: string;
}

export function CitationDisplay({ citation }: { citation: Citation }) {
  const citationText = [
    citation.resourceName,
    citation.pageNumber && `p. ${citation.pageLabel || citation.pageNumber}`,
    citation.sectionHeading,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded">
      <BookOpen className="w-3 h-3" />
      <a
        href={`/resources/${citation.resourceId}/view?fragment=${citation.fragmentId}`}
        target="_blank"
        className="hover:underline"
        title={citation.quoteSnippet}
      >
        {citationText}
      </a>
    </div>
  );
}
```

#### Enhanced System Message Component

```tsx
// components/chat.tsx - Enhanced SystemMessage
const SystemMessage = ({ message, ...props }: SystemMessageProps) => {
  const parsed = JSON.parse(message.content) as EnhancedAnswer;
  const { answer, citations, images, resources, followUps } = parsed;

  return (
    <div className="flex flex-col gap-4">
      {/* Answer with inline citations */}
      <div className="prose prose-invert">
        <Markdown>{answer}</Markdown>
      </div>

      {/* Citations section */}
      {citations.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground flex items-center gap-2">
            <FileText className="w-3 h-3" />
            Sources
          </h4>
          <div className="flex flex-wrap gap-2">
            {citations.map((citation, idx) => (
              <CitationDisplay key={idx} citation={citation} />
            ))}
          </div>
        </div>
      )}

      {/* Images section */}
      {images.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground flex items-center gap-2">
            <ImageIcon className="w-3 h-3" />
            Visual References
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {images.map((img, idx) => (
              <figure key={idx} className="relative">
                <Image
                  src={img.url}
                  alt={img.altText}
                  width={400}
                  height={300}
                  className="rounded border border-muted"
                />
                {img.caption && (
                  <figcaption className="text-xs text-muted-foreground mt-1">
                    {img.caption}
                    {img.pageNumber && ` (p. ${img.pageNumber})`}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </div>
      )}

      {/* Resources and Follow-ups (existing) */}
      {/* ... */}
    </div>
  );
};
```

#### Resource Viewer with Fragment Linking

**New Route**: `/resources/[resourceId]/view`

```tsx
// app/resources/[resourceId]/view/page.tsx
export default async function ResourceViewer({
  params,
  searchParams,
}: {
  params: { resourceId: string };
  searchParams: { fragment?: string; page?: string };
}) {
  const resource = await getResource(params.resourceId, true);

  // Render PDF with highlighting or markdown view
  if (searchParams.fragment) {
    const fragment = await getFragment(searchParams.fragment);
    // Scroll to and highlight fragment
  }

  return <ResourceViewerUI resource={resource} highlightFragment={...} />;
}
```

### Phase 4: Quality Assurance

#### Citation Accuracy Testing

```typescript
// tests/citationQuality.test.ts
describe('citation accuracy', () => {
  test('returns valid page numbers', async () => {
    const result = await makeCall(gameId, 'How many players?');
    const parsed = AnswerSchema.parse(JSON.parse(result.text));

    for (const citation of parsed.citations) {
      expect(citation.pageNumber).toBeGreaterThan(0);

      // Verify fragment actually contains referenced info
      const fragment = await getFragment(citation.fragmentId);
      expect(fragment.pageNumber).toBe(citation.pageNumber);
    }
  });

  test('includes relevant images for setup questions', async () => {
    const result = await makeCall(gameId, 'How do I set up the board?');
    const parsed = AnswerSchema.parse(JSON.parse(result.text));

    expect(parsed.images.length).toBeGreaterThan(0);
    expect(parsed.images.some(img =>
      img.altText.toLowerCase().includes('setup')
    )).toBe(true);
  });
});
```

#### Image Quality Validation

```typescript
// Validate extracted images meet quality standards
async function validateExtractedImage(image: Buffer): Promise<boolean> {
  const metadata = await sharp(image).metadata();

  return (
    metadata.width >= 200 &&
    metadata.height >= 200 &&
    !isBlurry(image) &&
    !isMostlyBlank(image)
  );
}

async function isBlurry(image: Buffer): Promise<boolean> {
  // Use Laplacian variance to detect blur
  // Low variance = blurry image
  const { data } = await sharp(image)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Calculate variance (simplified)
  const variance = calculateImageVariance(data);
  return variance < BLUR_THRESHOLD;
}
```

## Performance Considerations

**PDF Processing Time with Mistral OCR**:
- Mistral OCR extraction: **3-5 seconds per PDF** (synchronous)
- Image processing (decode + convert + upload): ~1-2 seconds
- Fragment generation + embeddings: ~2-5 seconds
- **Total: 6-12 seconds per resource** (one-time cost)
- **95% faster** than Marker (30-120s → 6-12s)
- Can process synchronously or queue for background if preferred

**Old Approach (Marker)**:
- Marker with images: 30-120 seconds (async polling)
- Image extraction: +10-30 seconds
- Total: 1-3 minutes per resource

**Storage Impact**:
- Images: ~50-200KB per image (WebP compressed)
- Average rulebook: 20-50 pages, 5-15 images
- Total per game: ~1-3 MB additional storage
- Mitigate: Lazy load images in responses

**Query Performance**:
- Additional JOINs for images: +10-20ms per query
- Fragment metadata adds minimal overhead (<5ms)
- Overall: <50ms additional latency
- Cache frequently accessed images in CDN

**Response Size**:
- With citations: +200-500 bytes per response
- With images: +2-10KB per response (image URLs + metadata)
- Acceptable for most use cases
- Could paginate images if >5 in response

## Migration Strategy

**Phase 1** (Week 1):
- Install Mistral SDK: `pnpm add @mistralai/mistralai`
- Implement `extractTextFromPdf_Mistral` function
- Add new columns to fragments table
- Create fragment_images table

**Phase 2** (Week 2):
- Implement Mistral OCR extraction pipeline
- Test image extraction quality
- Build image storage pipeline
- Compare quality vs current extractors

**Phase 3** (Week 3):
- Update search function to return page metadata
- Enhance prompt to use citations and images
- Update response schema

**Phase 4** (Week 4):
- Build citation UI components
- Build image display in responses
- Create resource viewer with fragment linking

**Phase 5** (Week 5):
- Run migration on existing resources (background jobs)
- Quality testing and validation
- Deploy to production
- Deprecate Marker code

**Note**: Timeline reduced from 9 weeks to 5 weeks due to Mistral OCR's simpler integration (no polling logic needed).

## Backward Compatibility

**Existing Resources**:
- Old fragments without metadata still work
- Gradually reprocess old PDFs in background
- Citations gracefully degrade if metadata missing

**API Compatibility**:
- Old response format still supported
- New fields are optional additions
- Frontend handles both formats

## Security Considerations

1. **Image Access Control**: Fragment images inherit resource permissions
2. **Citation Verification**: Validate fragment IDs before displaying
3. **XSS Prevention**: Sanitize alt text and captions
4. **Rate Limiting**: Limit image requests per user/IP
5. **Storage Quotas**: Monitor blob storage usage

## Monitoring

**Metrics**:
- Citation accuracy rate (manual sampling)
- Image extraction success rate
- Image quality scores (automated)
- Average number of citations per response
- Image display rate in responses
- Fragment viewer engagement

**Alerts**:
- Image extraction failures >10%
- Citation generation failures
- Blob storage quota warnings
- Slow PDF processing (>5 minutes)

## Future Enhancements

1. **Interactive Diagrams**: Clickable regions in component diagrams
2. **PDF Viewer Integration**: Embedded PDF viewer with highlighting
3. **Citation Clustering**: Group related citations
4. **Image Search**: Semantic search over diagram captions
5. **Multi-language Support**: OCR for non-English manuals
6. **Video Support**: Extract frames from tutorial videos
7. **Community Annotations**: Users can suggest better citations
