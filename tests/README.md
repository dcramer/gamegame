# Tests

## Unit Tests (Pure Functions)

These tests cover pure logic functions without LLM calls or heavy mocking.

### Files
- **imageFormat.test.ts** - Image format detection from buffer magic bytes
- **bgg.test.ts** - BGG URL parsing
- **pdf.test.ts** - PDF markdown processing (image reference replacement, heading parsing)

### Running Tests

```bash
# Run all unit tests
pnpm test:unit

# Run specific test file
pnpm vitest run tests/imageFormat.test.ts

# Watch mode
pnpm vitest watch tests/
```

## What We Test

### ✅ Zero/Low Mock Tests
These tests have **no mocks** and test real logic:

1. **detectImageFormat** - Buffer magic byte detection
   - JPEG, PNG, GIF, WebP format detection
   - Edge cases: empty buffers, truncated data
   - Bug fix verification: buffer bounds checking

2. **extractBGGId** - URL parsing
   - Standard BGG URLs
   - Edge cases: missing IDs, invalid URLs
   - Various URL formats (with/without slugs, query params)

3. **replaceImageReferences** - Complex image matching logic
   - Duplicate filename handling
   - Image reference replacement
   - Edge cases: missing images, external URLs
   - Bug fix verification: duplicate filename collision

4. **parseMarkdownHeadings** - Heading hierarchy
   - Single/nested headings
   - Hierarchy building
   - Edge cases: no headings, special characters

### Why These Tests Are Valuable

- **Fast** - No external dependencies, run in milliseconds
- **Deterministic** - Same input = same output
- **No Mocks** - Test real implementations
- **Bug Prevention** - Test edge cases where bugs actually hide
- **Easy to Maintain** - Simple assertions, clear test cases

## What We DON'T Test

- ❌ LLM calls (OpenAI embeddings, Mistral OCR, markdown cleanup)
- ❌ External APIs (BGG API calls)
- ❌ Database operations (tested separately if needed)
- ❌ RAG search quality

These are either non-deterministic or would require complex mocking.

## Test Philosophy

**"Test the logic, not the glue"**

We focus on:
- Pure functions with complex logic
- Edge cases and boundary conditions
- Areas where bugs were previously found
- Code that's easy to test correctly

We avoid:
- Heavy mocking (makes tests brittle)
- Testing framework internals
- Testing external services
- Non-deterministic behavior
