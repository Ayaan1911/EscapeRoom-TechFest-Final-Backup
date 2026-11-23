-- Additive only: Round 2 format snapshot + Inject 2 terminal attempts. No existing column or row is changed.
ALTER TABLE "R2Session" ADD COLUMN "format" TEXT;

CREATE TABLE "R2BlockAttempt" (
    "id" SERIAL NOT NULL,
    "teamId" TEXT NOT NULL,
    "sessionStartsAt" TIMESTAMP(3) NOT NULL,
    "seq" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "R2BlockAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "R2BlockAttempt_seq_range" CHECK ("seq" BETWEEN 1 AND 4)
);
CREATE UNIQUE INDEX "R2BlockAttempt_teamId_sessionStartsAt_seq_key" ON "R2BlockAttempt"("teamId", "sessionStartsAt", "seq");
CREATE INDEX "R2BlockAttempt_teamId_sessionStartsAt_idx" ON "R2BlockAttempt"("teamId", "sessionStartsAt");
