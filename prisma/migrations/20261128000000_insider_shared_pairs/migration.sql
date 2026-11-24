-- Additive only: Evidence Wall FINAL design. Exactly three shared pairs (A, B, C) for the whole event; every team of a group shares its pair.
-- Earlier tables (InsiderPair, InsiderWallCard, InsiderAccess) and earlier migrations are untouched. A team with an InsiderGroupMember row uses this model;
-- teams without one keep the earlier behaviour until an organizer converts or prepares them (explicit, backup-gated; nothing converts automatically).
CREATE TABLE "InsiderGroupCode" (
    "group" TEXT NOT NULL,
    "privateCode" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsiderGroupCode_pkey" PRIMARY KEY ("group"),
    CONSTRAINT "InsiderGroupCode_group_check" CHECK ("group" IN ('A', 'B', 'C'))
);
CREATE UNIQUE INDEX "InsiderGroupCode_privateCode_key" ON "InsiderGroupCode"("privateCode");
CREATE UNIQUE INDEX "InsiderGroupCode_publicCode_key" ON "InsiderGroupCode"("publicCode");

CREATE TABLE "InsiderGroupMember" (
    "teamId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "solvedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsiderGroupMember_pkey" PRIMARY KEY ("teamId"),
    CONSTRAINT "InsiderGroupMember_group_check" CHECK ("group" IN ('A', 'B', 'C')),
    CONSTRAINT "InsiderGroupMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "InsiderGroupMember_group_idx" ON "InsiderGroupMember"("group");
