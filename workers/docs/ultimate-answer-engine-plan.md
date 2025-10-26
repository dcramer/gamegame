# The Ultimate Board Game Answer Engine - Implementation Plan

**Document Version**: 1.0
**Date**: 2025-01-25
**Status**: Planning

---

## Executive Summary

This document outlines the comprehensive plan to transform GameGame into **the best board game answer engine** by implementing:

1. **Rich Multi-Modal Indexing** - Searchable text, images, and tables with contextual embeddings
2. **HyDE (Hypothetical Document Embeddings)** - Question generation for improved query matching
3. **Advanced Hybrid Search** - Multi-index search with query classification and cross-encoder reranking
4. **Structured Response Generation** - AI SDK's `generateObject` with rich citations and confidence scoring
5. **Enhanced UI/UX** - Rich citations, image lightboxes, confidence indicators, categorized follow-ups
6. **Comprehensive Observability** - Structured logging with Analytics Engine and aggregated metrics

**Expected Outcomes**:
- Search quality (MRR) > 0.85
- User satisfaction > 4.5/5 (90%+)
- Response latency p95 < 3s
- Citation accuracy 95%+

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 1: Foundation - Rich Multi-Modal Indexing](#phase-1-foundation)
3. [Phase 2: Advanced Search & Retrieval](#phase-2-search)
4. [Phase 3: Advanced Response Generation](#phase-3-response)
5. [Phase 4: UI/UX Enhancements](#phase-4-ui)
6. [Phase 5: Quality & Reliability](#phase-5-quality)
7. [Phase 6: Observability & Metrics](#phase-6-observability)
8. [Implementation Timeline](#implementation-timeline)
9. [Success Metrics](#success-metrics)
10. [Cost Estimates](#cost-estimates)

---

## Architecture Overview

### Current State

**Search System**:
- Hybrid search: Vectorize (semantic) + D1 FTS5 (full-text)
- RRF fusion with k=50, equal weighting
- Only searches fragment `content` (markdown text)

**Data Available but Not Searchable**:
- Resource `description` and `originalFilename`
- Attachment `description` (AI-generated image descriptions)

**Response Generation**:
- LLM generates JSON string responses
- Client parses JSON, extracts markdown images via regex
- Basic citations (just resource list, no page numbers)

**Limitations**:
- Images not actively searchable
- No contextual metadata in embeddings
- JSON parsing fragile
- Limited citation quality
- No confidence scoring
- No answer validation

### Target State

**Search System**:
- **Multi-index hybrid search**: Text fragments + Image fragments + Synthetic questions
- **Query classification**: Understand intent to adjust search strategy
- **Contextual embeddings**: Include resource metadata, section hierarchy, image context
- **Cross-encoder reranking**: Final relevance scoring
- **Result diversification**: Avoid redundancy

**Data Model**:
- **Fragment types**: `text`, `image`, `table`
- **Dual content**: `content` (display) + `searchableContent` (embedding)
- **Rich metadata**: Resource type, edition, language, importance scores
- **Image analysis**: Quality scoring, type detection, OCR for tables

**Response Generation**:
- **Structured outputs**: AI SDK `generateObject` with Zod schemas
- **Rich citations**: Page numbers, sections, relevance levels, direct quotes
- **Confidence scoring**: High/medium/low with calibration
- **Answer validation**: Secondary LLM validates accuracy
- **Ambiguity detection**: Flag rule conflicts

**UI/UX**:
- **Rich citation display**: Show sources with page numbers and quotes
- **Image lightbox**: Full-screen images with descriptions and OCR text
- **Confidence indicators**: Visual warnings for low-confidence answers
- **Categorized follow-ups**: Related, deeper, clarifying questions
- **Feedback system**: Thumbs up/down with optional comments

---

## Phase 1: Foundation - Rich Multi-Modal Indexing {#phase-1-foundation}

### 1.1 Enhanced Data Model

#### Database Schema Changes

**Update `fragments` table**:
```sql
ALTER TABLE fragments ADD COLUMN type TEXT NOT NULL DEFAULT 'text'; -- 'text' | 'image' | 'table'
ALTER TABLE fragments ADD COLUMN attachment_id TEXT REFERENCES attachments(id);
ALTER TABLE fragments ADD COLUMN searchable_content TEXT; -- Enriched for embeddings
ALTER TABLE fragments ADD COLUMN synthetic_questions TEXT; -- JSON array of HyDE questions
ALTER TABLE fragments ADD COLUMN resource_name TEXT; -- Denormalized
ALTER TABLE fragments ADD COLUMN resource_description TEXT; -- Denormalized
ALTER TABLE fragments ADD COLUMN resource_type TEXT; -- 'rulebook' | 'expansion' | 'faq' | 'errata'
ALTER TABLE fragments ADD COLUMN importance REAL; -- 0-1 score
ALTER TABLE fragments ADD COLUMN readability REAL; -- 0-1 score

CREATE INDEX idx_fragments_type ON fragments(type);
CREATE INDEX idx_fragments_attachment ON fragments(attachment_id);
```

**Update `resources` table**:
```sql
ALTER TABLE resources ADD COLUMN resource_type TEXT DEFAULT 'rulebook';
ALTER TABLE resources ADD COLUMN language TEXT DEFAULT 'en';
ALTER TABLE resources ADD COLUMN edition TEXT; -- "2nd Edition", etc.
ALTER TABLE resources ADD COLUMN is_official INTEGER DEFAULT 1; -- Boolean
```

**Update `attachments` table**:
```sql
-- Already has description field
ALTER TABLE attachments ADD COLUMN is_relevant INTEGER; -- Boolean: useful vs decorative
ALTER TABLE attachments ADD COLUMN detected_type TEXT; -- 'diagram' | 'table' | 'photo' | 'icon' | 'decorative'
ALTER TABLE attachments ADD COLUMN ocr_text TEXT; -- Text extracted from tables
```

### 1.2 Contextual Embedding Generation

**Build rich searchable content for text fragments**:

```typescript
function buildSearchableContent(
  fragment: PDFChunk,
  resource: Resource,
  attachments: Attachment[]
): string {
  const parts: string[] = [];

  // Document context
  parts.push('--- DOCUMENT CONTEXT ---');
  parts.push(`Title: ${resource.name}`);
  if (resource.originalFilename) {
    parts.push(`Filename: ${resource.originalFilename}`);
  }
  if (resource.description) {
    parts.push(`Description: ${resource.description}`);
  }
  parts.push(`Type: ${resource.resourceType || 'rulebook'}`);
  if (resource.edition) {
    parts.push(`Edition: ${resource.edition}`);
  }
  parts.push('');

  // Location context
  parts.push('--- LOCATION ---');
  if (fragment.pageNumber) {
    parts.push(`Page: ${fragment.pageNumber}`);
  }
  if (fragment.section) {
    parts.push(`Section: ${fragment.section}`);
  }
  parts.push('');

  // Image context (if this page has images)
  if (fragment.images && fragment.images.length > 0) {
    parts.push('--- VISUAL ELEMENTS ---');
    fragment.images.forEach((img, idx) => {
      const attachment = attachments.find(a => a.id === img.id);
      if (attachment?.description) {
        parts.push(`Image ${idx + 1}: ${attachment.description}`);
      }
      if (attachment?.detectedType) {
        parts.push(`  Type: ${attachment.detectedType}`);
      }
    });
    parts.push('');
  }

  // Main content
  parts.push('--- CONTENT ---');
  parts.push(fragment.content);

  return parts.join('\n');
}
```

**Build searchable content for image fragments**:

```typescript
function buildImageSearchableContent(
  image: PDFImage,
  attachment: Attachment,
  page: PDFPage,
  resource: Resource
): string {
  const parts: string[] = [];

  parts.push('--- DOCUMENT CONTEXT ---');
  parts.push(`Document: ${resource.name}`);
  if (resource.description) {
    parts.push(`Description: ${resource.description}`);
  }
  parts.push('');

  parts.push('--- IMAGE CONTEXT ---');
  parts.push(`Type: ${attachment.detectedType || 'image'}`);
  parts.push(`Page: ${page.pageNumber}`);
  if (page.section) {
    parts.push(`Section: ${page.section}`);
  }
  if (image.caption) {
    parts.push(`Caption: ${image.caption}`);
  }
  parts.push('');

  parts.push('--- DESCRIPTION ---');
  parts.push(attachment.description || image.description || '');

  return parts.join('\n');
}
```

**Storage strategy**:
- `content`: Clean display version (original markdown)
- `searchableContent`: Enriched version for embeddings
- Embed `searchableContent`, display `content`

### 1.3 HyDE: Hypothetical Document Embeddings

**Generate 3-5 questions each fragment could answer**:

```typescript
async function generateQuestionsForFragment(
  fragment: { content: string; section?: string; pageNumber?: number },
  resource: { name: string; description?: string },
  openaiApiKey: string
): Promise<string[]> {
  const prompt = `Given this content from a board game rulebook, generate 3-5 specific questions that this content directly answers.

Document: ${resource.name}
${resource.description ? `Description: ${resource.description}` : ''}
${fragment.section ? `Section: ${fragment.section}` : ''}
${fragment.pageNumber ? `Page: ${fragment.pageNumber}` : ''}

Content:
${fragment.content}

Generate questions that:
- Are specific and answerable from this content
- Use natural language (how players would ask)
- Cover different aspects of the content
- Include relevant game-specific terms

Return ONLY a JSON array of questions, nothing else.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);
  return result.questions || [];
}
```

**Embedding strategy**:
```typescript
// Embed both content AND questions
async function embedFragmentWithQuestions(
  fragment: FragmentData,
  openaiApiKey: string
): Promise<number[][]> {
  const textsToEmbed = [
    fragment.searchableContent,
    ...(fragment.syntheticQuestions || [])
  ];

  // Returns array of embeddings: [contentEmbedding, q1Embedding, q2Embedding, ...]
  return await generateEmbeddings(textsToEmbed, openaiApiKey);
}
```

**Store in Vectorize with metadata**:
- Each question gets its own vector
- Metadata includes `fragmentId`, `questionIndex`, `type: 'question'`
- Link back to original fragment

### 1.4 Image Quality & Relevance Detection

**Analyze images during processing**:

```typescript
async function analyzeImageQuality(
  imageBuffer: ArrayBuffer,
  context: { pageNumber: number; section?: string },
  openaiApiKey: string
): Promise<{
  description: string;
  quality: 'good' | 'bad';
  relevant: boolean;
  type: 'diagram' | 'table' | 'photo' | 'icon' | 'decorative';
  ocrText?: string;
}> {
  const base64 = arrayBufferToBase64(imageBuffer);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this image from a board game rulebook (page ${context.pageNumber}, section: ${context.section || 'unknown'}).

Provide:
1. description: Detailed description of what the image shows (2-3 sentences)
2. quality: Is this a clear, readable image? ("good" or "bad")
3. relevant: Does this contain useful gameplay information? (true/false)
4. type: "diagram" (gameplay illustration), "table" (data table), "photo" (product photo), "icon" (small symbol), or "decorative"
5. ocrText: If this is a table or contains readable text, extract it (otherwise null)

Return JSON only.`
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64}` }
          }
        ]
      }],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    }),
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

**Filter strategy**:
- Only create image fragments for `relevant: true` images
- Skip decorative images entirely
- Use OCR text for table fragments

### 1.5 Fragment Generation Updates

**Generate TWO types of fragments**:

```typescript
// In pdf-processor.ts

// 1. Text fragments (existing logic with enhanced content)
const textFragments = (await chunkStructuredPDF(structured)).map(chunk => ({
  type: 'text',
  content: chunk.content, // Clean
  searchableContent: buildSearchableContent(chunk, resource, attachments),
  syntheticQuestions: await generateQuestionsForFragment(chunk, resource, openaiApiKey),
  pageNumber: chunk.pageNumber,
  section: chunk.section,
  images: chunk.images,
  resourceName: resource.name,
  resourceDescription: resource.description,
  resourceType: resource.resourceType,
}));

// 2. Image fragments (NEW - one per relevant image)
const imageFragments = structured.pages.flatMap(page =>
  page.images
    .filter(img => {
      const attachment = attachments.find(a => a.id === img.id);
      return attachment?.isRelevant && attachment?.description;
    })
    .map(img => {
      const attachment = attachments.find(a => a.id === img.id);
      return {
        type: 'image',
        attachmentId: img.id,
        content: attachment.description, // Clean description
        searchableContent: buildImageSearchableContent(img, attachment, page, resource),
        syntheticQuestions: null, // Could generate for images too
        pageNumber: page.pageNumber,
        section: getCurrentSection(page),
        images: [{ id: img.id, url: img.url, description: attachment.description }],
        resourceName: resource.name,
        resourceDescription: resource.description,
        resourceType: resource.resourceType,
      };
    })
);

// Combine and embed both
const allFragments = [...textFragments, ...imageFragments];
```

---

## Phase 2: Advanced Search & Retrieval {#phase-2-search}

### 2.1 Query Classification

**Understand query intent to adjust search strategy**:

```typescript
interface QueryClassification {
  type: 'setup' | 'rules' | 'clarification' | 'strategy' | 'components' | 'general';
  isVisual: boolean;      // Wants to see images/diagrams
  isComparative: boolean; // Comparing options (expansions, player counts, etc.)
  playerCount?: number;   // Specific player count mentioned
  expansions: string[];   // Mentioned expansions
  complexity: 'simple' | 'complex'; // Simple lookup vs complex multi-step
  confidence: number;     // 0-1
}

async function classifyQuery(query: string, openaiApiKey: string): Promise<QueryClassification> {
  const prompt = `Classify this board game question:

"${query}"

Analyze:
- type: What kind of question? (setup, rules, clarification, strategy, components, general)
- isVisual: Does the user want to see images/diagrams? (keywords: show, diagram, picture, look like)
- isComparative: Is this comparing options? (keywords: difference, vs, or, better, which)
- playerCount: Extract player count if mentioned (null otherwise)
- expansions: List any expansion names mentioned (empty array otherwise)
- complexity: Is this simple lookup or complex multi-step question?

Return JSON only.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 200,
    }),
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

