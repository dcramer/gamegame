-- Rebuild FTS5 index for fragments table
-- This fixes corruption without deleting any actual data

-- Step 1: Drop existing FTS5 table and triggers
DROP TRIGGER IF EXISTS fragments_ai;
DROP TRIGGER IF EXISTS fragments_ad;
DROP TRIGGER IF EXISTS fragments_au;
DROP TABLE IF EXISTS fragments_fts;

-- Step 2: Recreate FTS5 virtual table
CREATE VIRTUAL TABLE fragments_fts USING fts5(
  content,
  id UNINDEXED,
  content='fragments',
  content_rowid='rowid'
);

-- Step 3: Repopulate FTS5 index from existing fragments
INSERT INTO fragments_fts(rowid, id, content)
SELECT rowid, id, content FROM fragments;

-- Step 4: Recreate triggers to keep FTS5 in sync
CREATE TRIGGER fragments_ai AFTER INSERT ON fragments BEGIN
  INSERT INTO fragments_fts(rowid, id, content)
  VALUES (new.rowid, new.id, new.content);
END;

CREATE TRIGGER fragments_ad AFTER DELETE ON fragments BEGIN
  DELETE FROM fragments_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER fragments_au AFTER UPDATE ON fragments BEGIN
  UPDATE fragments_fts SET content = new.content
  WHERE rowid = new.rowid;
END;
