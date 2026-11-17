import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress, complete, bonus } from "../src/lib/game/engine.ts";

const testing = process.argv.includes("--test");
const containment = process.argv.includes("--containment");
const insider = process.argv.includes("--insider") || containment;
const trail = process.argv.includes("--trail") || insider;
const origin = new URL(testing ? "http://127.0.0.1:3000" : process.env.DEMO_ORIGIN ?? "http://127.0.0.1:3000");
assert.equal(origin.protocol, "http:", "The local demo uses HTTP; deployed production must use HTTPS");
assert.match(origin.hostname, /^[a-z\d.:-]+$/i);
assert.equal(origin.pathname, "/");
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash);
const folder = mkdtempSync(join(tmpdir(), "ghost-inbox-demo-"));
const databaseUrl = `file:${join(folder, "test.db").replaceAll("\\", "/")}`;
const code = randomBytes(18).toString("hex");
const env = { ...process.env, DATABASE_URL: databaseUrl, ADMIN_ACCESS_HASH: hashPassword(code), APP_ORIGIN: origin.origin, GHOST_E2E_TEAM_ID: "DEMO-A", GHOST_E2E_TEAM_CODE: code, GHOST_E2E_ADMIN_CODE: code, GHOST_E2E_INBOX: "1", GHOST_E2E_TRAIL: trail ? "1" : "", GHOST_E2E_INSIDER: insider ? "1" : "", GHOST_E2E_CONTAINMENT: containment ? "1" : "", ...(testing ? { CI: "1" } : {}) };
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
async function seedInsider() {
  // All fixtures and the active round below belong exclusively to this disposable database.
  await db.gameSession.upsert({ where: { id: 1 }, create: { id: 1, startsAt: new Date(), deadline: new Date(Date.now() + 3600000) }, update: { startsAt: new Date(), deadline: new Date(Date.now() + 3600000), endedAt: null } });
  for (let i = 1; i <= (testing ? 50 : 3); i++) {
    const variant = ["A", "B", "C"][(i - 1) % 3], id = `INSIDER-${String(i).padStart(2, "0")}`, progress = initialProgress();
    complete(progress, 0, 15, Date.now()); complete(progress, 1, 25, Date.now());
    if (i === 1) bonus(progress);
    await db.team.create({ data: { id, name: `Insider demo ${i}`, participants: '["Investigator One","Investigator Two","Investigator Three"]', codeHash: hashPassword(code), variant, progress: JSON.stringify(progress) } });
    for (const chapter of [0, 1]) await db.submission.create({ data: { teamId: id, chapter, accepted: true, reason: "Temporary demo fixture: prior chapter completed" } });
    if (i === 1) await db.auditLog.create({ data: { actor: id, action: "tamper-alert", detail: JSON.stringify({ chapter: 0, fixture: true }) } });
  }
  if (testing) await db.team.create({ data: { id: "INSIDER-LOCKED", name: "Premature access fixture", participants: '[]', codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(initialProgress()) } });
  await db.$disconnect();
}
async function seedContainment() {
  const now = new Date();
  await db.gameSession.upsert({ where: { id: 1 }, create: { id: 1, ...(testing ? {} : { startsAt: now, deadline: new Date(Date.now() + 3600000) }) }, update: { startsAt: testing ? null : now, deadline: testing ? null : new Date(Date.now() + 3600000), endedAt: null } });
  for (const variant of ["A", "B", "C"]) {
    const id = `CONTAIN-${variant}`, progress = initialProgress();
    for (const [chapter, points] of [15, 25, 25].entries()) complete(progress, chapter, points, Date.now());
    if (variant === "A") bonus(progress);
    const fragment = part => `${part}-${randomBytes(12).toString("hex").toUpperCase().match(/.{6}/g).join("-")}`;
    await db.team.create({ data: { id, name: `Containment demo ${variant}`, participants: '["Investigator One","Investigator Two","Investigator Three"]', codeHash: hashPassword(code), variant, progress: JSON.stringify(progress), insiderAccess: { create: { fragmentA: fragment("A"), fragmentB: fragment("B"), unlockedAt: now } } } });
    for (const chapter of [0, 1, 2]) await db.submission.create({ data: { teamId: id, chapter, accepted: true, reason: "Temporary demo fixture: earlier chapter completed" } });
    await db.auditLog.create({ data: { actor: id, action: "dossier-unlock", detail: JSON.stringify({ chapter: 2, fixture: true }) } });
    if (variant === "A") await db.auditLog.create({ data: { actor: id, action: "tamper-alert", detail: JSON.stringify({ chapter: 0, fixture: true }) } });
  }
  if (testing) {
    const p = initialProgress(); complete(p, 0, 15, Date.now()); complete(p, 1, 25, Date.now());
    await db.team.create({ data: { id: "CONTAIN-LOCKED", name: "Insider incomplete regression fixture", participants: '[]', codeHash: hashPassword(code), variant: "C", progress: JSON.stringify(p) } });
  }
  await db.$disconnect();
}
try {
  assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
  for (const migration of readdirSync(new URL("../prisma/migrations/", import.meta.url)).sort().filter(name => /^\d/.test(name))) for (const sql of readFileSync(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), "utf8").split(";").filter(value => value.trim())) await db.$executeRawUnsafe(sql);
  if (!trail || testing) for (const variant of ["A", "B", "C"]) await db.team.create({ data: { id: `DEMO-${variant}`, name: `Inbox demo ${variant}`, participants: JSON.stringify(["Investigator One", "Investigator Two", "Investigator Three"]), codeHash: hashPassword(code), variant, progress: JSON.stringify(initialProgress()) } });
  if (containment && !testing) await seedContainment();
  else if (insider && !testing) await seedInsider();
  else if (trail && !testing) {
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(), deadline: new Date(Date.now() + 3600000) } });
    await seedTrail();
  }
  await db.$disconnect();
  if (testing) console.log("Browser verification uses a fresh temporary database and generated test-only credentials.");
  else console.log(`Temporary ${containment ? "Containment" : insider ? "Insider" : trail ? "Trail" : "Chapter 1"} demo: ${origin.origin}\nTeams: ${containment ? "CONTAIN-A, CONTAIN-B, CONTAIN-C (Inbox + Trail + Insider completed; round active)" : insider ? "INSIDER-01, INSIDER-02, INSIDER-03 (Inbox + Trail completed; round active)" : trail ? "TRAIL-A, TRAIL-B, TRAIL-C (Inbox completed; round already started)" : "DEMO-A, DEMO-B, DEMO-C"}\nOrganizer: ${origin.origin}/login?role=admin\nGenerated demo-only access code for teams and organizer: ${code}\n${containment ? "As organizer print /admin/containment-kit and authorize an accessible copy if needed. As a team open /play/containment. All response decisions are inert simulations." : insider ? "As organizer open /admin/insider-kit, prepare PRIVATE A and PUBLIC B separately, then unlock /play/insider as the matching team." : trail ? "Open Chapter 2 as a Trail team. TRAIL-A already has the global bonus; B/C can earn it in Trail." : "Start Round 1 as organizer, then investigate as a team."} Ctrl+C removes this temporary database. Existing .env and development data are untouched.`);
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  // Own Ctrl+C input on Windows so npm cannot terminate the process tree before cleanup.
  if (!testing && process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on("data", data => { if (data.includes(3)) interrupt(); });
  }
  const commands = testing ? trail ? [["node_modules/@playwright/test/cli.js", "test", "tests/routes.spec.ts", "tests/inbox.spec.ts"], ["node_modules/@playwright/test/cli.js", "test", "tests/trail.spec.ts"], ...(insider ? [["node_modules/@playwright/test/cli.js", "test", "tests/insider.spec.ts", "--output", "test-results/insider-main"], ["node_modules/@playwright/test/cli.js", "test", "tests/insider-restart.spec.ts", "--output", "test-results/insider-restart"]] : [])] : [["node_modules/@playwright/test/cli.js", "test"]] : [["node_modules/next/dist/bin/next", "dev", "--hostname", origin.hostname, "--port", origin.port || "80"]];
  if (testing && containment) commands.push(["node_modules/@playwright/test/cli.js", "test", "tests/containment.spec.ts", "--output", "test-results/containment-main"], ["node_modules/@playwright/test/cli.js", "test", "tests/containment-restart.spec.ts", "--output", "test-results/containment-restart"]);
  for (const [index, args] of commands.entries()) {
    if (testing && trail && index === 1) await seedTrail();
    if (testing && insider && index === 2) await seedInsider();
    if (testing && containment && index === 4) await seedContainment();
    child = spawn(process.execPath, args, { env, stdio: [testing ? "inherit" : "ignore", "inherit", "inherit"], windowsHide: true });
    process.exitCode = await new Promise((accept, reject) => { child.once("error", reject); child.once("exit", code => accept(code ?? 1)); });
    if (process.exitCode !== 0) break;
  }
} finally {
  stop();
  await db.$disconnect();
  cleanup();
}
