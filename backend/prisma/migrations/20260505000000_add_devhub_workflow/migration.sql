-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM (
  'IDLE',
  'SPEC_RUNNING',
  'SPEC_DONE',
  'DEV_RUNNING',
  'DEV_DONE',
  'REVIEW_PENDING',
  'REVIEW_RUNNING',
  'REVIEW_OK',
  'FIX_RUNNING',
  'PREVIEW_RUNNING',
  'PREVIEW_OK',
  'QA_RUNNING',
  'QA_OK',
  'MERGE_READY',
  'MERGED',
  'DEPLOY_RUNNING',
  'DEPLOYED',
  'STUCK',
  'PAUSED'
);

-- CreateTable
CREATE TABLE "devhub_workflows" (
  "id"               SERIAL PRIMARY KEY,
  "issueNumber"      INTEGER NOT NULL,
  "state"            "WorkflowState" NOT NULL DEFAULT 'IDLE',
  "autoMode"         BOOLEAN NOT NULL DEFAULT false,
  "retryCount"       INTEGER NOT NULL DEFAULT 0,
  "totalTransitions" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil"      TIMESTAMP(3),
  "lastTransitionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stuckReason"      TEXT,
  "prNumber"         INTEGER,
  "metadata"         JSONB NOT NULL DEFAULT '{}',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "devhub_workflows_issueNumber_key" ON "devhub_workflows"("issueNumber");
