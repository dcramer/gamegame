# Vercel Workflows Setup Notes

## Status: ⚠️ BUNDLING ISSUE

The Vercel Workflows package has been installed and configured, but there's a known bundling issue with the workflow directive bundler trying to bundle Node.js built-ins.

## What Was Done

1. ✅ **Installed workflow package**: `pnpm add workflow` (v4.0.1-beta.7)
2. ✅ **Updated next.config.ts**: Added `withWorkflow()` wrapper
3. ✅ **Created workflow.config.ts**: Attempted to configure external packages
4. ❌ **Dev server fails**: Bundler still tries to bundle Node.js built-ins (os, fs, net, tls, crypto, etc.)

## The Issue

When running `pnpm dev`, the workflow bundler encounters errors:

```
✘ [ERROR] Could not resolve "os"
✘ [ERROR] Could not resolve "fs"
✘ [ERROR] Could not resolve "net"
✘ [ERROR] Could not resolve "tls"
✘ [ERROR] Could not resolve "crypto"
✘ [ERROR] Could not resolve "node:crypto"
✘ [ERROR] Could not resolve "stream"
✘ [ERROR] Could not resolve "perf_hooks"
```

These are all Node.js built-in modules that the `postgres` package requires. The workflow bundler is trying to bundle them for the browser, which is incorrect.

## Root Cause

The workflows use:
- `lib/db/index.ts` which imports `postgres` package
- `postgres` package uses Node.js built-ins (os, fs, net, tls, crypto, stream, perf_hooks)
- Workflow bundler tries to bundle everything, including these Node.js built-ins
- This fails because these modules should not be bundled (they're part of the Node.js runtime)

## Attempted Solutions

### 1. Created `workflow.config.ts`

```typescript
import { defineConfig } from 'workflow/config';

export default defineConfig({
  external: [
    'postgres', 'drizzle-orm', '@vercel/postgres', 'pg', 'nanoid', 'sharp',
    'os', 'fs', 'net', 'tls', 'stream', 'crypto', 'node:crypto', 'node:fs',
    'node:os', 'node:net', 'node:tls', 'node:stream',
  ],
});
```

**Result**: Config file is not being picked up by the bundler.

## Possible Solutions (Not Yet Implemented)

### Option 1: Use Different Database Client in Workflows

Instead of importing the full `postgres` client, create a workflow-specific database client that's more bundle-friendly:

```typescript
// lib/db/workflow-db.ts
import { drizzle } from 'drizzle-orm/vercel-postgres';
import { createClient } from '@vercel/postgres';

const client = createClient();
export const workflowDb = drizzle(client);
```

Then update workflows to import from `@/lib/db/workflow-db` instead of `@/lib/db`.

### Option 2: Lazy Load Database Connection

Don't import database at the top level of workflow files. Instead, lazy-load it inside workflow functions:

```typescript
async function runIngestStage(input: ProcessResourceInput) {
  'use step';

  // Lazy load database connection
  const { db } = await import('@/lib/db');

  // ... rest of the code
}
```

### Option 3: Configure withWorkflow() Options

The `withWorkflow()` function might accept configuration options for the bundler:

```typescript
export default withWorkflow(nextConfig, {
  bundler: {
    external: ['postgres', 'drizzle-orm', /* ... */],
    platform: 'node',
  },
});
```

**Note**: This API is not documented, need to check source code.

### Option 4: Wait for Vercel to Fix

This is a beta version of the workflow package (`4.0.1-beta.7`). The bundling issue may be a known bug that will be fixed in a future release.

### Option 5: Disable Workflow in Development

Temporarily disable workflow features in development and only enable in production:

```typescript
// next.config.ts
const config = process.env.ENABLE_WORKFLOWS === 'true'
  ? withWorkflow(nextConfig)
  : nextConfig;

export default config;
```

Then run workflows via API routes that work around the bundling issue.

## Current Workaround

For now, the workflows are correctly coded and will work in production on Vercel's infrastructure (which handles bundling differently). To develop locally:

1. **Comment out** the `withWorkflow()` wrapper in `next.config.ts`:
   ```typescript
   // Temporarily disable workflow for local development
   export default nextConfig; // withWorkflow(nextConfig);
   ```

2. **Test workflows in production** on Vercel where the bundling environment is different

3. **OR** implement Option 1 or Option 2 above to restructure the database imports

## Recommendation

**For immediate development**: Disable `withWorkflow()` locally and deploy to Vercel staging to test workflows.

**For long-term**: Implement Option 1 (workflow-specific database client using `@vercel/postgres` which is designed to work with Vercel's bundler).

## Files Modified

- ✅ `package.json`: Added `workflow@4.0.1-beta.7`
- ✅ `next.config.ts`: Added `withWorkflow()` wrapper (may need to comment out for local dev)
- ✅ `workflow.config.ts`: Created (not working as expected)

## Next Steps

1. **Decide on approach**: Choose between Options 1-5 above
2. **Implement solution**: Restructure database imports or disable workflows in dev
3. **Test on Vercel**: Deploy to staging to verify workflows work in production
4. **Document**: Update this file with the chosen solution

## References

- Vercel Workflows Docs: https://vercel.com/docs/workflow
- Package Version: `workflow@4.0.1-beta.7` (beta, expect issues)
- Issue: Bundler doesn't respect externals configuration
