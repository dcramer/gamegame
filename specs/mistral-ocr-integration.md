# Mistral OCR Integration

## Overview

This document describes how using Mistral OCR instead of Marker/pdfjs changes our PDF extraction architecture and impacts both the add-game flow and annotated response flow specifications.

## Mistral OCR API Response Structure

```typescript
interface MistralOCRResponse {
  pages: Array<{
    index: number;                    // 0-indexed page number
    markdown: string;                 // Extracted text in markdown
    images: Array<{
      id: string;                     // Unique image identifier
      top_left_x: number;             // Bounding box coordinates
      top_left_y: number;
      bottom_right_x: number;
      bottom_right_y: number;
      image_base64: string;           // Base64 encoded image data
      image_annotation: string;       // Auto-generated caption/description
    }>;
    dimensions: {
      dpi: number;
      height: number;
      width: number;
    };
  }>;
  model: string;                      // "mistral-ocr-latest"
  usage_info: {
    pages_processed: number;
    doc_size_bytes: number;
  };
}
```

## Key Advantages Over Current Approach

### vs pdfjs (current default)
| Feature | pdfjs | Mistral OCR |
|---------|-------|-------------|
| **Structure Preservation** | ❌ Lost | ✅ **Markdown** |
| **Tables** | ❌ Broken | ✅ **Formatted** |
| **Page Numbers** | ❌ No | ✅ **Native** |
| **Images** | ❌ No | ✅ **Extracted with bounding boxes** |
| **Cost** | Free | **$0.001/page** |
| **Speed** | Fast | **Very fast (2000 pages/min)** |
| **Quality** | Low | **High** |

### vs Marker (current alternative)
| Feature | Marker | Mistral OCR |
|---------|--------|-------------|
| **API Style** | ❌ Async (polling) | ✅ **Synchronous** |
| **Processing Time** | 30-120 seconds | **<5 seconds** |
| **Page Metadata** | ⚠️ Via markers | ✅ **Native structure** |
| **Image Extraction** | ✅ Yes | ✅ **Yes + bounding boxes** |
| **Image Captions** | ❌ Manual | ✅ **Auto-generated** |
| **Cost** | Subscription (unknown) | **$0.001/page (transparent)** |
| **Setup** | API key + polling | **API key only** |

## Architecture Changes

### 1. Simplified PDF Processing Pipeline

**Old (Marker)**:
```
Upload PDF → Send to Marker → Poll every 1s (up to 5 min) → Parse response → Extract images → Upload images
```

**New (Mistral OCR)**:
```
Upload PDF → Send to Mistral OCR → Parse response (immediate) → Save base64 images
```

**Time Reduction**: From 30-120 seconds → **2-5 seconds**

### 2. Native Page Structure

**Old Approach** (Marker):
- Markdown with page markers: `<!-- Page 5 -->`
- Requires parsing to extract page boundaries
- Page numbers inferred from markers
- Images referenced by filename in markdown

**New Approach** (Mistral OCR):
- Native page-level array structure
- Each page is a separate object with index
- Direct access to page content
- Images embedded in page object with coordinates

**Example**:
```typescript
// Old: Parse markdown to find page boundaries
const pages = parseMarkdownWithPages(markdown);

// New: Direct access to page structure
const page5 = response.pages[4]; // 0-indexed
console.log(page5.markdown);
console.log(page5.images.length);
```

### 3. Image Extraction Simplified

**Old Approach** (Marker):
```typescript
// 1. Extract images from Marker response (separate process)
// 2. Download image files from Marker
// 3. Convert to WebP
// 4. Upload to blob storage
// 5. Generate alt text using GPT-4 Vision (optional)
// 6. Link to fragments

// Result: 10-30 seconds additional processing
```

**New Approach** (Mistral OCR):
```typescript
// 1. Decode base64 from response
// 2. Convert to WebP (already have buffer)
// 3. Upload to blob storage
// 4. Use image_annotation as alt text (free!)
// 5. Store bounding box for layout context

// Result: ~1-2 seconds per image
```

**Key Benefit**: Image annotations are **free** (no GPT-4 Vision API calls needed)

### 4. Enhanced Fragment Creation

