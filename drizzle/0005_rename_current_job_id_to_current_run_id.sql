-- Rename current_job_id column to current_run_id
ALTER TABLE "resources" RENAME COLUMN "current_job_id" TO "current_run_id";

-- Rename the index
ALTER INDEX "idx_resources_job_id" RENAME TO "idx_resources_run_id";
