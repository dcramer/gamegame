import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

// Helper for consistent ID generation (nanoid ensures <=64 bytes for Vectorize)
const generateId = () => nanoid();

// Resource status enum
export const RESOURCE_STATUSES = ['ready', 'queued', 'processing', 'completed', 'failed'] as const;
export type ResourceStatus = typeof RESOURCE_STATUSES[number];

// Games table
export const games = sqliteTable('games', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  name: text('name').notNull(),
  year: integer('year'),
  slug: text('slug').notNull().unique(),
  imageUrl: text('image_url'),
  bggId: text('bgg_id').unique(), // BoardGameGeek game ID
  bggUrl: text('bgg_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  nameIdx: index('idx_games_name').on(table.name),
  bggIdIdx: index('idx_games_bgg_id').on(table.bggId),
}));

// Resources table
export const resources = sqliteTable('resources', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  originalFilename: text('original_filename'),
  author: text('author'),
  attributionUrl: text('attribution_url'),
  url: text('url').notNull(),
  content: text('content').notNull().default(''),
  version: integer('version').notNull().default(0),
  pdfExtractor: text('pdf_extractor'),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('ready'),
  currentJobId: text('current_job_id'),
  processingStage: text('processing_stage').default('ready'),
  processingMetadata: text('processing_metadata'),
  description: text('description'),

  // Denormalized stats
  pageCount: integer('page_count'),
  imageCount: integer('image_count').default(0),
  wordCount: integer('word_count').default(0),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  gameIdx: index('idx_resources_game_id').on(table.gameId),
  statusIdx: index('idx_resources_status').on(table.status),
  jobIdx: index('idx_resources_job_id').on(table.currentJobId),
}));

// Fragments table (text chunks for RAG)
export const fragments = sqliteTable('fragments', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  resourceId: text('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  version: integer('version').notNull().default(0),

  // Metadata (stored as separate columns since no JSONB in SQLite)
  pageNumber: integer('page_number'),
  pageRangeStart: integer('page_range_start'),
  pageRangeEnd: integer('page_range_end'),
  section: text('section'),
  images: text('images'), // JSON string: [{id, url, bbox, caption}]
}, (table) => ({
  gameIdx: index('idx_fragments_game_id').on(table.gameId),
  resourceIdx: index('idx_fragments_resource_id').on(table.resourceId),
  versionIdx: index('idx_fragments_version').on(table.version),
  pageIdx: index('idx_fragments_page_number').on(table.pageNumber),
}));

// Attachments table (images extracted from PDFs)
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  resourceId: text('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('image'),
  mimeType: text('mime_type').notNull(),
  r2Key: text('r2_key').notNull(), // R2 key: resources/{resourceId}/attachments/{id}.{ext}
  originalFilename: text('original_filename'),
  pageNumber: integer('page_number'),
  bbox: text('bbox'), // JSON array: [x1, y1, x2, y2]
  caption: text('caption'),
  width: integer('width'),
  height: integer('height'),
  description: text('description'), // AI-generated description of the image content
  isGoodQuality: integer('is_good_quality', { mode: 'boolean' }), // true (good), false (bad), or null
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  gameIdx: index('idx_attachments_game_id').on(table.gameId),
  resourceIdx: index('idx_attachments_resource_id').on(table.resourceId),
  resourcePageIdx: index('idx_attachments_resource_page').on(table.resourceId, table.pageNumber),
  typeIdx: index('idx_attachments_type').on(table.type),
}));

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  email: text('email').notNull().unique(),
  name: text('name'),
  isAdmin: integer('is_admin', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// BGG cache table
export const bggGames = sqliteTable('bgg_games', {
  id: text('id').primaryKey(), // BGG ID
  name: text('name').notNull(),
  yearPublished: integer('year_published'),
  minPlayers: integer('min_players'),
  maxPlayers: integer('max_players'),
  playingTime: integer('playing_time'),
  thumbnailUrl: text('thumbnail_url'),
  imageUrl: text('image_url'),
  description: text('description'),
  publishers: text('publishers'), // JSON array
  designers: text('designers'), // JSON array
  categories: text('categories'), // JSON array
  mechanics: text('mechanics'), // JSON array
  cachedAt: integer('cached_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  nameIdx: index('idx_bgg_games_name').on(table.name),
}));

// Export types
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type Fragment = typeof fragments.$inferSelect;
export type NewFragment = typeof fragments.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type BggGame = typeof bggGames.$inferSelect;
export type NewBggGame = typeof bggGames.$inferInsert;
