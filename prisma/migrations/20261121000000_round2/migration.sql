-- Round 2 (GHOST RETURNS). ADDITIVE ONLY: creates new tables; no Round 1 table, column, row, credential or session is altered.
-- UNVERIFIED against a database in this pass (storage-limited); review before `prisma migrate deploy`. Never run against production without an owner-approved backup.

-- CreateTable
CREATE TABLE "R2Session" (
    "id" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "resultsPublishedAt" TIMESTAMP(3),
    "contentVersion" TEXT,

    CONSTRAINT "R2Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "R2Finalist" (
    "teamId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "snapshotDigest" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "R2Finalist_pkey" PRIMARY KEY ("teamId")
);

-- CreateTable
CREATE TABLE "R2Submission" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "awarded" INTEGER NOT NULL,
    "taskEarned" INTEGER NOT NULL,
    "criteria" TEXT NOT NULL,
    "answerHash" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "contentVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "R2Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "R2TaskScore" (
    "teamId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "part" TEXT NOT NULL,
    "earned" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "criteria" TEXT NOT NULL,
    "firstScoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAwardAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "R2TaskScore_pkey" PRIMARY KEY ("teamId","taskId")
);

-- CreateTable
CREATE TABLE "R2Draft" (
    "teamId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "R2Draft_pkey" PRIMARY KEY ("teamId","taskId")
);

-- CreateTable
CREATE TABLE "R2Audit" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "R2Audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "R2Finalist_status_idx" ON "R2Finalist"("status");
CREATE INDEX "R2Submission_teamId_taskId_createdAt_idx" ON "R2Submission"("teamId", "taskId", "createdAt");
CREATE INDEX "R2Submission_teamId_createdAt_idx" ON "R2Submission"("teamId", "createdAt");
CREATE INDEX "R2TaskScore_teamId_part_idx" ON "R2TaskScore"("teamId", "part");
CREATE INDEX "R2Audit_createdAt_idx" ON "R2Audit"("createdAt");

-- AddForeignKey
ALTER TABLE "R2Finalist" ADD CONSTRAINT "R2Finalist_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "R2Submission" ADD CONSTRAINT "R2Submission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "R2Finalist"("teamId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "R2TaskScore" ADD CONSTRAINT "R2TaskScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "R2Finalist"("teamId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "R2Draft" ADD CONSTRAINT "R2Draft_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "R2Finalist"("teamId") ON DELETE RESTRICT ON UPDATE CASCADE;
