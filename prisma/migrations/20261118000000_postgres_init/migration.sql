-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "participants" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "progress" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsiderAccess" (
    "teamId" TEXT NOT NULL,
    "fragmentA" TEXT NOT NULL,
    "fragmentB" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3),

    CONSTRAINT "InsiderAccess_pkey" PRIMARY KEY ("teamId")
);

-- CreateTable
CREATE TABLE "TeamSession" (
    "tokenHash" TEXT NOT NULL,
    "teamId" TEXT,
    "role" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "answer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsiderAccess_fragmentA_key" ON "InsiderAccess"("fragmentA");

-- CreateIndex
CREATE UNIQUE INDEX "InsiderAccess_fragmentB_key" ON "InsiderAccess"("fragmentB");

-- CreateIndex
CREATE INDEX "Submission_teamId_createdAt_idx" ON "Submission"("teamId", "createdAt");

-- AddForeignKey
ALTER TABLE "InsiderAccess" ADD CONSTRAINT "InsiderAccess_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSession" ADD CONSTRAINT "TeamSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

