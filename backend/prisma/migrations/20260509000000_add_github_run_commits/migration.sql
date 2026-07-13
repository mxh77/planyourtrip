-- Ajout des colonnes runType, issueNumber, headSha sur github_runs
ALTER TABLE "github_runs" ADD COLUMN IF NOT EXISTS "runType" TEXT;
ALTER TABLE "github_runs" ADD COLUMN IF NOT EXISTS "issueNumber" INTEGER;
ALTER TABLE "github_runs" ADD COLUMN IF NOT EXISTS "headSha" TEXT;

-- Table github_run_commits : lie chaque run à ses commits
CREATE TABLE IF NOT EXISTS "github_run_commits" (
  "id"          SERIAL PRIMARY KEY,
  "runId"       BIGINT NOT NULL REFERENCES "github_runs"("id") ON DELETE CASCADE,
  "sha"         TEXT NOT NULL,
  "message"     TEXT,
  "author"      TEXT,
  "committedAt" TIMESTAMP(3),
  CONSTRAINT "github_run_commits_runId_sha_key" UNIQUE ("runId", "sha")
);

CREATE INDEX IF NOT EXISTS "github_run_commits_runId_idx" ON "github_run_commits"("runId");
