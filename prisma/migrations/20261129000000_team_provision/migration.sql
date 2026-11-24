-- Additive only: final event roster metadata (30 primary + 2 reserve teams). Holds NO secrets (passwords stay hashed in "Team"."codeHash").
-- A team without a row keeps behaving exactly as before. Nothing here creates, changes or removes a team, a hash, a score or any progress.
CREATE TABLE "TeamProvision" (
    "teamId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "bundleId" TEXT NOT NULL,
    "provisionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "replacesTeamId" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    CONSTRAINT "TeamProvision_pkey" PRIMARY KEY ("teamId"),
    CONSTRAINT "TeamProvision_kind_check" CHECK ("kind" IN ('primary', 'reserve')),
    CONSTRAINT "TeamProvision_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TeamProvision_replacesTeamId_key" ON "TeamProvision"("replacesTeamId");
