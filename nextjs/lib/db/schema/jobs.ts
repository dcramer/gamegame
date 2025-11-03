import { pgTable, varchar, integer, text, bigint, index, jsonb } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

export const JOB_STATUSES = ['pending', 'processing', 'completed', 'failed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TYPES = ['process-resource'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export type JobError = {
  message: string;
  cause?: string;
  stack?: string;
};

/**
 * Jobs table - tracks background job status (replaces KV storage)
 */
export const jobs = pgTable(
  'jobs',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => nanoid()),
    type: varchar('type', { length: 50 }).notNull(),
    resourceId: varchar('resource_id', { length: 191 }).notNull(),
    gameId: varchar('game_id', { length: 191 }).notNull(),

    status: varchar('status', { length: 50 }).notNull().default('pending'),
    progress: integer('progress').notNull().default(0), // 0-100
    currentStep: text('current_step'),

    error: jsonb('error').$type<JobError>(),
    metadata: jsonb('metadata').$type<Record<string, any>>(),

    createdAt: bigint('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: bigint('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    completedAt: bigint('completed_at', { mode: 'number' }),
  },
  (table) => ({
    resourceIdx: index('idx_jobs_resource_id').on(table.resourceId),
    gameIdx: index('idx_jobs_game_id').on(table.gameId),
    statusIdx: index('idx_jobs_status').on(table.status),
    createdAtIdx: index('idx_jobs_created_at').on(table.createdAt),
  })
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
