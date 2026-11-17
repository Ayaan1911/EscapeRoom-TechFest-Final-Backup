CREATE TABLE "InsiderAccess" (
  "teamId" TEXT NOT NULL PRIMARY KEY,
  "fragmentA" TEXT NOT NULL,
  "fragmentB" TEXT NOT NULL,
  "unlockedAt" DATETIME,
  CONSTRAINT "InsiderAccess_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InsiderAccess_fragmentA_key" ON "InsiderAccess"("fragmentA");
CREATE UNIQUE INDEX "InsiderAccess_fragmentB_key" ON "InsiderAccess"("fragmentB");
