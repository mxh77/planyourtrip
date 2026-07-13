-- AlterTable
ALTER TABLE "steps" ADD COLUMN "routeDurationSeconds" INTEGER;
ALTER TABLE "steps" ADD COLUMN "routeDistanceMeters" INTEGER;
ALTER TABLE "steps" ADD COLUMN "routeEncodedPolyline" TEXT;
