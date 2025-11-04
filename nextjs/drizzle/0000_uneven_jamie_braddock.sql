CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"game_id" varchar(191) NOT NULL,
	"resource_id" varchar(191) NOT NULL,
	"type" varchar(50) DEFAULT 'image' NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"blob_key" text NOT NULL,
	"original_filename" text,
	"page_number" integer,
	"bbox" jsonb,
	"caption" text,
	"width" integer,
	"height" integer,
	"description" text,
	"is_good_quality" integer,
	"is_relevant" integer,
	"detected_type" varchar(50),
	"ocr_text" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bgg_games" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"year_published" integer,
	"min_players" integer,
	"max_players" integer,
	"playing_time" integer,
	"thumbnail_url" text,
	"image_url" text,
	"description" text,
	"publishers" jsonb,
	"designers" jsonb,
	"categories" jsonb,
	"mechanics" jsonb,
	"cached_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"fragment_id" varchar(191) NOT NULL,
	"game_id" varchar(191) NOT NULL,
	"resource_id" varchar(191) NOT NULL,
	"type" varchar(50) NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"question_index" integer,
	"question_text" text,
	"page_number" integer,
	"section" text,
	"fragment_type" varchar(50),
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fragments" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"game_id" varchar(191) NOT NULL,
	"resource_id" varchar(191) NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"type" varchar(50) DEFAULT 'text' NOT NULL,
	"attachment_id" varchar(191),
	"searchable_content" text,
	"synthetic_questions" jsonb,
	"resource_name" text,
	"resource_description" text,
	"resource_type" varchar(50),
	"page_number" integer,
	"page_range" jsonb,
	"section" text,
	"images" jsonb,
	"search_vector" "tsvector" DEFAULT to_tsvector('english', ''),
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"year" integer,
	"slug" varchar(191) NOT NULL,
	"image_url" text,
	"bgg_id" varchar(191),
	"bgg_url" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "games_slug_unique" UNIQUE("slug"),
	CONSTRAINT "games_bgg_id_unique" UNIQUE("bgg_id")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"game_id" varchar(191) NOT NULL,
	"name" text NOT NULL,
	"original_filename" text,
	"author" text,
	"attribution_url" text,
	"url" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"pdf_extractor" varchar(50),
	"processed_at" bigint,
	"status" varchar(50) DEFAULT 'ready' NOT NULL,
	"current_job_id" varchar(191),
	"processing_stage" varchar(50) DEFAULT 'ready',
	"processing_metadata" text,
	"description" text,
	"resource_type" varchar(50) DEFAULT 'rulebook',
	"language" varchar(10) DEFAULT 'en',
	"edition" varchar(100),
	"is_official" integer DEFAULT 1,
	"page_count" integer,
	"image_count" integer DEFAULT 0,
	"word_count" integer DEFAULT 0,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" text,
	"is_admin" integer DEFAULT 0,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"resource_id" varchar(191) NOT NULL,
	"game_id" varchar(191) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"current_step" text,
	"error" jsonb,
	"metadata" jsonb,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"completed_at" bigint
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_fragment_id_fragments_id_fk" FOREIGN KEY ("fragment_id") REFERENCES "public"."fragments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fragments" ADD CONSTRAINT "fragments_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fragments" ADD CONSTRAINT "fragments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fragments" ADD CONSTRAINT "fragments_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attachments_game_id" ON "attachments" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_resource_id" ON "attachments" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_resource_page" ON "attachments" USING btree ("resource_id","page_number");--> statement-breakpoint
CREATE INDEX "idx_attachments_type" ON "attachments" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_bgg_games_name" ON "bgg_games" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_embeddings_fragment_id" ON "embeddings" USING btree ("fragment_id");--> statement-breakpoint
CREATE INDEX "idx_embeddings_game_type" ON "embeddings" USING btree ("game_id","type");--> statement-breakpoint
CREATE INDEX "idx_embeddings_resource_id" ON "embeddings" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_embeddings_type" ON "embeddings" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_embeddings_vector_ip" ON "embeddings" USING ivfflat ("embedding" vector_ip_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX "idx_embeddings_vector_cosine" ON "embeddings" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists=100);--> statement-breakpoint
CREATE INDEX "idx_fragments_game_id" ON "fragments" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_fragments_resource_id" ON "fragments" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_fragments_version" ON "fragments" USING btree ("version");--> statement-breakpoint
CREATE INDEX "idx_fragments_page_number" ON "fragments" USING btree ("page_number");--> statement-breakpoint
CREATE INDEX "idx_fragments_type" ON "fragments" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_fragments_attachment_id" ON "fragments" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "idx_fragments_search_vector" ON "fragments" USING gin (search_vector);--> statement-breakpoint
CREATE INDEX "idx_games_name" ON "games" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_games_bgg_id" ON "games" USING btree ("bgg_id");--> statement-breakpoint
CREATE INDEX "idx_resources_game_id" ON "resources" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_resources_status" ON "resources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_resources_job_id" ON "resources" USING btree ("current_job_id");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_jobs_resource_id" ON "jobs" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_game_id" ON "jobs" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_jobs_created_at" ON "jobs" USING btree ("created_at");