CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`type` text DEFAULT 'image' NOT NULL,
	`mime_type` text,
	`url` text NOT NULL,
	`original_filename` text,
	`page_number` integer,
	`bbox` text,
	`caption` text,
	`width` integer,
	`height` integer,
	`description` text,
	`is_good_quality` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_game_id` ON `attachments` (`game_id`);--> statement-breakpoint
CREATE INDEX `idx_attachments_resource_id` ON `attachments` (`resource_id`);--> statement-breakpoint
CREATE INDEX `idx_attachments_page` ON `attachments` (`page_number`);--> statement-breakpoint
CREATE INDEX `idx_attachments_type` ON `attachments` (`type`);--> statement-breakpoint
CREATE TABLE `bgg_games` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year_published` integer,
	`min_players` integer,
	`max_players` integer,
	`playing_time` integer,
	`thumbnail_url` text,
	`image_url` text,
	`description` text,
	`publishers` text,
	`designers` text,
	`categories` text,
	`mechanics` text,
	`cached_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fragments` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`page_number` integer,
	`page_range_start` integer,
	`page_range_end` integer,
	`section` text,
	`images` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_fragments_game_id` ON `fragments` (`game_id`);--> statement-breakpoint
CREATE INDEX `idx_fragments_resource_id` ON `fragments` (`resource_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year` integer,
	`slug` text NOT NULL,
	`image_url` text,
	`bgg_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_slug_unique` ON `games` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_games_name` ON `games` (`name`);--> statement-breakpoint
CREATE INDEX `idx_games_slug` ON `games` (`slug`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`pdf_extractor` text,
	`processed_at` integer,
	`status` text DEFAULT 'ready' NOT NULL,
	`current_job_id` text,
	`processing_stage` text DEFAULT 'ready' NOT NULL,
	`processing_metadata` text,
	`page_count` integer,
	`image_count` integer DEFAULT 0,
	`word_count` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_resources_game_id` ON `resources` (`game_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`is_admin` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);