**Old Approach**:
```typescript
interface Fragment {
  content: string;
  embedding: number[];
  // Page info inferred from markers
  pageNumber?: number;
}
```

**New Approach**:
```typescript
interface EnhancedFragment {
  content: string;
  embedding: number[];
  // Native from Mistral
  pageNumber: number;        // Direct from page.index
  pageWidth: number;         // From page.dimensions
  pageHeight: number;
  pageDpi: number;
  // Rich image context
  images: Array<{
    id: string;
    url: string;
    boundingBox: {
      topLeftX: number;
      topLeftY: number;
      bottomRightX: number;
      bottomRightY: number;
    };
    annotation: string;      // Auto-generated caption
  }>;
}
```

### 5. Bounding Box Benefits

Mistral provides precise image coordinates on the page. This enables:

1. **Layout Understanding**: Know where images appear relative to text
2. **Proximity Matching**: Link images to nearby text fragments
3. **Future Enhancements**:
   - Interactive PDF viewer with highlighted regions
   - "Show me on the page" feature
   - Better context for RAG (image position matters)

**Example**:
```typescript
// Find images near a specific text fragment
function findNearbyImages(
  fragment: Fragment,
  pageImages: MistralImage[]
): MistralImage[] {
  // Simple proximity: images on same page
  return pageImages.filter(img => {
    // Could enhance with actual position matching
    return img.pageIndex === fragment.pageNumber;
  });
}
```

## Implementation Changes

### Updated PDF Extraction Function

**Installation**:
```bash
pnpm add @mistralai/mistralai
```

**Implementation**:
```typescript
// lib/pdf.ts
import { Mistral } from '@mistralai/mistralai';
import { env } from './env.mjs';

const mistralClient = new Mistral({ apiKey: env.MISTRAL_API_KEY });

export const extractTextFromPdf_Mistral = async (
  buf: Buffer
): Promise<{
  pages: Array<{
    index: number;
    markdown: string;
    images: Array<{
      id: string;
      data: Buffer;           // Decoded base64
      annotation: string;
      boundingBox: BoundingBox;
    }>;
    dimensions: PageDimensions;
  }>;
  usage: {
    pagesProcessed: number;
    docSizeBytes: number;
  };
}> => {
  console.log('extracting text from pdf with mistral ocr');

  const base64 = buf.toString('base64');

  const result = await mistralClient.ocr.process({
    model: 'mistral-ocr-latest',
    document: {
      type: 'document_base64',
      documentBase64: base64,
    },
    includeImageBase64: true,  // Essential for image extraction
  });

  // Transform response to our format
  return {
    pages: result.pages.map(page => ({
      index: page.index,
      markdown: page.markdown,
      images: page.images.map(img => ({
        id: img.id,
        data: Buffer.from(img.image_base64, 'base64'),
        annotation: img.image_annotation,
        boundingBox: {
          topLeftX: img.top_left_x,
          topLeftY: img.top_left_y,
          bottomRightX: img.bottom_right_x,
          bottomRightY: img.bottom_right_y,
        },
      })),
      dimensions: page.dimensions,
    })),
    usage: {
      pagesProcessed: result.usage_info.pages_processed,
      docSizeBytes: result.usage_info.doc_size_bytes,
    },
  };
};
```

### Simplified Resource Creation

