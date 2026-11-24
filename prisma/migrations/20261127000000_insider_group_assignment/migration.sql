-- Additive only: Evidence Wall "group mode" (one assigned group A/B/C per team; 30 teams -> 10/10/10).
-- A group-mode team has exactly ONE InsiderPair row (pair = its group) and ONE match card of its own in InsiderWallCard (teamId = that team).
-- Existing rows are untouched: three-pair teams (3 InsiderPair rows) and legacy two-fragment teams (0 rows) keep working exactly as before.
ALTER TABLE "InsiderWallCard" ADD COLUMN "teamId" TEXT;
CREATE INDEX "InsiderWallCard_teamId_idx" ON "InsiderWallCard"("teamId");
ALTER TABLE "InsiderWallCard" ADD CONSTRAINT "InsiderWallCard_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
