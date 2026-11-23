// Persistent design-review session: disposable local PostgreSQL + `next dev` on :3000 + seeded teams. Credentials go to a file OUTSIDE the repo
// (D:\Ghost404-TestWorkspace\ui-session.json), never to the console. Stop with Ctrl+C / killing the process; the database is dropped on exit.
//   node scripts/ui-dev.mjs
import { createTempDatabase } from "./pg-temp.mjs";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine.ts";

const temp = await createTempDatabase("uidev"), code = randomBytes(12).toString("hex"), ORIGIN = "http://127.0.0.1:3000";
const db = new PrismaClient({ datasourceUrl: temp.url });
let server;
const stop = () => { if (server?.pid) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); };
const done = async () => { stop(); await db.$disconnect().catch(() => {}); await temp.drop().catch(() => {}); process.exit(0); };
process.on("SIGINT", done); process.on("SIGTERM", done);
await db.gameSession.create({ data: { id: 1, startsAt: new Date(Date.now() - 12 * 60_000), deadline: new Date(Date.now() + 48 * 60_000), scoringPolicy: "best-v1" } });
const mk = async (id, patch) => { const p = initialProgress(); patch?.(p); await db.team.create({ data: { id, name: `Team ${id}`, participants: JSON.stringify(["Asha", "Ravi", "Meera"]), codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(p) } }); };
await mk("SHOT-NEW");
await mk("SHOT-DONE", p => { [15, 25, 25, 20, 15].forEach((v, i) => { p.chapters[i].score = v; p.chapters[i].unlockedAt = Date.now() - 6e5; p.chapters[i].completedAt = Date.now() - (5 - i) * 1e5; }); p.completedAt = Date.now() - 1e4; p.bonus = 5; });
await mk("SHOT-MID", p => { p.chapters[0].score = 12; p.chapters[0].unlockedAt = Date.now() - 5e5; p.chapters[1].score = 9; p.chapters[1].unlockedAt = Date.now() - 2e5; p.chapters[2].unlockedAt = Date.now() - 1e5; });
for (let i = 1; i <= 12; i++) await mk(`R2-${String(i).padStart(2, "0")}`, p => { p.chapters[0].score = 15; p.chapters[1].score = 25; });
const ids = Array.from({ length: 12 }, (_, i) => `R2-${String(i + 1).padStart(2, "0")}`);
await db.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: JSON.stringify({ digest: "seeded-digest-0001", top10: ids.slice(0, 10), standby: ids.slice(10), reason: "design review" }) } });
await db.r2Finalist.createMany({ data: ids.map((teamId, i) => ({ teamId, status: i < 10 ? "active" : "standby", seed: i + 1, snapshotDigest: "seeded-digest-0001" })) });
writeFileSync("D:/Ghost404-TestWorkspace/ui-session.json", JSON.stringify({ code, origin: ORIGIN }));
const env = { ...process.env, DATABASE_URL: temp.url, DIRECT_URL: temp.url, ADMIN_ACCESS_HASH: hashPassword(code), APP_ORIGIN: ORIGIN };
server = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "--hostname", "127.0.0.1"], { env, stdio: "ignore", shell: process.platform === "win32" });
console.log("ui-dev ready on", ORIGIN, "(credentials in ui-session.json outside the repo)");
await new Promise(() => {});
