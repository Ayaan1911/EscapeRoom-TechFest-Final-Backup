-- Additive only: the three-pair Evidence Wall (Insider chapter). Existing InsiderAccess rows and their unlockedAt are untouched.
-- A team with NO InsiderPair rows keeps the legacy two-fragment unlock exactly as before (migration compatibility); a team that already
-- unlocked its dossier stays unlocked. Pair rows are created only when the organizer prepares the pair kit for a team.
CREATE TABLE "InsiderPair" (
    "teamId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "privateCode" TEXT NOT NULL,
    "solvedAt" TIMESTAMP(3),
    CONSTRAINT "InsiderPair_pkey" PRIMARY KEY ("teamId", "pair"),
    CONSTRAINT "InsiderPair_pair_check" CHECK ("pair" IN ('A', 'B', 'C')),
    CONSTRAINT "InsiderPair_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InsiderPair_privateCode_key" ON "InsiderPair"("privateCode");

-- Shared public wall cards (one set per team variant): one intended match per pair plus lookalike decoys. Codes are random per event database.
CREATE TABLE "InsiderWallCard" (
    "code" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "InsiderWallCard_pkey" PRIMARY KEY ("code"),
    CONSTRAINT "InsiderWallCard_pair_check" CHECK ("pair" IN ('A', 'B', 'C')),
    CONSTRAINT "InsiderWallCard_role_check" CHECK ("role" IN ('match', 'decoy'))
);
CREATE INDEX "InsiderWallCard_variant_pair_idx" ON "InsiderWallCard"("variant", "pair");
