-- Additive only: jury marks for the paper injects (1, 3, 4) of the 60-minute Round 2. Inject 2 is never stored here: the terminal computes it.
CREATE TABLE "R2PaperMark" (
    "teamId" TEXT NOT NULL,
    "sessionStartsAt" TIMESTAMP(3) NOT NULL,
    "inject" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "marker" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "R2PaperMark_pkey" PRIMARY KEY ("teamId", "sessionStartsAt", "inject"),
    CONSTRAINT "R2PaperMark_inject_paper" CHECK ("inject" IN (1, 3, 4)),
    CONSTRAINT "R2PaperMark_score_range" CHECK ("score" BETWEEN 0 AND 15)
);
