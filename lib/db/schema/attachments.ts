import { pgTable, varchar, integer, text, bigint, index, jsonb } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { games } from './games';
import { resources } from './resources';

export const DETECTED_IMAGE_TYPES = ['diagram', 'table', 'photo', 'icon', 'decorative'] as const;
export type DetectedImageType = (typeof DETECTED_IMAGE_TYPES)[number];

export const attachments = pgTable(
  'attachments',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => nanoid()),
    gameId: varchar('game_id', { length: 191 })
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    resourceId: varchar('resource_id', { length: 191 })
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull().default('image'),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    blobKey: text('blob_key').notNull(), // Vercel Blob or R2 key
    url: text('url').notNull(), // Public URL to access the attachment
    originalFilename: text('original_filename'),
    pageNumber: integer('page_number'),
    bbox: jsonb('bbox').$type<[number, number, number, number]>(), // [x1, y1, x2, y2]
    caption: text('caption'),
    width: integer('width'),
    height: integer('height'),
    description: text('description'), // AI-generated description
    isGoodQuality: varchar('is_good_quality', { length: 10 }).$type<'good' | 'bad' | null>(),

    // Image analysis fields
    isRelevant: integer('is_relevant'), // 1 = useful, 0 = decorative, null = unknown
    detectedType: varchar('detected_type', { length: 50 }), // diagram | table | photo | icon | decorative
    ocrText: text('ocr_text'), // Text extracted from image (for tables)

    createdAt: bigint('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => ({
    gameIdx: index('idx_attachments_game_id').on(table.gameId),
    resourceIdx: index('idx_attachments_resource_id').on(table.resourceId),
    resourcePageIdx: index('idx_attachments_resource_page').on(table.resourceId, table.pageNumber),
    typeIdx: index('idx_attachments_type').on(table.type),
  })
);

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