```typescript
// lib/actions/resources.ts
export const createResource = async (input: CreateResourceInput) => {
  const session = await auth();
  if (!session?.user?.admin) throw new Error('Unauthorized');

  // Fetch PDF
  const response = await fetch(input.url);
  const pdfBuffer = Buffer.from(await response.arrayBuffer());

  // Extract with Mistral OCR
  const extraction = await extractTextFromPdf_Mistral(pdfBuffer);

  // Process in transaction
  const resource = await db.transaction(async (tx) => {
    // Create resource record
    const [resource] = await tx
      .insert(resources)
      .values({
        gameId: input.gameId,
        name: input.name,
        url: input.url,
        version: CURRENT_INDEX_VERSION,
      })
      .returning();

    // Process each page
    for (const page of extraction.pages) {
      // Upload images for this page
      const uploadedImages: FragmentImage[] = [];

      for (const image of page.images) {
        // Convert to WebP
        const webpBuffer = await sharp(image.data)
          .webp({ quality: 90 })
          .toBuffer();

        // Upload to blob storage
        const imageUrl = await uploadToBlob(
          `${resource.id}/page-${page.index + 1}-${image.id}.webp`,
          webpBuffer
        );

        uploadedImages.push({
          id: nanoid(),
          resourceId: resource.id,
          pageNumber: page.index + 1, // Convert to 1-indexed
          imageUrl,
          imageType: classifyImageType(image.annotation),
          altText: image.annotation, // Free from Mistral!
          boundingBox: image.boundingBox,
        });
      }

      // Insert images
      if (uploadedImages.length > 0) {
        await tx.insert(fragmentImages).values(uploadedImages);
      }

      // Create fragments for this page
      const chunks = await chunkMarkdown(page.markdown, {
        maxSize: 1000,
        respectBoundaries: true,
      });

      for (const chunk of chunks) {
        const [embedding] = await generateEmbedding(chunk.content);

        // Find images referenced in this chunk
        const chunkImageIds = uploadedImages
          .filter(img => {
            // Link images that appear near this chunk
            // Could use bounding box for better matching
            return chunk.content.includes(img.altText);
          })
          .map(img => img.id);

        await tx.insert(fragments).values({
          gameId: resource.gameId,
          resourceId: resource.id,
          content: chunk.content,
          embedding,
          pageNumber: page.index + 1,
          pageWidth: page.dimensions.width,
          pageHeight: page.dimensions.height,
          pageDpi: page.dimensions.dpi,
          sectionHeading: chunk.heading,
          fragmentType: chunk.type,
          version: CURRENT_INDEX_VERSION,
          metadata: {
            imageIds: chunkImageIds,
            pageDimensions: page.dimensions,
          },
        });
      }
    }

    return resource;
  });

  return resource;
};

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

## Cost Analysis

### Per Resource Processing

**Example**: 50-page rulebook with 15 images

| Component | Old (Marker) | New (Mistral OCR) |
|-----------|--------------|-------------------|
| **PDF Extraction** | Subscription (~$0.05?) | **$0.05** (50 pages × $0.001) |
| **Image Processing** | Included | **Included** (base64 in response) |
| **Alt Text Generation** | $0.03 (15 × GPT-4V) | **$0** (included) |
| **Processing Time** | 60-120 seconds | **3-5 seconds** |
| **Total Cost** | ~$0.08 | **$0.05** |
| **Total Time** | ~90 seconds | **4 seconds** |

**Savings per resource**: $0.03 + 85 seconds

### Monthly Projections

| Usage | Old (Marker) | New (Mistral OCR) |
|-------|--------------|-------------------|
| **10 games/month** | ~$0.80 | **$0.50** |
| **50 games/month** | ~$4.00 | **$2.50** |
| **100 games/month** | ~$8.00 | **$5.00** |

**Plus**: 37.5% cost reduction + 95% time reduction

### Batch Processing Option

Mistral offers batch processing at **$0.0005/page** (half price):
- 50-page rulebook: $0.025 instead of $0.05
- 100 games/month: $2.50 instead of $5.00
- Trade-off: Longer processing time (acceptable for background jobs)

## Migration Strategy

### Phase 1: Add Mistral Extractor (Week 1)

1. Implement `extractTextFromPdf_Mistral` function
2. Add `MISTRAL_API_KEY` to environment
3. Set `DEFAULT_PDF_EXTRACTOR=mistral`
4. Test on sample PDFs

### Phase 2: Deploy and Monitor (Week 2)

1. Deploy to production with feature flag
2. Process new resources with Mistral
3. Monitor quality and costs
4. Compare vs existing Marker resources

### Phase 3: Backfill (Weeks 3-4)

1. Identify resources to reprocess
2. Queue background jobs for Mistral reprocessing
3. Compare old vs new fragment quality
4. Gradually migrate all resources

### Phase 4: Deprecate Marker (Week 5)

1. Remove Marker code and dependencies
2. Clean up environment variables
3. Update documentation
4. Remove `pdfjs` as well (keep as emergency fallback?)

## Quality Improvements

### Better RAG Results

1. **Structured Content**: Markdown preserves headings, lists, tables
2. **Page Context**: Exact page numbers for citations
3. **Visual Context**: Diagrams linked to relevant text
4. **Layout Understanding**: Bounding boxes for spatial reasoning

### Better User Experience

1. **Faster Processing**: 95% reduction in wait time
2. **Accurate Citations**: "Core Rulebook, p. 5, Game Setup"
3. **Visual Answers**: Diagrams shown with explanations
4. **Verifiable Sources**: Click to jump to exact page

### Better Maintainability

1. **Simpler Code**: No polling logic, no async complexity
2. **One API**: Replace both pdfjs and Marker with Mistral
3. **Predictable Costs**: Transparent pricing, no subscriptions
4. **Better Errors**: Synchronous = easier error handling

## Limitations and Considerations

### File Size Limits
- **Max**: 50MB per PDF
- **Mitigation**: Split large PDFs (rare for board game manuals)

### Page Limits
- **Max**: 1,000 pages per request
- **Impact**: Not an issue (most rulebooks are <200 pages)

### Image Quality
- **Dependency**: Quality depends on PDF quality
- **Mitigation**: Same as current approach (garbage in, garbage out)

### API Availability
- **Risk**: Mistral OCR is relatively new (2025)
- **Mitigation**: Keep pdfjs as fallback, monitor Mistral status page

## Testing Strategy

### Unit Tests
```typescript
describe('Mistral OCR extraction', () => {
  test('extracts pages with correct indices', async () => {
    const result = await extractTextFromPdf_Mistral(samplePdf);
    expect(result.pages[0].index).toBe(0);
    expect(result.pages[1].index).toBe(1);
  });

  test('extracts images with bounding boxes', async () => {
    const result = await extractTextFromPdf_Mistral(pdfWithImages);
    const image = result.pages[0].images[0];
    expect(image.boundingBox).toHaveProperty('topLeftX');
    expect(image.annotation).toBeTruthy();
  });

  test('includes page dimensions', async () => {
    const result = await extractTextFromPdf_Mistral(samplePdf);
    expect(result.pages[0].dimensions.width).toBeGreaterThan(0);
  });
});
```

### Integration Tests
```typescript
test('full resource creation with Mistral', async () => {
  const resource = await createResource({
    gameId: testGameId,
    name: 'Test Rulebook.pdf',
    url: testPdfUrl,
  });

  // Verify fragments created
  const fragments = await getFragmentsForResource(resource.id);
  expect(fragments.every(f => f.pageNumber > 0)).toBe(true);

  // Verify images extracted
  const images = await getImagesForResource(resource.id);
  expect(images.length).toBeGreaterThan(0);
  expect(images[0].altText).toBeTruthy();
});
```

### Quality Tests
```typescript
test('Mistral improves answer quality', async () => {
  // Process same PDF with pdfjs vs Mistral
  const pdfJsResource = await createResource({...opts, extractor: 'pdfjs'});
  const mistralResource = await createResource({...opts, extractor: 'mistral'});

  // Ask same question
  const pdfJsAnswer = await askQuestion(gameId, 'How do I set up?', pdfJsResource);
  const mistralAnswer = await askQuestion(gameId, 'How do I set up?', mistralResource);

  // Mistral should include citations and images
  expect(mistralAnswer.citations.length).toBeGreaterThan(0);
  expect(mistralAnswer.images.length).toBeGreaterThan(pdfJsAnswer.images.length);
});
```

## Rollback Plan

If Mistral OCR has issues:

1. **Immediate**: Set `DEFAULT_PDF_EXTRACTOR=marker` (or `pdfjs`)
2. **Short-term**: Keep Marker credentials active during migration period
3. **Long-term**: Monitor Mistral quality, only deprecate Marker after 90 days

## Conclusion

Switching to Mistral OCR provides:
- ✅ **95% faster processing** (4s vs 90s)
- ✅ **37.5% cost savings** ($0.05 vs $0.08 per 50-page doc)
- ✅ **Better quality** (structured markdown, native pages)
- ✅ **Simpler code** (no polling, one API)
- ✅ **Free image captions** (no GPT-4 Vision needed)
- ✅ **Native citations** (page numbers built-in)

**Recommendation**: Migrate immediately. The advantages are significant and the risks are minimal.
