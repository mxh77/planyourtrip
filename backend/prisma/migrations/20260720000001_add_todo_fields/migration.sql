-- Add notes, dueDate, country fields to todo_items table
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS dueDate TIMESTAMP(3);
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS country TEXT;
