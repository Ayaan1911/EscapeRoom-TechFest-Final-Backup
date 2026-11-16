import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine.ts";

const testing = process.argv.includes("--test");
const origin = new URL(testing ? "http://127.0.0.1:3000" : process.env.DEMO_ORIGIN ?? "http://127.0.0.1:3000");
assert.equal(origin.protocol, "http:", "The local demo uses HTTP; deployed production must use HTTPS");
assert.match(origin.hostname, /^[a-z\d.:-]+$/i);
assert.equal(origin.pathname, "/");
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash);
const folder = mkdtempSync(join(tmpdir(), "ghost-inbox-demo-"));
const databaseUrl = `file:${join(folder, "test.db").replaceAll("\\", "/")}`;
const code = randomBytes(18).toString("hex");
const env = { ...process.env, DATABASE_URL: databaseUrl, ADMIN_ACCESS_HASH: hashPassword(code), APP_ORIGIN: origin.origin, GHOST_E2E_TEAM_ID: "DEMO-A", GHOST_E2E_TEAM_CODE: code, GHOST_E2E_ADMIN_CODE: code, GHOST_E2E_INBOX: "1", ...(testing ? { CI: "1" } : {}) };
const db = new PrismaClient({ datasourceUrl: databaseUrl });
let child;
function stop() {
  if (!child?.pid || child.exitCode !== null) return;
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
try {
  assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
  for (const sql of readFileSync(new URL("../prisma/migrations/202611170001_engine/migration.sql", import.meta.url), "utf8").split(";").filter(value => value.trim())) await db.$executeRawUnsafe(sql);
  for (const variant of ["A", "B", "C"]) await db.team.create({ data: { id: `DEMO-${variant}`, name: `Inbox demo ${variant}`, participants: JSON.stringify(["Investigator One", "Investigator Two", "Investigator Three"]), codeHash: hashPassword(code), variant, progress: JSON.stringify(initialProgress()) } });
  await db.$disconnect();
  if (testing) console.log("Browser verification uses a fresh temporary database and generated test-only credentials.");
  else console.log(`Temporary Chapter 1 demo: ${origin.origin}\nTeams: DEMO-A, DEMO-B, DEMO-C\nOrganizer: ${origin.origin}/login?role=admin\nGenerated demo-only access code for teams and organizer: ${code}\nStart Round 1 as organizer, then investigate as a team. Ctrl+C removes this temporary database. Existing .env and development data are untouched.`);
  const args = testing ? ["node_modules/@playwright/test/cli.js", "test"] : ["node_modules/next/dist/bin/next", "dev", "--hostname", origin.hostname, "--port", origin.port || "80"];
  child = spawn(process.execPath, args, { env, stdio: [testing ? "inherit" : "ignore", "inherit", "inherit"], windowsHide: true });
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  // Own Ctrl+C input on Windows so npm cannot terminate the process tree before cleanup.
  if (!testing && process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on("data", data => { if (data.includes(3)) interrupt(); });
  }
  process.exitCode = await new Promise((accept, reject) => { child.once("error", reject); child.once("exit", code => accept(code ?? 1)); });
} finally {
  stop();
  await db.$disconnect();
  cleanup();
}