**Calculate search weights based on classification**:

```typescript
function calculateWeights(classification: QueryClassification) {
  const base = {
    textVector: 1.0,
    imageVector: 0.3,
    fts: 1.0,
    questions: 0.5,
  };

  // Boost images for visual queries
  if (classification.isVisual) {
    base.imageVector = 2.0;
  }

  // Boost FTS for exact phrase matches
  if (classification.complexity === 'simple') {
    base.fts = 1.5;
  }

  // Boost HyDE for complex questions
  if (classification.complexity === 'complex') {
    base.questions = 1.0;
  }

  return base;
}
```

### 2.2 Multi-Index Hybrid Search

**Four parallel searches with smart fusion**:

```typescript
async function advancedHybridSearch(
  query: string,
  gameId: string,
  db: D1Database,
  vectorIndex: VectorizeIndex,
  openaiApiKey: string,
  options: {
    limit?: number;
    includeImages?: boolean;
    minQuality?: number;
  } = {}
): Promise<EnrichedSearchResult[]> {
  const limit = options.limit ?? 10;
  const candidateCount = limit * 3;

  // Step 1: Classify query
  const queryType = await classifyQuery(query, openaiApiKey);

  // Step 2: Generate query embedding
  const [queryEmbedding] = await generateEmbedding(query, openaiApiKey);

  // Step 3: Parallel searches
  const [textVectorResults, imageVectorResults, ftsResults, questionResults] =
    await Promise.allSettled([
      // A. Text fragments via vector search
      searchVectorize(vectorIndex, queryEmbedding, gameId, {
        filter: { type: 'text' },
        limit: candidateCount,
      }),

      // B. Image fragments via vector search (if query seems visual)
      queryType.isVisual || options.includeImages
        ? searchVectorize(vectorIndex, queryEmbedding, gameId, {
            filter: { type: 'image', isRelevant: true },
            limit: Math.floor(candidateCount / 2),
          })
        : Promise.resolve([]),

      // C. FTS5 full-text search
      searchFTS5(db, query, gameId, { limit: candidateCount }),

      // D. Search synthetic questions (HyDE)
      searchSyntheticQuestions(db, vectorIndex, queryEmbedding, gameId, {
        limit: Math.floor(candidateCount / 2),
      }),
    ]);

  // Step 4: Advanced RRF fusion with query-aware weighting
  const weights = calculateWeights(queryType);
  const fusedResults = fuseResultsWithMetadata(
    {
      textVector: textVectorResults.status === 'fulfilled' ? textVectorResults.value : [],
      imageVector: imageVectorResults.status === 'fulfilled' ? imageVectorResults.value : [],
      fts: ftsResults.status === 'fulfilled' ? ftsResults.value : [],
      questions: questionResults.status === 'fulfilled' ? questionResults.value : [],
    },
    weights
  );

  // Step 5: Fetch full fragment data with all metadata
  const enrichedResults = await fetchEnrichedFragments(db, fusedResults.slice(0, limit * 2));

  // Step 6: Cross-encoder reranking (optional but recommended)
  const reranked = await rerankWithCrossEncoder(query, enrichedResults, openaiApiKey);

  // Step 7: Diversification (don't return 5 chunks from same page)
  const diversified = diversifyResults(reranked, {
    maxPerPage: 2,
    maxPerResource: 6,
  });

  return diversified.slice(0, limit);
}
```

