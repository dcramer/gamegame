-- Create FTS5 virtual table for full-text search on fragments
CREATE VIRTUAL TABLE fragments_fts USING fts5(
  content,
  fragment_id UNINDEXED,
  content='fragments',
  content_rowid='rowid'
);

-- Trigger to insert into FTS5 when fragment is created
CREATE TRIGGER fragments_ai AFTER INSERT ON fragments BEGIN
  INSERT INTO fragments_fts(rowid, fragment_id, content)
  VALUES (new.rowid, new.id, new.content);
END;

-- Trigger to delete from FTS5 when fragment is deleted
CREATE TRIGGER fragments_ad AFTER DELETE ON fragments BEGIN
  DELETE FROM fragments_fts WHERE rowid = old.rowid;
END;

-- Trigger to update FTS5 when fragment content changes
CREATE TRIGGER fragments_au AFTER UPDATE ON fragments BEGIN
  UPDATE fragments_fts SET content = new.content
  WHERE rowid = new.rowid;
END;
