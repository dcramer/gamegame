# GameGame Specifications

This directory contains technical specifications for major improvements to the GameGame platform.

## Overview

Three interconnected specifications detail the architecture for:
1. Enhanced game addition workflow
2. Annotated responses with source citations
3. Mistral OCR integration (the foundation for both)

## Specifications

### 1. [Add-Game Flow](./add-game-flow.md)

**Problem**: Manual game entry is tedious and error-prone.

**Solution**: Integrated BoardGameGeek API search + automated PDF discovery

**Key Features**:
- BGG search with autocomplete (find games in seconds)
- Automatic image fetching and conversion (900×600px WebP)
- Multi-source PDF discovery (BGG files, Google CSE, publisher databases)
- Google Docs URL support (auto-converts to PDF export)
- Multi-step workflow with preview

**Technologies**:
- BGG XML API2 (free, rate-limited)
- Google Custom Search API (optional, $5/1000 queries)
- Sharp for image processing
- PostgreSQL for publisher database

**Timeline**: 6-7 weeks (3 phases)

---

### 2. [Annotated Response Flow](./annotated-response-flow.md)

**Problem**: LLM responses don't show WHERE information comes from in the manual.

**Solution**: Enhanced RAG with page-level citations and embedded visuals

**Key Features**:
- Precise source citations ("Core Rulebook, p. 5, Game Setup")
- Embedded diagrams and tables from manuals
- Clickable citations that jump to exact page locations
- Native page structure (no parsing needed)
- Image bounding boxes for layout context

**Technologies**:
- Enhanced fragment metadata (page numbers, sections, images)
- Fragment images table for visual content
- Mistral OCR for extraction
- Resource viewer with fragment highlighting

**Timeline**: 5 weeks (5 phases)

---

### 3. [Mistral OCR Integration](./mistral-ocr-integration.md)

**Problem**: Current PDF extractors are slow (Marker) or low-quality (pdfjs).

**Solution**: Migrate to Mistral OCR for superior extraction

**Why Mistral OCR?**:
- ✅ **95% faster**: 3-5 seconds vs 30-120 seconds
- ✅ **Better quality**: Native markdown, preserved structure
- ✅ **Free image captions**: No GPT-4 Vision API calls needed
- ✅ **Native page structure**: No parsing needed
- ✅ **Synchronous API**: No polling complexity
- ✅ **Transparent pricing**: $0.001/page ($0.0005 batch)
- ✅ **Image extraction**: Base64 images with bounding boxes

**Cost Comparison** (50-page rulebook with 15 images):
| Component | Old (Marker + GPT-4V) | New (Mistral OCR) |
|-----------|------------------------|-------------------|
| PDF Extraction | ~$0.05 | **$0.05** |
| Image Captions | $0.15-0.45 | **$0** (included) |
| Processing Time | 90 seconds | **4 seconds** |
| **Total** | ~$0.20 / 90s | **$0.05 / 4s** |

**Response Structure**:
```typescript
{
  pages: Array<{
    index: number;              // 0-indexed page number
    markdown: string;           // Formatted text
    images: Array<{
      id: string;
      imageBase64: string;      // Decoded image data
      imageAnnotation: string;  // Auto-generated caption
      // Bounding box coordinates
      topLeftX/Y, bottomRightX/Y
    }>;
    dimensions: { dpi, width, height };
  }>;
  usageInfo: { pagesProcessed, docSizeBytes };
}
```

**SDK Usage**:
```bash
pnpm add @mistralai/mistralai
```

```typescript
import { Mistral } from '@mistralai/mistralai';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

const result = await client.ocr.process({
  model: 'mistral-ocr-latest',
  document: {
    type: 'document_base64',
    documentBase64: pdfBuffer.toString('base64'),
  },
  includeImageBase64: true,
});

// Access pages directly
for (const page of result.pages) {
  console.log(`Page ${page.index + 1}: ${page.images.length} images`);
}
```

**Timeline**: 1 week implementation + 1 week testing

---

## Dependencies Between Specs

