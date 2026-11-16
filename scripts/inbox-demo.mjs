import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress, complete, bonus } from "../src/lib/game/engine.ts";

const testing = process.argv.includes("--test");
const trail = process.argv.includes("--trail");
const origin = new URL(testing ? "http://127.0.0.1:3000" : process.env.DEMO_ORIGIN ?? "http://127.0.0.1:3000");
assert.equal(origin.protocol, "http:", "The local demo uses HTTP; deployed production must use HTTPS");
assert.match(origin.hostname, /^[a-z\d.:-]+$/i);
assert.equal(origin.pathname, "/");
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash);
const folder = mkdtempSync(join(tmpdir(), "ghost-inbox-demo-"));
const databaseUrl = `file:${join(folder, "test.db").replaceAll("\\", "/")}`;
const code = randomBytes(18).toString("hex");
const env = { ...process.env, DATABASE_URL: databaseUrl, ADMIN_ACCESS_HASH: hashPassword(code), APP_ORIGIN: origin.origin, GHOST_E2E_TEAM_ID: "DEMO-A", GHOST_E2E_TEAM_CODE: code, GHOST_E2E_ADMIN_CODE: code, GHOST_E2E_INBOX: "1", GHOST_E2E_TRAIL: trail ? "1" : "", ...(testing ? { CI: "1" } : {}) };
const db = new PrismaClient({ datasourceUrl: databaseUrl });
let child;
function stop() {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else child.kill("SIGTERM");
}
function cleanup() {
  if (!testing && process.stdin.isTTY) { process.stdin.setRawMode(false); process.stdin.pause(); }
  assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep) && folder.includes("ghost-inbox-demo-"));
  rmSync(folder, { recursive: true, force: true });
}
function interrupt() {
  stop();
  cleanup();
  process.exit(0);
}
async function seedTrail() {
  for (const variant of ["A", "B", "C"]) {
    const progress = initialProgress();
    complete(progress, 0, 15, Date.now());
    if (variant === "A") bonus(progress);
    const id = `TRAIL-${variant}`;
    await db.team.create({ data: { id, name: `Trail demo ${variant}`, participants: JSON.stringify(["Investigator One", "Investigator Two", "Investigator Three"]), codeHash: hashPassword(code), variant, progress: JSON.stringify(progress) } });
    await db.submission.create({ data: { teamId: id, chapter: 0, accepted: true, reason: "Temporary demo fixture: Inbox completed" } });
    if (variant === "A") await db.auditLog.create({ data: { actor: id, action: "tamper-alert", detail: JSON.stringify({ chapter: 0, fixture: true }) } });
  }
  if (testing) await db.team.create({ data: { id: "TRAIL-LOCKED", name: "Locked regression fixture", participants: '[]', codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(initialProgress()) } });
  await db.$disconnect();
}
try {
  assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
  for (const sql of readFileSync(new URL("../prisma/migrations/202611170001_engine/migration.sql", import.meta.url), "utf8").split(";").filter(value => value.trim())) await db.$executeRawUnsafe(sql);
  if (!trail || testing) for (const variant of ["A", "B", "C"]) await db.team.create({ data: { id: `DEMO-${variant}`, name: `Inbox demo ${variant}`, participants: JSON.stringify(["Investigator One", "Investigator Two", "Investigator Three"]), codeHash: hashPassword(code), variant, progress: JSON.stringify(initialProgress()) } });
  if (trail && !testing) {
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(), deadline: new Date(Date.now() + 3600000) } });
    await seedTrail();
  }
  await db.$disconnect();
  if (testing) console.log("Browser verification uses a fresh temporary database and generated test-only credentials.");
  else console.log(`Temporary ${trail ? "Trail" : "Chapter 1"} demo: ${origin.origin}\nTeams: ${trail ? "TRAIL-A, TRAIL-B, TRAIL-C (Inbox completed; round already started)" : "DEMO-A, DEMO-B, DEMO-C"}\nOrganizer: ${origin.origin}/login?role=admin\nGenerated demo-only access code for teams and organizer: ${code}\n${trail ? "Open Chapter 2 as a Trail team. TRAIL-A already has the global bonus; B/C can earn it in Trail." : "Start Round 1 as organizer, then investigate as a team."} Ctrl+C removes this temporary database. Existing .env and development data are untouched.`);
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  // Own Ctrl+C input on Windows so npm cannot terminate the process tree before cleanup.
  if (!testing && process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on("data", data => { if (data.includes(3)) interrupt(); });
  }
  const commands = testing ? trail ? [["node_modules/@playwright/test/cli.js", "test", "tests/routes.spec.ts", "tests/inbox.spec.ts"], ["node_modules/@playwright/test/cli.js", "test", "tests/trail.spec.ts"]] : [["node_modules/@playwright/test/cli.js", "test"]] : [["node_modules/next/dist/bin/next", "dev", "--hostname", origin.hostname, "--port", origin.port || "80"]];
  for (const [index, args] of commands.entries()) {
    if (testing && trail && index === 1) await seedTrail();
    child = spawn(process.execPath, args, { env, stdio: [testing ? "inherit" : "ignore", "inherit", "inherit"], windowsHide: true });
    process.exitCode = await new Promise((accept, reject) => { child.once("error", reject); child.once("exit", code => accept(code ?? 1)); });
    if (process.exitCode !== 0) break;
  }
} finally {
  stop();
  await db.$disconnect();
  cleanup();
}
