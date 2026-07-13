-- Remove type and stopType columns from steps, drop StepType enum
ALTER TABLE "steps" DROP COLUMN IF EXISTS "type";
ALTER TABLE "steps" DROP COLUMN IF EXISTS "stopType";
DROP TYPE IF EXISTS "StepType";