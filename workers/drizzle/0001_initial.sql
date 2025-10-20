-- Initial migration for GameGame D1 database

-- Games table
CREATE TABLE `games` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `year` integer,
  `slug` text NOT NULL UNIQUE,
  `image_url` text,
  `bgg_url` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `idx_games_name` ON `games` (`name`);
CREATE INDEX `idx_games_slug` ON `games` (`slug`);

-- Resources table
CREATE TABLE `resources` (
  `id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `name` text NOT NULL,
  `url` text NOT NULL,
  `content` text NOT NULL DEFAULT '',
  `version` integer NOT NULL DEFAULT 0,
  `pdf_extractor` text,
  `processed_at` integer,
  `page_count` integer,
  `image_count` integer DEFAULT 0,
  `word_count` integer DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_resources_game_id` ON `resources` (`game_id`);
CREATE UNIQUE INDEX `idx_resources_game_name_unique` ON `resources` (`game_id`, `name`);

-- Fragments table
CREATE TABLE `fragments` (
  `id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `resource_id` text NOT NULL,
  `content` text NOT NULL,
  `version` integer NOT NULL DEFAULT 0,
  `page_number` integer,
  `page_range_start` integer,
  `page_range_end` integer,
  `section` text,
  `images` text,
  FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_fragments_game_id` ON `fragments` (`game_id`);
CREATE INDEX `idx_fragments_resource_id` ON `fragments` (`resource_id`);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE `fragments_fts` USING fts5(
  content,
  fragment_id UNINDEXED,
  content='fragments',
  content_rowid='rowid'
);

-- Triggers to keep FTS table in sync
CREATE TRIGGER `fragments_ai` AFTER INSERT ON `fragments` BEGIN
  INSERT INTO `fragments_fts`(rowid, fragment_id, content)
  VALUES (new.rowid, new.id, new.content);
END;

CREATE TRIGGER `fragments_au` AFTER UPDATE ON `fragments` BEGIN
  UPDATE `fragments_fts`
  SET content = new.content
  WHERE rowid = old.rowid;
END;

CREATE TRIGGER `fragments_ad` AFTER DELETE ON `fragments` BEGIN
  DELETE FROM `fragments_fts`
  WHERE rowid = old.rowid;
END;

-- Attachments table
CREATE TABLE `attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `game_id` text NOT NULL,
  `resource_id` text NOT NULL,
  `type` text NOT NULL DEFAULT 'image',
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
  FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_attachments_game_id` ON `attachments` (`game_id`);
CREATE INDEX `idx_attachments_resource_id` ON `attachments` (`resource_id`);
CREATE INDEX `idx_attachments_page` ON `attachments` (`page_number`);
CREATE INDEX `idx_attachments_type` ON `attachments` (`type`);

-- Users table
CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL UNIQUE,
  `name` text,
  `is_admin` integer DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `idx_users_email` ON `users` (`email`);

-- BGG cache table
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