```
┌─────────────────────────┐
│  Mistral OCR (Week 1-2) │
│  - Core extraction      │
│  - SDK integration      │
│  - Testing              │
└────────┬────────────────┘
         │
         ├──────────────────────────┐
         │                          │
┌────────▼─────────────┐   ┌────────▼──────────────┐
│ Add-Game Flow        │   │ Annotated Response    │
│ (Weeks 3-9)          │   │ (Weeks 3-7)           │
│                      │   │                       │
│ - BGG search         │   │ - Enhanced fragments  │
│ - Image processing   │   │ - Citation system     │
│ - PDF discovery      │   │ - Image display       │
└──────────────────────┘   └───────────────────────┘
```

**Recommended Sequence**:
1. **Week 1-2**: Implement Mistral OCR (foundation for both)
2. **Week 3-4**: Build BGG search integration (high user value)
3. **Week 5-7**: Implement annotated responses (enhanced RAG quality)
4. **Week 8-9**: Add PDF discovery mechanisms (polish add-game flow)

## Database Changes

### New Tables

```sql
-- Publishers for smart PDF discovery
CREATE TABLE publisher (
  id VARCHAR(191) PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  resources_url TEXT,
  website_url TEXT
);

-- Game-Publisher relationships
CREATE TABLE game_publisher (
  game_id VARCHAR(191) REFERENCES game(id),
  publisher_id VARCHAR(191) REFERENCES publisher(id),
  PRIMARY KEY (game_id, publisher_id)
);

-- Extracted images from manuals
CREATE TABLE fragment_image (
  id VARCHAR(191) PRIMARY KEY,
  fragment_id VARCHAR(191) REFERENCES fragment(id),
  resource_id VARCHAR(191) REFERENCES resource(id),
  page_number INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  image_type VARCHAR(50),    -- 'diagram', 'table', 'setup'
  alt_text TEXT,
  bounding_box JSONB,         -- {topLeftX/Y, bottomRightX/Y}
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Modified Tables

```sql
-- Enhanced fragment metadata
ALTER TABLE fragment
  ADD COLUMN page_number INTEGER,
  ADD COLUMN page_label VARCHAR(50),
  ADD COLUMN section_heading TEXT,
  ADD COLUMN subsection_heading TEXT,
  ADD COLUMN fragment_type VARCHAR(50) DEFAULT 'text',
  ADD COLUMN metadata JSONB;

-- Game metadata from BGG
ALTER TABLE game
  ADD COLUMN bgg_id VARCHAR(50) UNIQUE,
  ADD COLUMN publishers TEXT[];

-- Resource provenance tracking
ALTER TABLE resource
  ADD COLUMN source VARCHAR(50) DEFAULT 'manual',
  ADD COLUMN auto_discovered BOOLEAN DEFAULT FALSE,
  ADD COLUMN original_url TEXT;
```

## Environment Variables

```bash
# PDF Extraction (Mistral OCR recommended)
DEFAULT_PDF_EXTRACTOR=mistral  # "pdfjs", "marker", or "mistral"
MISTRAL_API_KEY=your_mistral_key

# Google Custom Search (optional, for PDF discovery)
GOOGLE_CSE_API_KEY=your_google_key
GOOGLE_CSE_ID=your_search_engine_id

