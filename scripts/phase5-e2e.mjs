// Phase 5 browser harness: disposable local PostgreSQL (project test container only) + seeded Round 1 teams + Playwright.
// Never reads .env files, never touches Neon/Render. The Round 2 lifecycle itself (confirm qualification, enroll, start) is done by the spec through the real UI.
//   node scripts/phase5-e2e.mjs tests/phase5-round2.spec.ts [more specs...]
import { createTempDatabase } from "./pg-temp.mjs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine.ts";

const specs = process.argv.slice(2);
const temp = await createTempDatabase("p5");
const code = randomBytes(18).toString("hex");
const origin = "http://127.0.0.1:3000";
const env = { ...process.env, DATABASE_URL: temp.url, DIRECT_URL: temp.url, ADMIN_ACCESS_HASH: hashPassword(code), APP_ORIGIN: origin, GHOST_PHASE5: "1", GHOST_E2E_TEAM_CODE: code, GHOST_E2E_ADMIN_CODE: code };
const db = new PrismaClient({ datasourceUrl: temp.url });
try {
  // Round 1 is FINISHED so the organizer can confirm qualification (through the real UI). Scores descend so P5-01..10 are the top ten, 11-12 standby.
  await db.gameSession.create({ data: { id: 1, startsAt: new Date(Date.now() - 3 * 3600_000), deadline: new Date(Date.now() - 2 * 3600_000) } });
  for (let i = 1; i <= 14; i++) {
    const p = initialProgress(); p.chapters[0].score = 15; p.chapters[1].score = 25; p.chapters[2].score = Math.max(0, 26 - 2 * i);
    await db.team.create({ data: { id: `P5-${String(i).padStart(2, "0")}`, name: `Finalist ${String(i).padStart(2, "0")}`, participants: JSON.stringify(["One", "Two", "Three"]), codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(p) } });
  }
  const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...specs, "--workers=1", "--output", "test-results/phase5"], { env, stdio: "inherit", windowsHide: true });
  process.exitCode = result.status ?? 1;
} finally { await db.$disconnect().catch(() => undefined); await temp.drop(); }
