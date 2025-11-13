import { pgTable, varchar, text, jsonb, bigint, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export type WorkflowRunMetadata = Record<string, unknown>;

export const workflowRuns = pgTable(
  'workflow_run_records',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    workflowName: varchar('workflow_name', { length: 191 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    metadata: jsonb('metadata').$type<WorkflowRunMetadata>().notNull().default(sql`'{}'::jsonb`),
    resourceId: varchar('resource_id', { length: 191 }),
    attachmentId: varchar('attachment_id', { length: 191 }),
    gameId: varchar('game_id', { length: 191 }),
    externalRunId: varchar('external_run_id', { length: 191 }),
    error: text('error'),
    createdAt: bigint('created_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: bigint('updated_at', { mode: 'number' })
      .notNull()
      .$defaultFn(() => Date.now()),
    completedAt: bigint('completed_at', { mode: 'number' }),
  },
  (table) => ({
    workflowNameIdx: index('idx_workflow_run_records_workflow_name').on(table.workflowName),
    resourceIdx: index('idx_workflow_run_records_resource_id').on(table.resourceId),
    attachmentIdx: index('idx_workflow_run_records_attachment_id').on(table.attachmentId),
    externalRunIdx: index('idx_workflow_run_records_external_run_id').on(table.externalRunId),
  })
);

export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
export type NewWorkflowRunRow = typeof workflowRuns.$inferInsert;
