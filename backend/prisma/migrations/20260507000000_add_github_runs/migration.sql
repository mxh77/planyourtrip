-- CreateTable
CREATE TABLE "github_runs" (
    "id" BIGINT NOT NULL,
    "name" TEXT,
    "displayTitle" TEXT,
    "path" TEXT,
    "headBranch" TEXT,
    "status" TEXT NOT NULL,
    "conclusion" TEXT,
    "htmlUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "runStartedAt" TIMESTAMP(3),
    "event" TEXT,
    "rawJson" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_runs_pkey" PRIMARY KEY ("id")
);
