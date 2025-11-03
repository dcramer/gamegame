import { pgTable, varchar, integer, text, bigint, index } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { games } from './games';

export const RESOURCE_STATUSES = ['ready', 'queued', 'processing', 'completed', 'failed'] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const RESOURCE_TYPES = ['rulebook', 'expansion', 'faq', 'errata', 'reference'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const resources = pgTable(
  'resources',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => nanoid()),
    gameId: varchar('game_id', { length: 191 })
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    originalFilename: text('original_filename'),
    author: text('author'),
    attributionUrl: text('attribution_url'),
    url: text('url').notNull(),
    content: text('content').notNull().default(''),
    version: integer('version').notNull().default(0),
    pdfExtractor: varchar('pdf_extractor', { length: 50 }),
    processedAt: bigint('processed_at', { mode: 'number' }),
    status: varchar('status', { length: 50 }).notNull().default('ready'),
    currentJobId: varchar('current_job_id', { length: 191 }),
    processingStage: varchar('processing_stage', { length: 50 }).default('ready'),
    processingMetadata: text('processing_metadata'), // JSON string

    description: text('description'),

    // Resource classification
    resourceType: varchar('resource_type', { length: 50 }).default('rulebook'),
    language: varchar('language', { length: 10 }).default('en'),
    edition: varchar('edition', { length: 100 }),
    isOfficial: integer('is_official').default(1), // 1 = true, 0 = false

    // Denormalized stats
    pageCount: integer('page_count'),
    imageCount: integer('image_count').default(0),
    wordCount: integer('word_count').default(0),

    createdAt: bigint('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: bigint('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    gameIdx: index('idx_resources_game_id').on(table.gameId),
    statusIdx: index('idx_resources_status').on(table.status),
    jobIdx: index('idx_resources_job_id').on(table.currentJobId),
  })
);

export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
