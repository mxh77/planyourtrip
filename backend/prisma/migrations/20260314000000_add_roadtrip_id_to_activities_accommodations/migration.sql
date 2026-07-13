-- Add roadtripId column to accommodations
ALTER TABLE "accommodations" ADD COLUMN IF NOT EXISTS "roadtripId" TEXT;

-- Add roadtripId column to activities
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "roadtripId" TEXT;

-- Backfill existing records from their associated step
UPDATE "accommodations" a
SET "roadtripId" = s."roadtripId"
FROM "steps" s
WHERE a."stepId" = s.id;

UPDATE "activities" a
SET "roadtripId" = s."roadtripId"
FROM "steps" s
WHERE a."stepId" = s.id;
