CREATE TABLE "workflow_runs" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"workflow_name" varchar(191) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resource_id" varchar(191),
	"attachment_id" varchar(191),
	"game_id" varchar(191),
	"external_run_id" varchar(191),
	"error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"completed_at" bigint
);
--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_workflow_name" ON "workflow_runs" USING btree ("workflow_name");--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_resource_id" ON "workflow_runs" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_attachment_id" ON "workflow_runs" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_external_run_id" ON "workflow_runs" USING btree ("external_run_id");