ALTER TABLE "attachments" ALTER COLUMN "is_good_quality" SET DATA TYPE varchar(10);--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "url" text NOT NULL;--> statement-breakpoint
ALTER TABLE "fragments" ADD COLUMN "embedding" vector(1536) NOT NULL;--> statement-breakpoint
ALTER TABLE "fragments" ADD COLUMN "answer_types" jsonb;--> statement-breakpoint
CREATE INDEX "idx_fragments_embedding" ON "fragments" USING hnsw ("embedding" vector_ip_ops);