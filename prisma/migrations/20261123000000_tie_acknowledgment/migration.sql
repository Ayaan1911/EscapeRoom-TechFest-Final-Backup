-- Exact-tie acknowledgment (Round 2). ADDITIVE ONLY: one new append-only table; no existing table, column or row is touched.
-- CreateTable
CREATE TABLE "R2TieAck" (
    "id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "teamIds" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "decidedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "R2TieAck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "R2TieAck_signature_key" ON "R2TieAck"("signature");