### 2.3 Cross-Encoder Reranking

**Use a cross-encoder model for final reranking**:

```typescript
async function rerankWithCrossEncoder(
  query: string,
  candidates: EnrichedSearchResult[],
  openaiApiKey: string
): Promise<EnrichedSearchResult[]> {
  // Option A: Use OpenAI for reranking (expensive but good)
  const scores = await Promise.all(
    candidates.map(async (candidate) => {
      const score = await scoreRelevance(query, candidate.searchableContent, openaiApiKey);
      return { candidate, score };
    })
  );

  // Option B: Use local cross-encoder model via Workers AI (cheaper)
  // const scores = await env.AI.run('@cf/cross-encoder/ms-marco-minilm', {
  //   query,
  //   documents: candidates.map(c => c.searchableContent)
  // });

  return scores
    .sort((a, b) => b.score - a.score)
    .map(s => s.candidate);
}

async function scoreRelevance(
  query: string,
  document: string,
  openaiApiKey: string
): Promise<number> {
  const prompt = `Rate how well this document answers the query on a scale of 0-100.

Query: "${query}"

Document:
${document.slice(0, 1000)}

Return only a number 0-100.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 10,
    }),
  });

  const data = await response.json();
  return parseInt(data.choices[0].message.content) / 100;
}
```

### 2.4 Result Diversification

**Avoid redundancy**:

```typescript
function diversifyResults(
  results: EnrichedSearchResult[],
  options: {
    maxPerPage?: number;
    maxPerResource?: number;
    maxPerSection?: number;
  }
): EnrichedSearchResult[] {
  const { maxPerPage = 2, maxPerResource = 6, maxPerSection = 3 } = options;

  const diversified: EnrichedSearchResult[] = [];
  const pageCount = new Map<number, number>();
  const resourceCount = new Map<string, number>();
  const sectionCount = new Map<string, number>();

  for (const result of results) {
    const pageKey = result.pageNumber || 0;
    const resourceKey = result.resourceId;
    const sectionKey = result.section || 'none';

    // Check constraints
    if ((pageCount.get(pageKey) || 0) >= maxPerPage) continue;
    if ((resourceCount.get(resourceKey) || 0) >= maxPerResource) continue;
    if ((sectionCount.get(sectionKey) || 0) >= maxPerSection) continue;

    diversified.push(result);
    pageCount.set(pageKey, (pageCount.get(pageKey) || 0) + 1);
    resourceCount.set(resourceKey, (resourceCount.get(resourceKey) || 0) + 1);
    sectionCount.set(sectionKey, (sectionCount.get(sectionKey) || 0) + 1);
  }

  return diversified;
}
```

### 2.5 Synthetic Question Search

**Search questions separately, return parent fragments**:

```typescript
async function searchSyntheticQuestions(
  db: D1Database,
  vectorIndex: VectorizeIndex,
  queryEmbedding: number[],
  gameId: string,
  options: { limit: number }
): Promise<VectorMatch[]> {
  // Search vectors tagged with type: 'question'
  const questionMatches = await searchVectorize(vectorIndex, queryEmbedding, gameId, {
    filter: { type: 'question' },
    limit: options.limit,
  });

  // Extract parent fragment IDs
  const fragmentIds = questionMatches.map(m => m.metadata.fragmentId);

  // Return as if they were fragment matches
  return questionMatches.map(m => ({
    fragmentId: m.metadata.fragmentId,
    score: m.score,
  }));
}
```

---

## Phase 3: Advanced Response Generation {#phase-3-response}

### 3.1 Structured Outputs (No More JSON Parsing)

**Use AI SDK's `generateObject` instead of JSON strings**:

```typescript
import { streamObject } from 'ai';
import { z } from 'zod';

