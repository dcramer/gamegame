import { env } from 'cloudflare:test';
import { getDb, games, resources, attachments } from '@/lib/db';

/**
 * Initialize test database with schema
 */
export async function setupTestDb() {
  const db = getDb(env.DB);

  // Create tables - D1 requires separate exec() calls for each statement
  await env.DB.exec('CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, name TEXT NOT NULL, image_url TEXT, bgg_url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');

  await env.DB.exec('CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, content TEXT NOT NULL DEFAULT \'\', version INTEGER NOT NULL DEFAULT 0, pdf_extractor TEXT, processed_at INTEGER, page_count INTEGER, image_count INTEGER DEFAULT 0, word_count INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE)');

  await env.DB.exec('CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, resource_id TEXT NOT NULL, type TEXT NOT NULL, url TEXT NOT NULL, mime_type TEXT, original_filename TEXT, page_number INTEGER, bbox TEXT, caption TEXT, width INTEGER, height INTEGER, description TEXT, is_good_quality TEXT, created_at INTEGER NOT NULL, FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE, FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE)');

  await env.DB.exec('CREATE TABLE IF NOT EXISTS fragments (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, resource_id TEXT NOT NULL, content TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, page_number INTEGER, page_range_start INTEGER, page_range_end INTEGER, section TEXT, images TEXT, FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE, FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE)');

  return db;
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
  const gameData = {
    id: `test-game-${Date.now()}-${idCounter++}`,
    name: 'Test Game',
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
    url: 'https://example.com/test.pdf',
    content: 'Test content',
    version: 2,
    pdfExtractor: 'mistral',
    pageCount: 10,
    imageCount: 5,
    wordCount: 1000,
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
