-- DropForeignKey
ALTER TABLE "github_run_commits" DROP CONSTRAINT "github_run_commits_runId_fkey";

-- DropIndex
DROP INDEX "github_run_commits_runId_idx";

-- AlterTable
ALTER TABLE "devhub_workflows" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "github_run_commits" ADD CONSTRAINT "github_run_commits_runId_fkey" FOREIGN KEY ("runId") REFERENCES "github_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
