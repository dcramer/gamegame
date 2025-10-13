# lib/services

## Purpose

Reusable business logic services that encapsulate complex operations. Services are the "engine" of the application - they contain the core algorithms, integrations, and data processing logic.

## Constraints

### Separation of Concerns
- Services **MUST NOT** directly handle HTTP requests/responses
- Services **MUST NOT** perform authentication (that's for actions/routes)
- Services **MAY** throw errors - let callers handle them appropriately
- Services **SHOULD** be pure functions or stateless classes when possible

### Dependencies
- Services **CAN** call other services
- Services **CAN** access the database directly
- Services **CAN** call external APIs
- Services **SHOULD** receive dependencies as parameters (dependency injection preferred)

### Transactions
- When a service needs a transaction, accept it as an optional parameter
- Use the `DbTransaction` type from `resource-processor.ts`
- Allow services to work both inside and outside transactions

### Testing
- Services should be easily testable in isolation
- Avoid side effects where possible
- Make dependencies explicit (parameters over imports)

### Performance
- Consider performance implications (caching, batch operations, etc.)
- Document time complexity of expensive operations
- Use batching for operations that can be parallelized

## File Organization

### Current Files
- `bgg.ts` - BoardGameGeek API integration (search, fetch game details)
- `chunking.ts` - Smart PDF content chunking with metadata preservation
- `images.ts` - Image storage, format detection, and blob management
- `markdown-cleanup.ts` - LLM-based markdown cleanup and processing
- `resource-processor.ts` - Core resource processing logic (shared by create/reprocess)

### Suggested Organization (Future)
```
lib/services/
  integrations/
    bgg.ts
    mistral-ocr.ts
  storage/
    images.ts
    blobs.ts
  processing/
    chunking.ts
    embeddings.ts
    markdown-cleanup.ts
  domain/
    resource-processor.ts
```

## Example Pattern

```typescript
"use server"; // Mark if it uses server-only APIs

import { db } from "../db";
import type { DbTransaction } from "./resource-processor";

/**
 * Process a resource with optional transaction support
 * @param resourceId - The resource to process
 * @param tx - Optional transaction (uses db if not provided)
 * @returns Processing result
 */
export async function processResource(
  resourceId: string,
  tx?: DbTransaction
): Promise<ProcessingResult> {
  const dbClient = tx || db;

  // 1. Fetch data
  const resource = await dbClient
    .select()
    .from(resources)
    .where(eq(resources.id, resourceId))
    .limit(1);

  if (!resource) {
    throw new Error("Resource not found");
  }

  // 2. Process data
  const result = await expensiveOperation(resource);

  // 3. Update database
  await dbClient
    .update(resources)
    .set({ processedData: result })
    .where(eq(resources.id, resourceId));

  return result;
}
```

## Transaction Pattern

Services that need transactions should accept them as optional parameters:

```typescript
export async function createWithAttachments(
  data: CreateData,
  tx?: DbTransaction
): Promise<Result> {
  const dbClient = tx || db;

  // If no transaction provided, create one
  if (!tx) {
    return db.transaction(async (tx) => {
      return createWithAttachments(data, tx);
    });
  }

  // Otherwise, use the provided transaction
  const record = await tx.insert(table).values(data).returning();
  await processAttachments(record.id, data.attachments, tx);

  return record;
}
```

## Anti-Patterns to Avoid

❌ **Don't** handle HTTP concerns in services
```typescript
// BAD: HTTP response in service
export async function getResource(id: string): Promise<NextResponse> {
  return NextResponse.json({ id });
}
```

✅ **Do** return data, let callers handle responses
```typescript
// GOOD: Return data
export async function getResource(id: string): Promise<Resource> {
  return db.query.resources.findFirst({ where: eq(resources.id, id) });
}
```

❌ **Don't** do authentication in services
```typescript
// BAD: Auth in service
export async function deleteResource(id: string) {
  const session = await auth();
  if (!session?.user?.admin) throw new Error("Unauthorized");
  // ...
}
```

✅ **Do** let actions handle authentication
```typescript
// GOOD: Service is auth-agnostic
export async function deleteResource(id: string) {
  // Just do the work
  await db.delete(resources).where(eq(resources.id, id));
}
```

❌ **Don't** create implicit dependencies
```typescript
// BAD: Hidden global state
let currentUser: User;
export function setUser(user: User) { currentUser = user; }
export function getResource() {
  // Uses global currentUser
}
```

✅ **Do** make dependencies explicit
```typescript
// GOOD: Explicit parameters
export function getResource(userId: string) {
  // Uses passed parameter
}
```
