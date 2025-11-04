-- Migration: Add answer_types column to fragments table
-- Purpose: Store answer type classification for improved retrieval
-- Phase 1 of chunk enrichment strategy

ALTER TABLE `fragments` ADD COLUMN `answer_types` text;
