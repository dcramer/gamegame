ALTER TABLE "resources" RENAME COLUMN "current_job_id" TO "current_run_id";--> statement-breakpoint
DROP INDEX "idx_resources_job_id";--> statement-breakpoint
CREATE INDEX "idx_resources_run_id" ON "resources" USING btree ("current_run_id");