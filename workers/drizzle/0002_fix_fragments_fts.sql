-- Recreate fragments_fts with column names aligned to base table
DROP TRIGGER IF EXISTS fragments_ai;
DROP TRIGGER IF EXISTS fragments_ad;
DROP TRIGGER IF EXISTS fragments_au;
DROP TABLE IF EXISTS fragments_fts;

CREATE VIRTUAL TABLE fragments_fts USING fts5(
  content,
  id UNINDEXED,
  content='fragments',
  content_rowid='rowid'
);

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

-- Backfill existing fragments into the rebuilt FTS table
INSERT INTO fragments_fts(rowid, id, content)
SELECT rowid, id, content
FROM fragments;