# Deprecated (only if still using Marker)
DATALAB_API_KEY=your_datalab_key
```

## Cost Analysis

### Monthly Operating Costs (100 games/month scenario)

| Service | Usage | Cost |
|---------|-------|------|
| **Mistral OCR** | 5,000 pages (50/game avg) | **$5.00** |
| Google CSE | 100 searches | **$0.50** |
| OpenAI Embeddings | 500K tokens | **$0.10** |
| OpenAI Chat | Game responses | ~$2.00 |
| Vercel Blob Storage | ~300MB images | **$0.50** |
| **Total** | | **~$8.10/month** |

### Cost Savings vs Current Approach

| Item | Old (Marker + GPT-4V) | New (Mistral) | Savings |
|------|------------------------|---------------|---------|
| PDF Processing | ~$8.00 | **$5.00** | **37.5%** |
| Image Captions | ~$15.00 | **$0** | **100%** |
| **Total** | $23.00 | **$5.00** | **78%** |

Plus: **95% reduction in processing time** (90s → 4s per resource)

## Quality Improvements

### RAG Answer Quality

**Before**:
- Generic resource references: "See the rulebook"
- No page numbers
- Text-only responses
- Cannot verify sources

**After**:
- Precise citations: "Core Rulebook, p. 5, Game Setup"
- Embedded diagrams and tables
- Clickable sources (jump to exact location)
- Verifiable information

### User Experience

**Before**:
- Manual game entry (3-5 minutes)
- Manual PDF hunting (5-10 minutes)
- Wait 30-120s for PDF processing
- Generic answers without context

**After**:
- BGG search → select game (30 seconds)
- Guided PDF discovery (1-2 minutes)
- Wait 3-5s for PDF processing
- Answers with citations + diagrams

## Testing Strategy

### Unit Tests
- BGG API parsing (XML responses)
- Mistral OCR extraction (page structure, images)
- Fragment chunking (semantic boundaries)
- Citation generation (accuracy)

### Integration Tests
- Complete game addition flow
- PDF processing end-to-end
- RAG with citations and images
- Image extraction quality

### Quality Tests (LLM-based)
```typescript
test('Mistral improves answer quality', async () => {
  // Compare pdfjs vs Mistral for same PDF
  const pdfJsAnswer = await askQuestion(gameId, question, pdfJsResource);
  const mistralAnswer = await askQuestion(gameId, question, mistralResource);

  // Mistral should provide citations
  expect(mistralAnswer.citations.length).toBeGreaterThan(0);
  expect(mistralAnswer.citations[0].pageNumber).toBeGreaterThan(0);

  // Mistral should include relevant images
  expect(mistralAnswer.images.length).toBeGreaterThan(pdfJsAnswer.images.length);
});
```

## Rollout Plan

### Phase 1: Foundation (Weeks 1-2)
- ✅ Implement Mistral OCR extractor
- ✅ Test on sample PDFs
- ✅ Validate quality vs current extractors
- ✅ Deploy with `DEFAULT_PDF_EXTRACTOR=mistral`

### Phase 2: BGG Integration (Weeks 3-5)
- 🎯 Build BGG search API
- 🎯 Create search UI
- 🎯 Implement image auto-fetch
- 🎯 Deploy to admin users

### Phase 3: Enhanced RAG (Weeks 5-7)
- 🎯 Add fragment metadata columns
- 🎯 Create fragment_images table
- 🎯 Update response schema (citations + images)
- 🎯 Build citation UI components
- 🎯 Deploy to production

### Phase 4: PDF Discovery (Weeks 8-9)
- 🎯 Build publisher database
- 🎯 Add Google CSE integration (optional)
- 🎯 Enhance resource discovery UI
- 🎯 Deploy to production

### Phase 5: Migration & Cleanup (Week 10+)
- 🎯 Backfill existing resources with Mistral
- 🎯 Deprecate Marker code
- 🎯 Monitor costs and quality
- 🎯 Optimize based on usage

## Success Metrics

### BGG Integration
- ✅ 90%+ games added via search (not manual)
- ✅ <10 seconds to find and add game
- ✅ Zero manual image uploads

### Mistral OCR
- ✅ 50%+ improvement in RAG answer quality
- ✅ <5 seconds PDF extraction time
- ✅ <$50/month extraction costs

### Annotated Responses
- ✅ 90%+ responses include citations
- ✅ 70%+ setup questions include diagrams
- ✅ Users verify sources in <30 seconds

## Risks & Mitigations

### Technical Risks
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| BGG rate limiting | High | Medium | Implement caching + 5s delays |
| Mistral API downtime | High | Low | Keep pdfjs as fallback |
| Image quality varies | Medium | High | Validate + manual review |
| Cost overruns | Medium | Low | Set spending alerts |

### Business Risks
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Low user adoption | Medium | Low | Gather feedback early |
| BGG policy change | Low | Low | Have backup plans |
| Mistral pricing change | Medium | Low | Lock in with credits |

## Next Steps

1. **Week 1**: Review and approve specifications
2. **Week 2**: Set up Mistral OCR API key and test
3. **Week 3**: Begin Phase 1 implementation
4. **Ongoing**: Weekly progress reviews

## Questions?

See individual specs for detailed technical information:
- [add-game-flow.md](./add-game-flow.md) - Game addition workflow
- [annotated-response-flow.md](./annotated-response-flow.md) - RAG improvements
- [mistral-ocr-integration.md](./mistral-ocr-integration.md) - PDF extraction
