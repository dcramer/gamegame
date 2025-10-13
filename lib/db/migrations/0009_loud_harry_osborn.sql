ALTER TABLE "fragment" ADD COLUMN "page_number" integer;--> statement-breakpoint
ALTER TABLE "fragment" ADD COLUMN "page_range" jsonb;--> statement-breakpoint
ALTER TABLE "fragment" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "fragment" ADD COLUMN "images" jsonb;