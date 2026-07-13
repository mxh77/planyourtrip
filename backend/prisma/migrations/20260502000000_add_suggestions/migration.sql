-- CreateEnum
CREATE TYPE "SuggestionCategory" AS ENUM ('bug', 'evolution', 'question', 'other');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('pending', 'done');

-- CreateTable
CREATE TABLE "suggestions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" "SuggestionCategory" NOT NULL DEFAULT 'other',
    "status" "SuggestionStatus" NOT NULL DEFAULT 'pending',
    "files" JSONB NOT NULL DEFAULT '[]',
    "githubIssueNumber" INTEGER,
    "githubIssueUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
