// Phase 2 browser harness: disposable local PostgreSQL + seeded teams + Playwright. Never touches Neon/Render.
//   node scripts/phase2-e2e.mjs tests/phase2.spec.ts [more specs...]
import { createTempDatabase } from "./pg-temp.mjs";
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine.ts";

const specs = process.argv.slice(2).filter(a => !a.startsWith("--"));
const temp = await createTempDatabase("p2");
const code = randomBytes(18).toString("hex");
const origin = "http://127.0.0.1:3000";
const env = { ...process.env, DATABASE_URL: temp.url, DIRECT_URL: temp.url, ADMIN_ACCESS_HASH: hashPassword(code), APP_ORIGIN: origin, GHOST_E2E_TEAM_CODE: code, GHOST_E2E_ADMIN_CODE: code };
const db = new PrismaClient({ datasourceUrl: temp.url });
const progress = (raw = [0, 0, 0, 0, 0], extra = {}) => { const p = initialProgress(); raw.forEach((score, i) => { p.chapters[i].score = score; }); return { ...p, ...extra }; };
// Deterministic, well-formed fragments (A/B + 24 hex) so the spec can type the right ones.
const frag = (id, part) => `${part}-${createHash("sha256").update(id + part).digest("hex").toUpperCase().slice(0, 24).match(/.{6}/g).join("-")}`;
async function team(id, variant, p, sealed = false) {
  await db.team.create({ data: { id, name: `Phase 2 ${id}`, participants: JSON.stringify(["Investigator One", "Investigator Two", "Investigator Three"]), codeHash: hashPassword(code), variant, progress: JSON.stringify(p) } });
  await db.insiderAccess.create({ data: { teamId: id, fragmentA: frag(id, "A"), fragmentB: frag(id, "B"), unlockedAt: sealed ? null : new Date() } });
}
let child;
try {
  await db.gameSession.create({ data: { id: 1, startsAt: new Date(), deadline: new Date(Date.now() + 3_600_000) } });
  for (const v of ["A", "B", "C"]) {
    await team(`P2-FRESH-${v}`, v, progress());
    await team(`P2-MID-${v}`, v, progress([8, 13, 13, 10, 0]));
  }
  await team("P2-SEALED", "A", progress([8, 13]), true); // Insider open by points, physical dossier still sealed
  await team("P2-NEAR", "A", progress([7]));        // one point short of unlocking Trail
  await team("P2-SHARE", "B", progress());          // two-device draft tests
  const done = progress([15, 25, 25, 20, 15], { bonus: 0 }); done.chapters.forEach((c, i) => { c.completedAt = 1000 + i; }); done.completedAt = 1004;
  await team("P2-DONE", "A", done);
  const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...specs, "--workers=1", "--output", "test-results/phase2"], { env, stdio: "inherit", windowsHide: true });
  process.exitCode = result.status ?? 1;
} finally {
  await db.$disconnect().catch(() => undefined);
  await temp.drop();
  void child; void spawn;
}