const AnswerSchema = z.object({
  answer: z.string().describe('Markdown-formatted answer to the question'),

  questionType: z.enum(['gameplay', 'knowledge', 'external', 'gamegame']),

  citations: z.array(z.object({
    resourceId: z.string(),
    resourceName: z.string(),
    pageNumber: z.number().optional(),
    pageRange: z.array(z.number()).optional(),
    section: z.string().optional(),
    relevance: z.enum(['primary', 'supporting', 'related']),
    quote: z.string().optional().describe('Direct quote from source if applicable'),
  })).describe('Sources used, ordered by relevance'),

  images: z.array(z.object({
    attachmentId: z.string(),
    url: z.string(),
    description: z.string(),
    relevance: z.enum(['essential', 'helpful', 'supplementary']),
    placement: z.enum(['inline', 'end']).describe('Where to show in answer'),
  })).describe('Images to include in response'),

  confidence: z.enum(['high', 'medium', 'low']).describe('Confidence in answer'),

  ambiguities: z.array(z.string()).optional().describe('Ambiguous points or rule conflicts'),

  followUps: z.array(z.object({
    question: z.string(),
    category: z.enum(['related', 'deeper', 'clarifying']),
  })).describe('Suggested follow-up questions'),

  playerCountSpecific: z.number().optional().describe('If answer is specific to a player count'),
  expansionSpecific: z.array(z.string()).optional().describe('If answer requires specific expansions'),
});

