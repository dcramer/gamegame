ALTER TABLE "embeddings" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;