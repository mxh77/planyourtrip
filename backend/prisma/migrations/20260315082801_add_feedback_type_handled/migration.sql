-- CreateEnum
CREATE TYPE "feedback_type" AS ENUM ('BUG', 'SUGGESTION', 'QUESTION', 'AUTRE');

-- AlterTable
ALTER TABLE "beta_feedbacks" ADD COLUMN     "handledAt" TIMESTAMP(3),
ADD COLUMN     "isHandled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" "feedback_type" NOT NULL DEFAULT 'AUTRE';
