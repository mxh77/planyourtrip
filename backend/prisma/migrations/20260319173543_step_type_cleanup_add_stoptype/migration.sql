/*
  Warnings:

  - The values [DEPARTURE,RETURN] on the enum `StepType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "StepType_new" AS ENUM ('STAGE', 'STOP');
ALTER TABLE "steps" ALTER COLUMN "type" TYPE "StepType_new" USING ("type"::text::"StepType_new");
ALTER TYPE "StepType" RENAME TO "StepType_old";
ALTER TYPE "StepType_new" RENAME TO "StepType";
DROP TYPE "StepType_old";
COMMIT;

-- AlterTable
ALTER TABLE "steps" ADD COLUMN     "stopType" "ActivityType";
