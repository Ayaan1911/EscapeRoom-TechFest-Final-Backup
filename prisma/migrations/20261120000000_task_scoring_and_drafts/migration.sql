-- Additive only: no existing column, row, credential, session or submission is rewritten.
-- AlterTable: audit columns on Submission (NULL for every historical row = legacy all-or-nothing era)
ALTER TABLE "Submission" ADD COLUMN "scoringVersion" INTEGER,
ADD COLUMN "awarded" INTEGER,
ADD COLUMN "chapterRaw" INTEGER,
ADD COLUMN "criteria" TEXT;

-- CreateTable
CREATE TABLE "TaskScore" (
    "teamId" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "taskId" TEXT NOT NULL,
    "earned" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "criteria" TEXT NOT NULL,
    "firstScoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskScore_pkey" PRIMARY KEY ("teamId","taskId")
);

-- CreateTable
CREATE TABLE "ChapterDraft" (
    "teamId" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "taskId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterDraft_pkey" PRIMARY KEY ("teamId","chapter","taskId")
);

-- CreateIndex
CREATE INDEX "TaskScore_teamId_chapter_idx" ON "TaskScore"("teamId", "chapter");

-- AddForeignKey
ALTER TABLE "TaskScore" ADD CONSTRAINT "TaskScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterDraft" ADD CONSTRAINT "ChapterDraft_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
