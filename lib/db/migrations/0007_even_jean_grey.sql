CREATE TABLE IF NOT EXISTS "bgg_game" (
	"bgg_id" varchar(50) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"year_published" integer,
	"type" varchar(50) NOT NULL,
	"thumbnail_url" text,
	"image_url" text,
	"description" text,
	"min_players" integer,
	"max_players" integer,
	"playing_time" integer,
	"publishers" text[],
	"designers" text[],
	"cached_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bgg_game_name_idx" ON "bgg_game" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bgg_game_cached_at_idx" ON "bgg_game" USING btree ("cached_at");