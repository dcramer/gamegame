import { pgTable, varchar, integer, text, bigint, index, jsonb, vector } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { games } from './games';
import { resources } from './resources';
import { attachments } from './attachments';
import { tsvector } from '../columns/tsvector';

export const FRAGMENT_TYPES = ['text', 'image', 'table'] as const;
export type FragmentType = (typeof FRAGMENT_TYPES)[number];

export type ImageMetadata = {
  id: string;
  url: string;
  bbox?: [number, number, number, number];
  caption?: string;
  description?: string;
};

export const fragments = pgTable(
  'fragments',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => nanoid()),
    gameId: varchar('game_id', { length: 191 })
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    resourceId: varchar('resource_id', { length: 191 })
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    version: integer('version').notNull().default(0),

    // Fragment type discrimination
    type: varchar('type', { length: 50 }).notNull().default('text'),
    attachmentId: varchar('attachment_id', { length: 191 }).references(() => attachments.id, {
      onDelete: 'set null',
    }),

    // Dual content storage (display vs search)
    searchableContent: text('searchable_content'), // Enriched content used for embedding

    // HyDE: Synthetic questions (JSON array of strings)
    syntheticQuestions: jsonb('synthetic_questions').$type<string[]>(),

    // Denormalized resource metadata for faster search context
    resourceName: text('resource_name'),
    resourceDescription: text('resource_description'),
    resourceType: varchar('resource_type', { length: 50 }),

    // Metadata
    pageNumber: integer('page_number'),
    pageRange: jsonb('page_range').$type<[number, number]>(), // [start, end]
    section: text('section'),
    images: jsonb('images').$type<ImageMetadata[]>(),

    // Full-text search vector (PostgreSQL tsvector)
    searchVector: tsvector('search_vector'),

    createdAt: bigint('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: bigint('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    gameIdx: index('idx_fragments_game_id').on(table.gameId),
    resourceIdx: index('idx_fragments_resource_id').on(table.resourceId),
    versionIdx: index('idx_fragments_version').on(table.version),
    pageIdx: index('idx_fragments_page_number').on(table.pageNumber),
    typeIdx: index('idx_fragments_type').on(table.type),
    attachmentIdx: index('idx_fragments_attachment_id').on(table.attachmentId),
    // GIN index for full-text search
    searchVectorIdx: index('idx_fragments_search_vector').using('gin', sql`search_vector`),
    // HNSW index for vector similarity search (inner product for OpenAI embeddings)
    embeddingIdx: index('idx_fragments_embedding').using('hnsw', table.embedding.op('vector_ip_ops')),
  })
);

export type Fragment = typeof fragments.$inferSelect;
export type NewFragment = typeof fragments.$inferInsert;
