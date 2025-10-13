# lib/actions

## Purpose

Server actions that serve as the API boundary between client components and backend logic. These are Next.js Server Actions marked with `"use server"` that can be called directly from React components.

## Constraints

### Authentication & Authorization
- **MUST** call `requireAdmin()` at the start of any admin-only action
- **MUST** validate all user input with Zod schemas before processing
- **NEVER** expose internal implementation details in error messages

### Data Flow
- Actions should be **thin orchestrators** - coordinate between services but don't contain complex business logic
- Complex logic belongs in `/lib/services/` or `/lib/domain/` (if created)
- Actions should return serializable data only (no class instances, functions, etc.)

### Error Handling
- Let errors bubble up - Next.js will serialize them appropriately
- Use descriptive error messages for user-facing errors
- Log sensitive errors server-side, return generic messages to client

### Performance
- Avoid N+1 queries - use joins or batch operations
- Consider caching for expensive operations
- Use database transactions for multi-step operations that must be atomic

### File Organization
- `auth.ts` - Authentication actions
- `games.ts` - Game CRUD operations
- `resources.ts` - Resource (PDF rulebook) CRUD operations
- `bgg.ts` - BoardGameGeek integration actions
- `blobs.ts` - Blob storage operations
- `attachments.ts` - Attachment operations
- `forms.ts` - Form-related actions

## Example Pattern

```typescript
"use server";

import { requireAdmin } from "../auth/require-admin";
import { someService } from "../services/some-service";
import { db } from "../db";
import { someSchema } from "../db/schema";

export async function createSomething(input: {
  name: string;
  data: unknown;
}) {
  // 1. Authenticate
  await requireAdmin();

  // 2. Validate input
  const validated = someSchema.parse(input);

  // 3. Orchestrate business logic (call services, not inline logic)
  const result = await someService.process(validated);

  // 4. Return serializable data
  return {
    id: result.id,
    name: result.name,
    createdAt: result.createdAt,
  };
}
```

## Anti-Patterns to Avoid

❌ **Don't** include complex business logic in actions
```typescript
// BAD: Complex logic inline
export async function processResource(id: string) {
  await requireAdmin();

  const data = await fetch(url);
  const parsed = await parsePDF(data);
  const chunks = await chunkText(parsed);
  const embeddings = await generateEmbeddings(chunks);
  // ... 100 more lines
}
```

✅ **Do** delegate to services
```typescript
// GOOD: Thin orchestration
export async function processResource(id: string) {
  await requireAdmin();
  return await resourceService.process(id);
}
```

❌ **Don't** duplicate auth checks
```typescript
// BAD: Inline auth check
const session = await auth();
if (!session?.user?.admin) {
  throw new Error("Unauthorized");
}
```

✅ **Do** use the helper
```typescript
// GOOD: Use helper
await requireAdmin();
```
