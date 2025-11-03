import { pgTable, varchar, integer, text, bigint, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vector } from 'pgvector/drizzle-orm';
import { nanoid } from 'nanoid';
import { games } from './games';
import { resources } from './resources';
import { fragments } from './fragments';

export const EMBEDDING_TYPES = ['content', 'question'] as const;
export type EmbeddingType = (typeof EMBEDDING_TYPES)[number];

/**
 * Embeddings table - stores vector embeddings for content and synthetic questions (HyDE)
 *
 * Architecture:
 * - Content embeddings: One per fragment (id = fragmentId, type = 'content')
 * - Question embeddings: Up to 5 per fragment (id = `${fragmentId}-q${0-4}`, type = 'question')
 *
 * This design mirrors the Vectorize architecture from workers/ but uses PostgreSQL + pgvector
 */
export const embeddings = pgTable(
  'embeddings',
  {
    id: varchar('id', { length: 191 }).primaryKey(), // fragmentId or fragmentId-q0, etc.
    fragmentId: varchar('fragment_id', { length: 191 })
      .notNull()
      .references(() => fragments.id, { onDelete: 'cascade' }),
    gameId: varchar('game_id', { length: 191 })
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    resourceId: varchar('resource_id', { length: 191 })
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),

    // Embedding type: 'content' or 'question'
    type: varchar('type', { length: 50 }).notNull(),

    // Vector embedding (1536 dimensions for text-embedding-3-small)
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),

    // Question-specific fields (null for content embeddings)
    questionIndex: integer('question_index'), // 0-4 for questions, null for content
    questionText: text('question_text'), // The synthetic question

    // Metadata (denormalized for search performance)
    pageNumber: integer('page_number'),
    section: text('section'),
    fragmentType: varchar('fragment_type', { length: 50 }), // 'text' | 'image' | 'table'

    version: integer('version').notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    fragmentIdx: index('idx_embeddings_fragment_id').on(table.fragmentId),
    gameTypeIdx: index('idx_embeddings_game_type').on(table.gameId, table.type),
    resourceIdx: index('idx_embeddings_resource_id').on(table.resourceId),
    typeIdx: index('idx_embeddings_type').on(table.type),

    // Vector similarity indexes (using IVFFlat)
    // Inner product for OpenAI embeddings (normalized, so equivalent to cosine similarity)
    embeddingIpIdx: index('idx_embeddings_vector_ip')
      .using('ivfflat', table.embedding.op('vector_ip_ops'))
      .with({ lists: 100 }),

    // Cosine similarity (backup, in case needed)
    embeddingCosineIdx: index('idx_embeddings_vector_cosine')
      .using('ivfflat', table.embedding.op('vector_cosine_ops'))
      .with({ lists: 100 }),
  })
);

export type Embedding = typeof embeddings.$inferSelect;
export type NewEmbedding = typeof embeddings.$inferInsert;

/**
 * Helper to generate embedding ID
 */
export function generateEmbeddingId(fragmentId: string, type: EmbeddingType, questionIndex?: number): string {
  if (type === 'content') {
    return fragmentId;
  }
  if (questionIndex === undefined) {
    throw new Error('questionIndex required for question embeddings');
  }
  return `${fragmentId}-q${questionIndex}`;
}
