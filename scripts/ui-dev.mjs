// Persistent design-review session: disposable local PostgreSQL + `next dev` on :3000 + seeded teams. Credentials go to a file OUTSIDE the repo
// (D:\Ghost404-TestWorkspace\ui-session.json), never to the console. Stop with Ctrl+C / killing the process; the database is dropped on exit.
//   node scripts/ui-dev.mjs              (GHOST_UI_STATE = prep | r1 (default) | qual | r2wait | r2run | r2end | results)
// Event-stage seeds are for screenshots only. Round 2 terminal attempts use the SYNTHETIC test-fixture key (tests/fixtures), never the case key.
import { createTempDatabase } from "./pg-temp.mjs";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { createHash } from "node:crypto";
import { hints, initialProgress, progressSchema, ranking, score } from "../src/lib/game/engine.ts";
// Same rows as src/lib/game/results.ts qualificationRows (that module uses extensionless imports plain Node cannot load). Key order matters for the digest.
const hintDeduction = n => n === 2 ? 9 : n * 3;
const qualificationRows = teams => ranking(teams).map((team, i) => { const deductions = team.progress.chapters.map(c => hintDeduction(c.hints));
  return { ...team, rawScores: team.progress.chapters.map(c => c.score), deductions, totalDeduction: deductions.reduce((a, b) => a + b, 0), hintCount: hints(team.progress), bonus: team.progress.bonus, total: score(team.progress), completedAt: team.progress.completedAt,
    rank: i + 1, selection: i < 10 ? "Top 10 candidate" : i < 12 ? "Standby candidate" : "Outside selection", chapter23: team.progress.chapters[1].score + team.progress.chapters[2].score, overrides: team.progress.chapters.flatMap((c, j) => c.override ? [j + 1] : []) }; });
const STATE = process.env.GHOST_UI_STATE ?? "r1", AFTER = ["qual", "r2wait", "r2run", "r2end", "results"].includes(STATE);

const temp = await createTempDatabase("uidev"), code = randomBytes(12).toString("hex"), ORIGIN = "http://127.0.0.1:3000";
const db = new PrismaClient({ datasourceUrl: temp.url });
let server;
const stop = () => { if (server?.pid) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); };
const done = async () => { stop(); await db.$disconnect().catch(() => {}); await temp.drop().catch(() => {}); process.exit(0); };
process.on("SIGINT", done); process.on("SIGTERM", done);
const r1start = STATE === "prep" ? null : new Date(Date.now() - (AFTER ? 130 : 12) * 60_000);
await db.gameSession.create({ data: { id: 1, startsAt: r1start, deadline: r1start && new Date(r1start.getTime() + 60 * 60_000), scoringPolicy: "best-v1" } });
const mk = async (id, patch) => { const p = initialProgress(); patch?.(p); await db.team.create({ data: { id, name: `Team ${id}`, participants: JSON.stringify(["Asha", "Ravi", "Meera"]), codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(p) } }); };
await mk("SHOT-NEW");
await mk("SHOT-DONE", p => { [15, 25, 25, 20, 15].forEach((v, i) => { p.chapters[i].score = v; p.chapters[i].unlockedAt = Date.now() - 6e5; p.chapters[i].completedAt = Date.now() - (5 - i) * 1e5; }); p.completedAt = Date.now() - 1e4; p.bonus = 5; });
await mk("SHOT-MID", p => { p.chapters[0].score = 12; p.chapters[0].unlockedAt = Date.now() - 5e5; p.chapters[1].score = 9; p.chapters[1].unlockedAt = Date.now() - 2e5; p.chapters[2].unlockedAt = Date.now() - 1e5; });
for (let i = 1; i <= 12; i++) await mk(`R2-${String(i).padStart(2, "0")}`, p => { p.chapters[0].score = 15; p.chapters[1].score = 25; });
const ids = Array.from({ length: 12 }, (_, i) => `R2-${String(i + 1).padStart(2, "0")}`);
// Real digest (same computation as qualification.server.ts) so a "confirmed" seed state is recognised as confirmed.
const round = await db.gameSession.findUnique({ where: { id: 1 } }), teams = await db.team.findMany({ select: { id: true, name: true, variant: true, participants: true, progress: true } });
const digest = createHash("sha256").update(JSON.stringify({ round, rows: qualificationRows(teams.map(t => ({ ...t, progress: progressSchema.parse(JSON.parse(t.progress)) }))) })).digest("hex");
if (STATE === "r1" || STATE === "prep" || ["r2wait", "r2run", "r2end", "results"].includes(STATE)) {
  await db.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: JSON.stringify({ digest: STATE === "r1" || STATE === "prep" ? "seeded-digest-0001" : digest, top10: ids.slice(0, 10), standby: ids.slice(10), reason: "design review" }) } });
  if (STATE !== "prep") await db.r2Finalist.createMany({ data: ids.map((teamId, i) => ({ teamId, status: i < 10 ? "active" : "standby", seed: i + 1, snapshotDigest: digest })) });
}
const R2 = { r2run: 22, r2end: 75, results: 80 }[STATE];
if (R2) {
  const startsAt = new Date(Date.now() - R2 * 60_000);
  await db.r2Session.create({ data: { id: 1, startsAt, contentVersion: "case-v2", format: "open-60", resultsPublishedAt: STATE === "results" ? new Date() : null } });
  const FIX = ["192.0.2.81", "203.0.113.88", "198.51.100.12", "192.0.2.25"]; // synthetic fixture IPs only
  const plan = { "R2-01": [[0, "caught"], [1, "caught"]], "R2-02": [[2, "cleared"], [0, "caught"]], "R2-03": [[2, "cleared"], [3, "cleared"], [0, "caught"], [1, "caught"]], "R2-04": [[0, "caught"]] };
  for (const [teamId, list] of Object.entries(plan)) await db.r2BlockAttempt.createMany({ data: list.map(([ip, result], i) => ({ teamId, sessionStartsAt: startsAt, seq: i + 1, ip: FIX[ip], result, createdAt: new Date(startsAt.getTime() + (8 + i * 3) * 60_000) })) });
  if (STATE !== "r2run") for (const [i, teamId] of ids.slice(0, 10).entries()) for (const inject of [1, 3, 4]) {
    if (STATE === "r2end" && (i > 5 || (i > 2 && inject === 4))) continue;
    await db.r2PaperMark.create({ data: { teamId, sessionStartsAt: startsAt, inject, score: [12, 9, 14, 7, 11, 10, 13, 8, 12, 6][i] - (inject === 3 ? 2 : 0) + (inject === 4 ? 1 : 0), marker: "Jury A" } });
  }
  if (STATE === "results") for (const k of ["standings", "finalists"]) await db.auditLog.create({ data: { actor: "organizer", action: `broadcast-${k}-on`, detail: JSON.stringify({ reason: "design review" }) } });
}
writeFileSync("D:/Ghost404-TestWorkspace/ui-session.json", JSON.stringify({ code, origin: ORIGIN }));
const env = { ...process.env, ...(R2 ? { GHOST_R2_KEY_FILE: "tests/fixtures/round2-key-fixture.json" } : {}), DATABASE_URL: temp.url, DIRECT_URL: temp.url, ADMIN_ACCESS_HASH: hashPassword(code), APP_ORIGIN: ORIGIN };
server = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "--hostname", "127.0.0.1"], { env, stdio: "ignore", shell: process.platform === "win32" });
console.log("ui-dev ready on", ORIGIN, "(credentials in ui-session.json outside the repo)");
await new Promise(() => {});
