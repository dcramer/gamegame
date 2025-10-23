import { env } from 'cloudflare:test';
import { getDb, games, resources, attachments } from '@/lib/db';

/**
 * Get test database instance
 *
 * Database schema is set up automatically by ./apply-migrations.ts which runs
 * before all tests. This applies Drizzle migrations from the drizzle/ directory.
 */
export async function setupTestDb() {
  // Migrations are already applied by ./apply-migrations.ts setup file
  // Just return the database instance
  return getDb(env.DB);
}

/**
 * Clean up test database
 */
export async function cleanupTestDb() {
  await env.DB.exec(`
    DELETE FROM fragments;
    DELETE FROM attachments;
    DELETE FROM resources;
    DELETE FROM games;
  `);
}

// Counter to ensure unique IDs within the same millisecond
let idCounter = 0;

/**
 * Create test game
 */
export async function createTestGame(data?: Partial<typeof games.$inferInsert>) {
  const db = getDb(env.DB);
  const name = data?.name ?? 'Test Game';
  const slug = data?.slug ?? name.toLowerCase().replace(/\s+/g, '-');

  const gameData = {
    id: `test-game-${Date.now()}-${idCounter++}`,
    name,
    slug,
    year: null,
    imageUrl: null,
    bggUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };

  const [game] = await db.insert(games).values(gameData).returning();
  return game;
}

/**
 * Create test resource
 */
export async function createTestResource(gameId: string, data?: Partial<typeof resources.$inferInsert>) {
  const db = getDb(env.DB);
  const resourceData = {
    id: `test-resource-${Date.now()}-${idCounter++}`,
    gameId,
    name: 'Test Resource',
    originalFilename: 'test-resource.pdf',
    author: null,
    attributionUrl: null,
    url: 'https://example.com/test.pdf',
    content: 'Test content',
    version: 2,
    pdfExtractor: 'mistral',
    status: 'ready',
    currentJobId: null,
    processingStage: 'ready',
    processingMetadata: null,
    pageCount: 10,
    imageCount: 5,
    wordCount: 1000,
    description: 'Test description',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };

  const [resource] = await db.insert(resources).values(resourceData).returning();
  return resource;
}

/**
 * Create test attachment
 */
export async function createTestAttachment(resourceId: string, gameId: string, data?: Partial<typeof attachments.$inferInsert>) {
  const db = getDb(env.DB);
  const attachmentData = {
    id: `test-attachment-${Date.now()}-${idCounter++}`,
    gameId,
    resourceId,
    type: 'image',
    url: 'https://example.com/image.png',
    mimeType: 'image/png',
    originalFilename: 'test.png',
    pageNumber: 1,
    bbox: JSON.stringify([0, 0, 100, 100]),
    caption: 'Test caption',
    width: 800,
    height: 600,
    createdAt: new Date(),
    ...data,
  };

  const [attachment] = await db.insert(attachments).values(attachmentData).returning();
  return attachment;
}
