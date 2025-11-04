# Chunk Enrichment Implementation Plan

**Goal**: Improve RAG retrieval accuracy through three incremental enrichment strategies
**Approach**: Incremental rollout with testing between each phase
**Testing**: PERFORMANCE.md test suite before/after each phase
**Migration**: Re-embed all resources after each phase

---

## Phase 1: Answer Type Classification

**Objective**: Tag each chunk with question types it can answer (e.g., `player_count`, `setup_instructions`, `win_conditions`)

### 1.1 Database Schema
- Add `answer_types` TEXT column to `fragments` table (JSON array)
- Create migration to add column
- Update TypeScript schema in `d1.ts`

### 1.2 Create Classification Service
- New file: `src/lib/services/answer-type-classification.ts`
- Function: `classifyFragmentAnswerTypes(chunk, resource, apiKey)`
- LLM prompt to classify chunks into 15-20 category types:
  - Metadata: `player_count`, `play_time`, `age_rating`, `game_overview`
  - Rules: `setup_instructions`, `turn_structure`, `win_conditions`, `end_game`
  - Components: `component_list`, `card_types`, `resource_types`, `board_layout`
  - Gameplay: `action_options`, `combat_rules`, `movement_rules`, `scoring`
  - Clarifications: `edge_case`, `example`, `faq`, `timing`
- Return array of applicable types (1-4 per chunk typically)
- Use structured JSON output with gpt-5-mini for speed/cost

### 1.3 Integration
- Modify EMBED stage in `pdf-processor.ts` (around line 880)
- Call classification service in parallel with HyDE generation
- Store results in `fragments.answer_types` field
- Add to Vectorize metadata (within 10KB limit)

### 1.4 Search Algorithm Updates
- Modify `search.ts` to detect query type from user question
- New function: `detectQueryType(query)` - simple LLM call or regex patterns
- Boost RRF scores for matching answer types (multiply by 1.3x)

### 1.5 Testing & Deployment
- Run PERFORMANCE.md baseline tests (record results)
- Deploy classification
- Re-embed all resources (increment version to 5)
- Run PERFORMANCE.md tests again, compare accuracy
- Estimated cost: ~$2-5 per resource (one classification call per chunk)

---

## Phase 2: Improved HyDE Diversity

**Objective**: Generate more varied synthetic questions with different phrasings and difficulty levels

### 2.1 Update HyDE Service
- Modify `src/lib/services/hyde.ts`
- Update prompt to generate 5 questions with explicit variety requirements:
  - 2 simple/direct questions ("How many players?")
  - 2 complex/scenario questions ("What happens when I run out of resources during combat?")
  - 1 alternative phrasing of key concept ("How does turn order work?" vs "Who goes first?")
- Add question type labels to guide generation

### 2.2 Storage Updates
- Change `synthetic_questions` from simple string array to structured format:
  ```typescript
  {
    question: string;
    type: 'simple' | 'complex' | 'alternative';
    difficulty: 'beginner' | 'intermediate' | 'advanced';
  }[]
  ```
- Update fragment schema and migration

### 2.3 Embedding Strategy
- Keep embedding all questions (no change to vector creation)
- Optionally weight question types differently in RRF (complex questions = 0.8, simple = 0.7)

