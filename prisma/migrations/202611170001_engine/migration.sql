CREATE TABLE "Team" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "participants" TEXT NOT NULL, "codeHash" TEXT NOT NULL, "variant" TEXT NOT NULL, "progress" TEXT NOT NULL);
CREATE TABLE "TeamSession" ("tokenHash" TEXT NOT NULL PRIMARY KEY, "teamId" TEXT, "role" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL, CONSTRAINT "TeamSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "GameSession" ("id" INTEGER NOT NULL PRIMARY KEY, "startsAt" DATETIME, "deadline" DATETIME, "endedAt" DATETIME);
CREATE TABLE "Submission" ("id" TEXT NOT NULL PRIMARY KEY, "teamId" TEXT NOT NULL, "chapter" INTEGER NOT NULL, "accepted" BOOLEAN NOT NULL, "reason" TEXT NOT NULL, "answer" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "Submission_teamId_createdAt_idx" ON "Submission"("teamId", "createdAt");
CREATE TABLE "AuditLog" ("id" TEXT NOT NULL PRIMARY KEY, "actor" TEXT NOT NULL, "action" TEXT NOT NULL, "detail" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "LoginAttempt" ("key" TEXT NOT NULL PRIMARY KEY, "failures" INTEGER NOT NULL, "windowStart" DATETIME NOT NULL);
