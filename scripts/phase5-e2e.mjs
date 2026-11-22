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
  if (process.env.GHOST_P5_SEED === "1" || process.env.GHOST_P5_SEED === "enrolled") { // fast path for visual specs ONLY (the lifecycle spec performs these steps through the real UI instead)
    const ids = Array.from({ length: 12 }, (_, i) => `P5-${String(i + 1).padStart(2, "0")}`);
    await db.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: JSON.stringify({ digest: "seeded-digest-0001", top10: ids.slice(0, 10), standby: ids.slice(10), reason: "seed" }) } });
    await db.r2Finalist.createMany({ data: ids.map((teamId, i) => ({ teamId, status: i < 10 ? "active" : "standby", seed: i + 1, snapshotDigest: "seeded-digest-0001" })) });
    if (process.env.GHOST_P5_SEED === "enrolled") { /* paper edition specs create and move the Round 2 clock themselves */ } else {
    const finished = process.env.GHOST_P5_FINISHED === "1"; // fast organizer/results checks: a round that already ended (test clock, never a real round)
    await db.r2Session.create({ data: { id: 1, startsAt: new Date(Date.now() - (finished ? 60 : 10) * 60_000), contentVersion: "r2-v1", scoringPolicy: "best-v1" } });
    }
  }
  const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...specs, "--workers=1", "--output", "test-results/phase5"], { env, stdio: "inherit", windowsHide: true });
  process.exitCode = result.status ?? 1;
} finally { await db.$disconnect().catch(() => undefined); await temp.drop(); }