### 2.4 Testing & Deployment
- Run PERFORMANCE.md baseline tests
- Deploy new HyDE generation
- Re-embed all resources (increment version to 6)
- Run PERFORMANCE.md tests, compare accuracy
- Estimated cost: ~$1-3 per resource (same # of calls, slightly longer prompts)

---

## Phase 3: Game-Specific Term Extraction

**Objective**: Extract components, mechanics, and game-specific terminology from each chunk

### 3.1 Create Entity Extraction Service
- New file: `src/lib/services/game-entities.ts`
- Function: `extractGameEntities(chunk, gameName, resource, apiKey)`
- LLM call to extract:
  - **Components**: physical pieces mentioned (e.g., "player boards", "resource tokens", "action cards")
  - **Mechanics**: game systems (e.g., "worker placement", "deck building", "area control")
  - **Game-specific terms**: unique vocabulary (e.g., "Docks" in Speakeasy, "Arcs" in Arcs)
  - **Actions**: verbs players take (e.g., "draw", "discard", "activate", "claim")
- Return structured format with normalized terms

### 3.2 Database Schema
- Add `game_entities` TEXT column to `fragments` (JSON object)
- Structure:
  ```typescript
  {
    components: string[];
    mechanics: string[];
    terms: string[];
    actions: string[];
  }
  ```
- Create migration, update TypeScript schema

### 3.3 Integration
- Add to EMBED stage alongside classification and HyDE
- Store in `fragments.game_entities` column
- Add top 5-10 most important entities to Vectorize metadata

### 3.4 Search Enhancement
- Build game-specific term dictionary from all fragments per game
- When processing query, detect exact term matches
- Boost RRF scores for fragments containing exact matches (multiply by 1.5x)
- Helpful for queries like "how do Docks work" to strongly prefer fragments with "Dock" term

### 3.5 Searchable Content Enhancement (Optional)
- Add extracted entities to searchable content template:
  ```
  --- GAME CONCEPTS ---
  Components: player boards, resource tokens
  Mechanics: worker placement, resource management
  Game Terms: Docks, Smuggling
  ```
- This gets embedded, improving semantic similarity

### 3.6 Testing & Deployment
- Run PERFORMANCE.md baseline tests
- Deploy entity extraction
- Re-embed all resources (increment version to 7)
- Run PERFORMANCE.md tests, compare accuracy
- Estimated cost: ~$2-5 per resource (one extraction call per chunk)

---

## Cross-Phase Infrastructure

### Version Management
- Update `CURRENT_INDEX_VERSION` in `embeddings.ts` after each phase:
  - Phase 1: version 5
  - Phase 2: version 6
  - Phase 3: version 7
- Version bump triggers re-embedding

### Re-Embedding Process
- Option A: Admin UI bulk re-embed button
  - Lists all resources with `version < CURRENT_INDEX_VERSION`
  - "Re-embed All" button queues EMBED tasks
  - Progress tracking

- Option B: CLI command
  - `pnpm cli reindex --all`
  - `pnpm cli reindex --game=<gameId>`
  - Skips INGEST/VISION/CLEANUP by reusing stored `structured.json`

- Implement before Phase 1

### Testing Framework
- Create test runner script: `scripts/run-performance-tests.sh`
- Captures baseline metrics before each phase
- Runs after re-embedding
- Outputs comparison report (accuracy %, latency, cost)

### Cost Estimates (Per Resource)
Assuming average resource has ~50 chunks:

**Phase 1 (Answer Type Classification)**
- 50 chunks × $0.0001/chunk (gpt-5-mini) = ~$0.005
- Plus embedding cost (unchanged)
- **Total: ~$2-5 per resource**

**Phase 2 (Improved HyDE)**
- Same # of calls, ~20% longer prompts
- **Total: ~$1-3 per resource**

**Phase 3 (Entity Extraction)**
- 50 chunks × $0.0001/chunk = ~$0.005
- **Total: ~$2-5 per resource**

**Total for all 3 phases: ~$5-13 per resource**

For 10 resources: ~$50-130 total

### Rollback Strategy
- Keep old embeddings in Vectorize (don't delete)
- If accuracy degrades, rollback by:
  1. Revert `CURRENT_INDEX_VERSION`
  2. Delete new fragments/vectors
  3. Restore from backup or re-embed with old logic

---

## Success Metrics

**Primary**: PERFORMANCE.md test accuracy improvement
- Target: 15-25% improvement in retrieval accuracy
- Track per-question type (simple vs complex)

**Secondary**:
- Query latency (should not increase significantly)
- LLM cost per query (should remain stable)
- Re-embedding duration (aim for <5 min per resource)

**Monitoring**:
- Add answer type distribution logging
- Track which enrichments contribute to final results
- Identify gaps (questions that still fail)

---

## Timeline Estimate

**Phase 1**: 1-2 days implementation + 1 day testing + re-embedding
**Phase 2**: 1 day implementation + 1 day testing + re-embedding
**Phase 3**: 1-2 days implementation + 1 day testing + re-embedding

**Total**: ~5-8 days for all three phases
