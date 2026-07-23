-- Add budget fields to roadtrips
ALTER TABLE "roadtrips" ADD COLUMN "budgetTarget" DOUBLE PRECISION;
ALTER TABLE "roadtrips" ADD COLUMN "budgetCurrency" TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE "roadtrips" ADD COLUMN "fuelConsumption" DOUBLE PRECISION;
ALTER TABLE "roadtrips" ADD COLUMN "fuelType" TEXT;
ALTER TABLE "roadtrips" ADD COLUMN "fuelPricePerL" DOUBLE PRECISION;

-- Create ExpenseCategory enum
CREATE TYPE "ExpenseCategory" AS ENUM ('FUEL', 'TOLL', 'FOOD', 'PARKING', 'EQUIPMENT', 'INSURANCE', 'OTHER');

-- Create expenses table
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "roadtripId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidById" TEXT,
    "stepId" TEXT,
    "date" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_roadtripId_fkey" FOREIGN KEY ("roadtripId") REFERENCES "roadtrips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "expenses_roadtripId_idx" ON "expenses"("roadtripId");
CREATE INDEX "expenses_stepId_idx" ON "expenses"("stepId");