export async function streamEnhancedChatResponse(
  env: Env,
  game: GameSummary,
  messages: ChatMessage[],
  baseUrl: string
) {
  const tools = getEnhancedTools(game.id, env, baseUrl);
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

  // Use streamObject instead of streamText for structured output
  const result = streamObject({
    model: openai(env.CHAT_MODEL || 'gpt-4o'),
    system: buildEnhancedPrompt(game),
    messages: convertToCoreMessages(messages),
    schema: AnswerSchema,
    tools,
    maxSteps: 10, // Allow more tool calls for complex questions
  });

  return result.toTextStreamResponse();
}
```

### 3.2 Enhanced Tools

**Better tool definitions with richer data**:

```typescript
function getEnhancedTools(gameId: string, env: Env, baseUrl: string) {
  return {
    searchKnowledge: tool({
      description: 'Search the knowledge base for relevant rules, setup instructions, or gameplay information. Returns text fragments, images, and tables.',
      parameters: z.object({
        query: z.string().describe('The search query - use natural language'),
        includeImages: z.boolean().default(true).describe('Whether to include image results'),
        playerCount: z.number().optional().describe('Filter for specific player count if relevant'),
        expansion: z.string().optional().describe('Filter for specific expansion if relevant'),
      }),
      execute: async ({ query, includeImages, playerCount, expansion }) => {
        const results = await advancedHybridSearch(
          query,
          gameId,
          env.DB,
          env.VECTORIZE,
          env.OPENAI_API_KEY,
          { includeImages, limit: 12 }
        );

        // Filter by player count or expansion if specified
        const filtered = results.filter(r => {
          if (playerCount && r.content.toLowerCase().includes(`${playerCount} player`)) {
            return true;
          }
          if (expansion && r.resourceName.toLowerCase().includes(expansion.toLowerCase())) {
            return true;
          }
          return !playerCount && !expansion;
        });

        return filtered.length > 0 ? filtered : results;
      },
    }),

    getImageDetails: tool({
      description: 'Get full details about a specific image, including high-resolution description and OCR text if available',
      parameters: z.object({
        attachmentId: z.string().describe('The attachment ID'),
      }),
      execute: async ({ attachmentId }) => {
        const db = getDb(env.DB);
        const [attachment] = await db
          .select()
          .from(attachments)
          .where(eq(attachments.id, attachmentId))
          .limit(1);

        if (!attachment) {
          return { success: false, error: 'Attachment not found' };
        }

        const { r2KeyToUrl } = await import('../services/r2-storage');

        return {
          success: true,
          id: attachment.id,
          url: `${baseUrl}${r2KeyToUrl(attachment.r2Key)}`,
          description: attachment.description,
          type: attachment.detectedType,
          caption: attachment.caption,
          pageNumber: attachment.pageNumber,
          ocrText: attachment.ocrText, // For tables!
          isGoodQuality: attachment.isGoodQuality,
        };
      },
    }),

    compareRules: tool({
      description: 'Compare rules across different resources (base game vs expansions, different editions, FAQs vs rulebook)',
      parameters: z.object({
        topic: z.string().describe('What rule or mechanism to compare'),
        resources: z.array(z.string()).describe('Resource IDs to compare'),
      }),
      execute: async ({ topic, resources }) => {
        // Search each resource separately
        const results = await Promise.all(
          resources.map(resourceId =>
            advancedHybridSearch(
              topic,
              gameId,
              env.DB,
              env.VECTORIZE,
              env.OPENAI_API_KEY,
              { limit: 3 }
            ).then(r => r.filter(result => result.resourceId === resourceId))
          )
        );

        return results.map((resourceResults, idx) => ({
          resourceId: resources[idx],
          matches: resourceResults,
        }));
      },
    }),

    listResources: tool({
      description: 'List all available resources (rulebooks, expansions, FAQs, errata) for this game',
      parameters: z.object({
        type: z.enum(['all', 'rulebook', 'expansion', 'faq', 'errata']).default('all'),
      }),
      execute: async ({ type }) => {
        const db = getDb(env.DB);
        const query = db
          .select()
          .from(resources)
          .where(eq(resources.gameId, gameId));

        if (type !== 'all') {
          query.where(eq(resources.resourceType, type));
        }

        const resourceList = await query.all();

        return resourceList.map(r => ({
          id: r.id,
          name: r.name,
          type: r.resourceType,
          description: r.description,
          edition: r.edition,
          isOfficial: r.isOfficial,
          pageCount: r.pageCount,
          imageCount: r.imageCount,
        }));
      },
    }),
  };
}
```

### 3.3 Enhanced System Prompt

```typescript
function buildEnhancedPrompt(game: GameSummary): string {
  return `You are an expert assistant for the board game **${game.name}**.

Your goal is to provide ACCURATE, CLEAR, and HELPFUL answers to rules questions.

## Search Strategy

When answering questions:

1. **Always search first** - Use searchKnowledge() before answering gameplay questions
2. **Be specific** - Include player count, expansions, or editions if relevant to the query
3. **Include images** - Visual learners benefit from diagrams
4. **Cross-reference** - If rules seem ambiguous, search multiple phrasings

## Answer Quality

Your answers must:

✅ **Cite sources** - Always include page numbers and sections
✅ **Show images** - Include relevant diagrams with descriptions
✅ **Note ambiguities** - If rules are unclear or contradictory, say so
✅ **Be player-count aware** - Rules often change with player count
✅ **Quote directly** - For complex rules, include exact wording
✅ **Match thoroughness to question type**:
   - **Pointed questions** (e.g., "How much does X cost?", "Can I do Y?") → Give quick, direct answers (1-2 sentences)
   - **Complex questions** (e.g., "How do I set up for 3 players?", "How does X mechanic work?") → Give thorough, step-by-step explanations with context and examples

## Response Structure

{
  "answer": "Markdown response with inline image references",
  "citations": [
    {
      "resourceName": "Core Rulebook",
      "pageNumber": 12,
      "section": "Setup > Player Setup",
      "relevance": "primary",
      "quote": "Place 5 territory cards..."
    }
  ],
  "images": [
    {
      "attachmentId": "xyz123",
      "url": "...",
      "description": "Setup diagram for 5 players",
      "relevance": "essential",
      "placement": "inline"
    }
  ],
  "confidence": "high",
  "ambiguities": ["Rule X contradicts FAQ Y"],
  "followUps": [
    { "question": "How does this change with 3 players?", "category": "related" }
  ]
}

## Question Types

1. **Pointed Questions**: Simple yes/no or single-fact queries (e.g., "Can I move diagonally?", "How much does this cost?")
   - → Give **concise, direct answers** (1-2 sentences)
   - → Cite the rule, state the answer clearly

2. **Complex Questions**: Multi-step processes or mechanics (e.g., "How do I set up for 3 players?", "How does combat work?")
   - → Give **thorough, step-by-step explanations** with context
   - → Include diagrams, examples, and edge cases

3. **Gameplay**: Rules, setup, mechanics → Search extensively, cite precisely
4. **Clarification**: Ambiguous rules → Note conflicts, cite all sources
5. **Setup**: Initial game state → Include diagrams, be player-count specific
6. **Components**: What's included → List from resources, include photos
7. **Strategy**: How to play well → Decline politely (not your role)

## Special Cases

- **Expansions**: Check if base game or expansion-specific
- **Editions**: Note if rules differ across editions
- **Errata**: Prioritize official errata over base rulebook
- **FAQs**: Designer clarifications override rulebook ambiguities

## Confidence Levels

- **High**: Found explicit rule in official source
- **Medium**: Inferred from related rules or examples
- **Low**: Contradictory sources or missing information

${game.bggUrl ? `BoardGameGeek page: ${game.bggUrl}` : ''}

Remember: Players trust your answers. Accuracy > Speed. Cite everything.`;
}
```

### 3.4 Answer Validation

**Validate that the answer actually matches the sources**:

```typescript
async function validateAnswer(
  question: string,
  answer: string,
  citations: Citation[],
  openaiApiKey: string
): Promise<{
  isValid: boolean;
  issues: string[];
  confidence: number;
}> {
  const citationTexts = citations.map(c => c.quote || '').join('\n\n');

  const prompt = `You are a fact-checker. Validate if this answer is supported by the cited sources.

Question: ${question}

Answer: ${answer}

Citations:
${citationTexts}

Check:
1. Does the answer address the question?
2. Is the answer supported by the citations?
3. Are there unsupported claims?
4. Is anything contradictory?

Return JSON: { isValid: boolean, issues: string[], confidence: 0-1 }`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

---

## Phase 4: UI/UX Enhancements {#phase-4-ui}

### 4.1 Rich Citation Display

**Update SystemMessage component to show rich citations**:

```tsx
const SystemMessage = ({ message, onResourceClick, onImageClick }) => {
  const parsed = message.content; // Already parsed by AI SDK
  const { answer, citations, images, confidence, ambiguities, followUps } = parsed;

  return (
    <div className="flex flex-col gap-4">
      {/* Confidence indicator */}
      {confidence === 'low' && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3">
          ⚠️ Low confidence answer - rules may be ambiguous
        </div>
      )}

      {/* Main answer with inline images */}
      <div className="prose prose-invert">
        <Markdown
          components={{
            img: ({ src, alt }) => {
              const img = images.find(i => i.url === src);
              if (img?.placement === 'inline') {
                return (
                  <figure>
                    <img
                      src={src}
                      alt={alt}
                      className="cursor-pointer rounded border"
                      onClick={() => onImageClick(img)}
                    />
                    <figcaption className="text-sm text-muted-foreground">
                      {img.description}
                    </figcaption>
                  </figure>
                );
              }
              return <img src={src} alt={alt} />;
            }
          }}
        >
          {answer}
        </Markdown>
      </div>

      {/* Ambiguities */}
      {ambiguities && ambiguities.length > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded p-3">
          <h4 className="font-bold text-sm mb-2">⚠️ Potential Ambiguities</h4>
          <ul className="text-sm space-y-1">
            {ambiguities.map((amb, idx) => (
              <li key={idx}>{amb}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Citations with page links */}
      {citations && citations.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground mb-2">
            Sources
          </h4>
          <div className="space-y-2">
            {citations.map((citation, idx) => (
              <div
                key={idx}
                className={`text-sm p-2 rounded border ${
                  citation.relevance === 'primary' ? 'border-primary/40 bg-primary/5' : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <button
                      onClick={() => onResourceClick(citation.resourceId)}
                      className="font-medium hover:underline"
                    >
                      {citation.resourceName}
                    </button>
                    {citation.pageNumber && (
                      <span className="text-muted-foreground ml-2">
                        Page {citation.pageNumber}
                      </span>
                    )}
                    {citation.section && (
                      <span className="text-muted-foreground ml-1">
                        • {citation.section}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    citation.relevance === 'primary'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {citation.relevance}
                  </span>
                </div>
                {citation.quote && (
                  <blockquote className="text-xs text-muted-foreground italic mt-1 pl-3 border-l-2">
                    "{citation.quote}"
                  </blockquote>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image gallery (end-placed images) */}
      {images && images.filter(i => i.placement === 'end').length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground mb-2">
            Related Images
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {images.filter(i => i.placement === 'end').map((img, idx) => (
              <div
                key={idx}
                className="cursor-pointer hover:opacity-80 transition"
                onClick={() => onImageClick(img)}
              >
                <img src={img.url} alt={img.description} className="rounded border" />
                <p className="text-xs text-muted-foreground mt-1">{img.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categorized follow-ups */}
      {followUps && followUps.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-xs font-bold uppercase tracking-tight text-muted-foreground mb-2">
            Continue Learning
          </h4>
          {['related', 'deeper', 'clarifying'].map(category => {
            const categoryQuestions = followUps.filter(f => f.category === category);
            if (categoryQuestions.length === 0) return null;

            return (
              <div key={category} className="mb-3">
                <h5 className="text-xs font-semibold text-muted-foreground mb-1 capitalize">
                  {category}
                </h5>
                <div className="flex flex-col gap-1">
                  {categoryQuestions.map((followUp, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => onFollowUp(followUp.question)}
                    >
                      {followUp.question}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
```

### 4.2 Image Lightbox

```tsx
const ImageLightbox = ({ image, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="flex justify-between items-start mb-4">
          <div className="text-white">
            <h3 className="font-bold">{image.description}</h3>
            {image.pageNumber && (
              <p className="text-sm text-gray-400">Page {image.pageNumber}</p>
            )}
          </div>
          <button onClick={onClose} className="text-white text-2xl">×</button>
        </div>
        <img
          src={image.url}
          alt={image.description}
          className="w-full h-auto rounded"
        />
        {image.ocrText && (
          <div className="mt-4 bg-gray-800 p-4 rounded">
            <h4 className="text-white font-bold mb-2">Extracted Text</h4>
            <pre className="text-gray-300 text-sm whitespace-pre-wrap">
              {image.ocrText}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
```

### 4.3 Feedback System

**Add feedback UI to Chat component**:

```tsx
const SystemMessage = ({ message, ... }) => {
  const [feedback, setFeedback] = useState<boolean | null>(null);

  const handleFeedback = async (wasHelpful: boolean) => {
    setFeedback(wasHelpful);

    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: message.id,
        wasHelpful,
        feedbackType: 'thumbs',
      }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ... existing content ... */}

      {/* Feedback buttons */}
      <div className="flex items-center gap-2 text-sm border-t pt-3">
        <span className="text-muted-foreground">Was this helpful?</span>
        <Button
          variant={feedback === true ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleFeedback(true)}
          disabled={feedback !== null}
        >
          👍 Yes
        </Button>
        <Button
          variant={feedback === false ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleFeedback(false)}
          disabled={feedback !== null}
        >
          👎 No
        </Button>
      </div>
    </div>
  );
};
```

**Feedback API endpoint**:

```typescript
// src/routes/api/feedback.ts

app.post('/api/feedback', async (c) => {
  const body = await c.req.json();
  const { messageId, wasHelpful, feedbackType, comment } = body;

  const db = getDb(c.env.DB);

  await db.insert(userFeedback).values({
    id: nanoid(),
    messageId,
    gameId: body.gameId, // Include from session
    userId: c.get('user')?.id,
    sessionId: body.sessionId,
    query: body.query,
    wasHelpful,
    feedbackType,
    comment,
    confidence: body.confidence,
    citationCount: body.citationCount,
    imageCount: body.imageCount,
    timeToFeedbackMs: Date.now() - body.messageTimestamp,
    createdAt: new Date(),
  });

  return c.json({ success: true });
});
```

---

## Phase 5: Quality & Reliability {#phase-5-quality}

### 5.1 Conversation Memory

**Track context across turns**:

```typescript
interface ConversationContext {
  gameId: string;
  userId?: string;
  sessionId: string;
  history: Array<{
    question: string;
    answer: string;
    citations: Citation[];
    timestamp: number;
  }>;
  topics: Set<string>;      // Topics discussed
  playerCount?: number;     // Last mentioned player count
  expansion?: string;       // Last mentioned expansion
  ambiguities: string[];    // Unresolved ambiguities
}

function buildContextualPrompt(
  context: ConversationContext,
  currentQuestion: string
): string {
  const recentTopics = Array.from(context.topics).slice(-3).join(', ');

  let contextPrompt = '';

  if (recentTopics) {
    contextPrompt += `\nRecent conversation topics: ${recentTopics}`;
  }

  if (context.playerCount) {
    contextPrompt += `\nAssumed player count: ${context.playerCount}`;
  }

  if (context.expansion) {
    contextPrompt += `\nCurrent expansion context: ${context.expansion}`;
  }

  if (context.ambiguities.length > 0) {
    contextPrompt += `\nUnresolved ambiguities from earlier: ${context.ambiguities.join('; ')}`;
  }

  return contextPrompt;
}
```

### 5.2 Feedback-Based Learning

**Use feedback to adjust rankings**:

```typescript
async function applyFeedbackBoost(
  results: SearchResult[],
  query: string,
  db: D1Database
): Promise<SearchResult[]> {
  // Get fragments that were helpful for similar queries
  const similarQueries = await db
    .select({
      fragmentId: userFeedback.fragmentId,
      helpfulness: sql<number>`AVG(CAST(was_helpful AS FLOAT))`,
    })
    .from(userFeedback)
    .where(sql`query LIKE '%' || ${query} || '%'`)
    .groupBy(userFeedback.fragmentId)
    .all();

  const boostMap = new Map(
    similarQueries.map(s => [s.fragmentId, s.helpfulness])
  );

  return results.map(result => ({
    ...result,
    score: result.score * (1 + (boostMap.get(result.fragmentId) || 0)),
  }));
}
```

### 5.3 Error Handling & Resilience

**Graceful degradation**:

```typescript
// Already implemented in search.ts with Promise.allSettled
// Ensure all tool calls handle errors gracefully

async function safeToolExecution<T>(
  toolName: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[${toolName}] Error:`, error);
    // Log to metrics if available
    return fallback;
  }
}
```

---

## Phase 6: Observability & Metrics (FUTURE) {#phase-6-observability}

> **Note**: This phase will NOT be implemented initially. This section documents the planned observability system for future reference.

### 6.1 Structured Logging Architecture

**Use Cloudflare Analytics Engine for high-performance structured logging with D1 for aggregated metrics.**

#### Log Schema Definitions

See `src/lib/observability/schemas.ts` for complete definitions:

- **SearchLog**: Query classification, search execution timing, result quality
- **AnswerLog**: Tool usage, generation timing, answer quality metrics
- **FeedbackLog**: User feedback with context
- **ResourceProcessingLog**: Processing stage tracking
- **ErrorLog**: Error tracking with context

#### Analytics Engine Integration

```typescript
export class MetricsCollector {
  constructor(
    private analytics: AnalyticsEngineDataset,
    private db: D1Database
  ) {}

  async logSearch(log: SearchLog): Promise<void>
  async logAnswer(log: AnswerLog): Promise<void>
  async logFeedback(log: FeedbackLog): Promise<void>
  async logResourceProcessing(log: ResourceProcessingLog): Promise<void>
  async logError(log: ErrorLog): Promise<void>
}
```

### 6.2 Metrics Tables (D1)

```sql
CREATE TABLE metrics_daily (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL, -- YYYY-MM-DD
  game_id TEXT,

  -- Search metrics
  total_searches INTEGER DEFAULT 0,
  avg_search_latency_ms REAL,
  p95_search_latency_ms REAL,
  avg_result_count REAL,
  avg_top_score REAL,

  -- Answer metrics
  total_answers INTEGER DEFAULT 0,
  avg_answer_latency_ms REAL,
  avg_tokens_per_answer REAL,
  avg_citations_per_answer REAL,

  -- Confidence distribution
  high_confidence_count INTEGER DEFAULT 0,
  medium_confidence_count INTEGER DEFAULT 0,
  low_confidence_count INTEGER DEFAULT 0,

  -- Feedback metrics
  total_feedback INTEGER DEFAULT 0,
  positive_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  satisfaction_rate REAL,

  -- User engagement
  unique_sessions INTEGER DEFAULT 0,
  avg_questions_per_session REAL,
  follow_up_rate REAL,

  -- Error rate
  error_count INTEGER DEFAULT 0,
  error_rate REAL,

  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE user_feedback (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT NOT NULL,

  query TEXT NOT NULL,
  was_helpful INTEGER NOT NULL, -- Boolean
  feedback_type TEXT NOT NULL, -- 'thumbs' | 'comment' | 'report'
  comment TEXT,

  -- Context
  confidence TEXT,
  citation_count INTEGER,
  image_count INTEGER,
  time_to_feedback_ms INTEGER,

  created_at INTEGER
);
```

### 6.3 Instrumentation Points

**Update search and chat handlers to log metrics**:

- Search: latency breakdown, result counts, quality scores
- Answer: tool calls, token usage, confidence, citations
- Feedback: user satisfaction, time to feedback

### 6.4 Metrics Dashboard API

```typescript
app.get('/api/metrics/dashboard', async (c) => {
  // Aggregate metrics for time period
});

app.get('/api/metrics/realtime', async (c) => {
  // Last 24h real-time metrics
});
```

### 6.5 Scheduled Aggregation

```typescript
// src/workers/aggregate-metrics.ts
// Runs daily at 1 AM to aggregate Analytics Engine data into D1
```

### 6.6 Alert Thresholds

- Search latency p95 > 5s
- Answer latency p95 > 8s
- Satisfaction rate < 70%
- Error rate > 5%
- Low confidence rate > 30%

---

## Implementation Timeline {#implementation-timeline}

### **Week 1-2: Foundation**
- [ ] Update database schema (fragments, resources, attachments)
- [ ] Implement contextual embedding generation
- [ ] Add HyDE question generation
- [ ] Implement image quality analysis
- [ ] Update fragment generation (text + image fragments)
- [ ] Migration scripts
- [ ] Test on sample rulebook

### **Week 3-4: Search**
- [ ] Implement query classification
- [ ] Multi-index hybrid search (4 parallel searches)
- [ ] Cross-encoder reranking
- [ ] Result diversification
- [ ] Synthetic question search
- [ ] Update search result interface
- [ ] Performance testing

### **Week 5-6: Response Generation**
- [ ] Define Zod schemas for structured outputs
- [ ] Migrate to `streamObject` (AI SDK)
- [ ] Implement enhanced tools (searchKnowledge, getImageDetails, compareRules)
- [ ] New system prompt
- [ ] Answer validation function
- [ ] Test answer quality

### **Week 7-8: UI/UX**
- [ ] Rich citation display component
- [ ] Image lightbox component
- [ ] Confidence indicators
- [ ] Categorized follow-ups
- [ ] Quote display in citations
- [ ] Feedback UI (thumbs up/down)
- [ ] Feedback API endpoint
- [ ] Mobile responsive improvements

### **Week 9-10: Quality**
- [ ] Conversation context tracking
- [ ] Feedback-based ranking adjustments
- [ ] Error handling improvements
- [ ] Answer validation integration
- [ ] Performance monitoring setup
- [ ] Load testing

### **Week 11-12: Polish**
- [ ] Caching layer (query results, embeddings)
- [ ] Performance optimizations
- [ ] Documentation
- [ ] User guide
- [ ] Admin documentation
- [ ] Launch preparation

### **Future: Observability (Not in Initial Plan)**
- [ ] Analytics Engine integration
- [ ] Metrics collector implementation
- [ ] Daily aggregation worker
- [ ] Metrics dashboard
- [ ] Alert system

---

## Success Metrics {#success-metrics}

### **1. Search Quality**
- **MRR (Mean Reciprocal Rank)**: Target >0.85
  - Calculated from user feedback on which result they clicked
- **NDCG@10**: Target >0.90
  - Normalized discounted cumulative gain
- **User satisfaction**: Target >4.5/5 (90%+)
  - From explicit feedback
- **Diversity score**: Target >0.6
  - How diverse are returned results

### **2. Answer Quality**
- **Citation accuracy**: Target 95%+
  - Manual review + user reports
- **Response time**: Target <3s p95
  - End-to-end from query to complete response
- **Confidence calibration**: High confidence = High accuracy
  - Cross-reference confidence with feedback
- **Tool call efficiency**: Average 2-4 tools per query
  - Are we calling too many/few tools?

### **3. User Engagement**
- **Questions per session**: Target 5+
  - Track sessionId across queries
- **Follow-up rate**: Target 40%+
  - % of users who click follow-up questions
- **Feedback submission**: Target 20%+
  - % of answers that get feedback
- **Time to feedback**: Median <30s
  - How quickly do users provide feedback

### **4. System Performance** (Future Monitoring)
- **Search latency breakdown**:
  - Embedding generation: <200ms p95
  - Vector search: <100ms p95
  - FTS search: <50ms p95
  - Fusion: <10ms p95
  - Reranking: <500ms p95
- **Answer generation latency**: <2s p95
- **Error rate**: <1%
- **Cache hit rate**: Target >60%

### **5. Cost Tracking** (Future)
- **Cost per query**:
  - Embeddings: ~$0.00001
  - LLM generation: ~$0.005
  - Total: ~$0.00501
- **Monthly cost projections**
- **Cost per game** (some games more expensive than others)

---

## Cost Estimates {#cost-estimates}

### **Processing Costs (Per 100-page Rulebook)**

| Component | Unit Cost | Quantity | Total |
|-----------|-----------|----------|-------|
| Mistral OCR | $0.001/page | 100 pages | $0.10 |
| Image analysis (GPT-4o) | ~$0.05/image | 50 images | $2.50 |
| Question generation (GPT-4o-mini) | ~$0.0025/fragment | 200 fragments × 5 questions | $0.50 |
| Embeddings (text-embedding-3-small) | $0.00002/1k tokens | ~1M tokens | $0.02 |

**Total per rulebook: ~$3.12**

### **Query Costs (Per 1000 Queries)**

| Component | Unit Cost | Quantity | Total |
|-----------|-----------|----------|-------|
| Query embedding | $0.00002/1k tokens | ~50k tokens | $0.01 |
| Cross-encoder reranking (GPT-4o-mini) | ~$0.001/query | 1000 queries | $1.00 |
| Answer generation (GPT-4o) | ~$0.005/query | 1000 queries | $5.00 |

**Total per 1000 queries: ~$6.01**

### **Monthly Cost Projections**

Assumptions:
- 10 rulebooks processed/month
- 10,000 queries/month

| Component | Monthly Cost |
|-----------|--------------|
| Processing | $31.20 |
| Queries | $60.10 |
| **Total** | **~$91.30/month** |

### **Cost Optimization Strategies**

1. **Cache embeddings**: Don't re-embed same query
2. **Batch processing**: Process multiple images/questions in parallel
3. **Smart reranking**: Only rerank if top scores are close
4. **Question generation**: Maybe only top 50% of fragments
5. **Image filtering**: Skip decorative images entirely

---

## Appendix

### A. Key Files

**Database Schema**:
- `src/lib/db/schema/d1.ts` - Table definitions

**Search System**:
- `src/lib/ai/search.ts` - Hybrid search implementation
- `src/lib/ai/embeddings.ts` - Embedding generation
- `src/lib/ai/vectorize.ts` - Vectorize interface

**Processing Pipeline**:
- `src/lib/processing/pdf-processor.ts` - Complete PDF pipeline
- `src/lib/services/chunking.ts` - Smart text chunking
- `src/lib/pdf.ts` - Mistral OCR extraction

**Chat System**:
- `src/routes/api/chat-handler.ts` - Streaming response handler
- `src/lib/ai/prompt.ts` - LLM system prompt & tools
- `app/components/Chat.tsx` - React chat component

### B. External Dependencies

**APIs**:
- OpenAI (GPT-4o, GPT-4o-mini, text-embedding-3-small)
- Mistral (OCR API)

**Cloudflare Services**:
- Workers (compute)
- D1 (database)
- Vectorize (vector search)
- R2 (file storage)
- KV (caching, rate limiting)
- Queues (async processing)
- Analytics Engine (metrics - future)

**NPM Packages**:
- `ai` - AI SDK for streaming
- `@ai-sdk/openai` - OpenAI provider
- `drizzle-orm` - Database ORM
- `zod` - Schema validation
- `nanoid` - ID generation

### C. Future Enhancements

**Beyond Initial Plan**:
1. **Multi-language support**: Translate rulebooks
2. **Voice input**: Ask questions via voice
3. **Game comparison**: Compare similar games
4. **House rules**: Track custom modifications
5. **Community contributions**: User-submitted clarifications
6. **Video integration**: Link to video tutorials
7. **Component recognition**: Upload photo, identify piece
8. **Play-along mode**: Interactive rules during gameplay

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-25 | Initial comprehensive plan |

---

**Status**: Ready for implementation
**Next Steps**: Begin Phase 1 - Foundation
