# Model Configuration

## Overview

The application uses environment-based model configuration to optimize for **cost in development** and **quality in production**.

## Configuration File

Located at: `src/lib/config/models.ts`

### Model Types

| Type | Purpose | Dev Model | Prod Model |
|------|---------|-----------|------------|
| `ocr` | PDF text extraction | Mistral | Mistral |
| `vision` | Image analysis | gpt-5-mini | gpt-5 |
| `reasoning` | Text cleanup/metadata | gpt-5-mini | gpt-5 |
| `hyde` | Question generation | gpt-5-mini | gpt-5 |
| `embedding` | Vector embeddings | text-embedding-3-small | text-embedding-3-small |

### Environment Detection

The system determines the environment from the `ENVIRONMENT` env variable:

```typescript
// In wrangler.toml or .dev.vars
ENVIRONMENT=production  // Uses GPT-5 for quality
ENVIRONMENT=development // Uses GPT-5-mini for cost savings
ENVIRONMENT=test        // Uses GPT-5-mini for fast tests
```

**Default**: If not set, defaults to `development`

## Usage in Services

### Basic Usage

```typescript
import { getModel } from '../config/models';

// Get model for a specific task
const model = getModel('hyde', env.ENVIRONMENT);

// Use in API call
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  body: JSON.stringify({
    model, // Will be 'gpt-5' in prod, 'gpt-5-mini' in dev
    // ...
  }),
});
```

### With AI SDK (for vision)

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { getModel } from '../config/models';

const openai = createOpenAI({ apiKey });
const visionModel = getModel('vision', environment);

const { text } = await generateText({
  model: openai(visionModel), // gpt-5 in prod, gpt-5-mini in dev
  // ...
});
```

### Cost Estimation

```typescript
import { getModelPricing } from '../config/models';

const model = getModel('hyde', environment);
const pricing = getModelPricing(model);

const cost = (tokens / 1_000_000) * pricing.inputCostPer1M;
```

## Updated Services

The following services now use environment-based configuration:

### HyDE Service (`src/lib/services/hyde.ts`)

```typescript
generateQuestionsForFragment(fragment, resource, apiKey, {
  environment: env.ENVIRONMENT, // Pass environment
});

// Automatically uses:
// - gpt-5 in production
// - gpt-5-mini in development/test
```

**Cost Impact**:
- Dev: ~$0.017 per 200 fragments
- Prod: ~$0.30 per 200 fragments (17x more expensive, much higher quality)

### Vision Service (`src/lib/services/vision.ts`)

```typescript
enrichPDFImagesWithVision(structured, apiKey, gameName, {
  environment: env.ENVIRONMENT,
});

// Automatically uses:
// - gpt-5 in production (best vision + reasoning)
// - gpt-5-mini in development (fast & cheap)
```

**Cost Impact**:
- Dev: ~$0.15 per 1000 images
- Prod: ~$7.50 per 1000 images (50x more expensive, superior quality)

## Testing

Tests use the **cheapest models** regardless of environment:

```typescript
// In tests, mocked responses are used, so model doesn't matter
mockFetch.mockResolvedValue({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: '...' } }],
  }),
});
```

Tests can explicitly override the model:

```typescript
generateQuestionsForFragment(fragment, resource, apiKey, {
  model: 'gpt-5-mini', // Explicit override
});
```

## Pricing Reference

### GPT-5 (Production)
- Input: $2.50 / 1M tokens
- Output: $10.00 / 1M tokens
- Images: $7.50 / 1M tokens

### GPT-5-mini (Development)
- Input: $0.15 / 1M tokens
- Output: $0.60 / 1M tokens
- Images: ~$0.15 / 1M tokens

### text-embedding-3-small
- Input: $0.02 / 1M tokens
- Output: $0.00 / 1M tokens

## Configuration in Production

### Wrangler (Cloudflare Workers)

```toml
# wrangler.toml
[vars]
ENVIRONMENT = "production"
```

Or via secrets:

```bash
pnpx wrangler secret put ENVIRONMENT
# Enter: production
```

### Development

```bash
# .dev.vars
ENVIRONMENT=development
```

## Adding New Model Types

To add a new model type:

1. Update `ModelConfig` interface:

```typescript
export interface ModelConfig {
  // ... existing
  newTask: string; // Add new type
}
```

2. Update dev and prod configs:

```typescript
const DEV_MODELS: ModelConfig = {
  // ... existing
  newTask: 'gpt-5-mini',
};

const PROD_MODELS: ModelConfig = {
  // ... existing
  newTask: 'gpt-5',
};
```

3. Use in your service:

```typescript
const model = getModel('newTask', env.ENVIRONMENT);
```

## Summary

- **Development/Test**: Optimized for cost and speed (GPT-5-mini)
- **Production**: Optimized for quality (GPT-5)
- **Automatic**: Services automatically use the right model based on `ENVIRONMENT`
- **Flexible**: Can override on a per-call basis if needed
- **Cost-transparent**: Pricing information available for estimation
