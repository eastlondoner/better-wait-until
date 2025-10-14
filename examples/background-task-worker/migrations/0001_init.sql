-- D1 schema for background task completion records
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  start_time_ms INTEGER NOT NULL,
  end_time_ms INTEGER,
  scheduled_duration_ms INTEGER NOT NULL,
  elapsed_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('subsec') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);


