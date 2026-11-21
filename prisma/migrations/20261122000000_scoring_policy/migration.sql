-- Scoring policy "best-v1". ADDITIVE ONLY: nullable/defaulted columns, one index. No existing row is rewritten.
-- A round that already started keeps scoringPolicy NULL = legacy "union-v0" behaviour (never silently migrated); new rounds get "best-v1" when they are started.
-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN "scoringPolicy" TEXT;
ALTER TABLE "Submission" ADD COLUMN "answerHash" TEXT, ADD COLUMN "taskId" TEXT;
ALTER TABLE "TaskScore" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "R2Session" ADD COLUMN "scoringPolicy" TEXT;
ALTER TABLE "R2Submission" ADD COLUMN "scoringPolicy" TEXT;

-- CreateIndex
CREATE INDEX "Submission_teamId_chapter_answerHash_idx" ON "Submission"("teamId", "chapter", "answerHash");
