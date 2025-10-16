-- Add task_type column to distinguish between better-wait-until vs builtin waitUntil
ALTER TABLE tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'better-wait-until';


