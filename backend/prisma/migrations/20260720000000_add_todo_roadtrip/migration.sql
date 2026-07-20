-- AlterTable: add roadtripId to todo_items
ALTER TABLE "todo_items" ADD COLUMN "roadtripId" TEXT NOT NULL DEFAULT '__placeholder__';

-- AddForeignKey
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_roadtripId_fkey"
  FOREIGN KEY ("roadtripId") REFERENCES "roadtrips"(id) ON DELETE CASCADE;

-- CreateIndex
CREATE INDEX "todo_items_roadtripId_idx" ON "todo_items"("roadtripId");
