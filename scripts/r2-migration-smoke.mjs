// Phase 5: Round 2 migration smoke test against a DISPOSABLE local PostgreSQL (the project's ghost404-pg-test container, 127.0.0.1:55432).
// 1) fresh database: `prisma migrate deploy` applies every migration; 2) pre-Round-2 fixture: apply migrations up to 20261120, insert Round 1 rows,
// apply the Round 2 migration, prove every Round 1 row is byte-identical; 3) `prisma migrate diff` (live DB vs schema.prisma) must be empty.
// Refuses non-local hosts. Never reads .env files; credentials are never printed.
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_URL } from "./pg-temp.mjs";

if (!["127.0.0.1", "localhost"].includes(new URL(ADMIN_URL).hostname)) throw new Error("non-local admin URL refused");
const root = process.cwd(), migrations = join(root, "prisma", "migrations");
const R2 = "20261121000000_round2", SP = "20261122000000_scoring_policy", PRE = ["20261118000000_postgres_init", "20261120000000_task_scoring_and_drafts", R2];
const names = [];
const dbUrl = name => { const u = new URL(ADMIN_URL); u.pathname = `/${name}`; return u.href; };
async function create(label) {
  const name = `ghostt_${label}_${randomBytes(3).toString("hex")}`, admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
  try { await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); } finally { await admin.$disconnect(); }
  names.push(name); return name;
}
async function applySql(url, dir) {
  const c = new PrismaClient({ datasourceUrl: url });
  try { for (const chunk of readFileSync(join(migrations, dir, "migration.sql"), "utf8").split(/;\s*\n/)) if (chunk.replace(/--.*$/gm, "").trim()) await c.$executeRawUnsafe(chunk); } finally { await c.$disconnect(); }
}
const prisma = (url, ...args) => execFileSync("npx", ["prisma", ...args], { cwd: root, env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "pipe"] });
const hash = rows => createHash("sha256").update(JSON.stringify(rows, (k, v) => typeof v === "bigint" ? v.toString() : v)).digest("hex");
const ROUND1 = ["Team", "TeamSession", "GameSession", "Submission", "AuditLog", "LoginAttempt", "TaskScore", "ChapterDraft", "InsiderAccess"];
const results = [];
const check = (name, ok, extra = "") => { results.push([name, ok]); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };

try {
  // ---- 1. fresh database through the real deploy command
  const fresh = await create("fresh"), freshUrl = dbUrl(fresh);
  const out = prisma(freshUrl, "migrate", "deploy");
  check("fresh DB: prisma migrate deploy applies all migrations", /applied|No pending/i.test(out) && out.includes(R2) && out.includes(SP), out.split("\n").filter(l => /^\d{14}_/.test(l.trim())).join(" | "));
  const c = new PrismaClient({ datasourceUrl: freshUrl });
  const tables = (await c.$queryRaw`select table_name from information_schema.tables where table_schema='public' order by 1`).map(r => r.table_name);
  const r2 = ["R2Session", "R2Finalist", "R2Submission", "R2TaskScore", "R2Draft", "R2Audit"];
  check("all six Round 2 tables exist", r2.every(t => tables.includes(t)), r2.filter(t => !tables.includes(t)).join(","));
  check("all Round 1 tables still exist", ROUND1.every(t => tables.includes(t)));
  const fks = await c.$queryRaw`select conname, confdeltype from pg_constraint where contype='f' and conname like 'R2%' order by 1`;
  check("R2 foreign keys exist with ON DELETE RESTRICT", fks.length === 4 && fks.every(f => f.confdeltype === "r"), fks.map(f => `${f.conname}:${f.confdeltype}`).join(" "));
  const idx = (await c.$queryRaw`select indexname from pg_indexes where schemaname='public' and tablename like 'R2%' order by 1`).map(r => r.indexname);
  check("R2 indexes and primary keys exist", ["R2Finalist_status_idx", "R2Submission_teamId_taskId_createdAt_idx", "R2Submission_teamId_createdAt_idx", "R2TaskScore_teamId_part_idx", "R2Audit_createdAt_idx", "R2Session_pkey", "R2TaskScore_pkey", "R2Draft_pkey"].every(i => idx.includes(i)), idx.length + " indexes");
  // Prisma Client read/write of every model
  await c.team.create({ data: { id: "S1", name: "S1", participants: "[]", codeHash: "x", variant: "A", progress: "{}" } });
  await c.r2Finalist.create({ data: { teamId: "S1", status: "active", seed: 1, snapshotDigest: "d" } });
  await c.r2Session.create({ data: { id: 1 } });
  await c.r2Submission.create({ data: { teamId: "S1", taskId: "i1.assets", awarded: 1, taskEarned: 1, criteria: "[]", answerHash: "h", answer: "{}", contentVersion: "t" } });
  await c.r2TaskScore.create({ data: { teamId: "S1", taskId: "i1.assets", part: "A", earned: 1, max: 3, criteria: "[]" } });
  await c.r2Draft.create({ data: { teamId: "S1", taskId: "i1.assets", data: "{}" } });
  await c.r2Audit.create({ data: { actor: "t", action: "t", detail: "{}" } });
  check("Prisma Client reads and writes all six models", (await c.r2Finalist.count()) + (await c.r2Session.count()) + (await c.r2Submission.count()) + (await c.r2TaskScore.count()) + (await c.r2Draft.count()) + (await c.r2Audit.count()) === 6);
  let blocked = false; try { await c.team.delete({ where: { id: "S1" } }); } catch { blocked = true; }
  check("deleting a Team that is a finalist is blocked (RESTRICT)", blocked);
  let orphan = false; try { await c.r2Draft.create({ data: { teamId: "NOPE", taskId: "x", data: "{}" } }); } catch { orphan = true; }
  check("a Round 2 row for a non-finalist is rejected by the database", orphan);
  await c.$disconnect();
  const diff = prisma(freshUrl, "migrate", "diff", "--from-url", freshUrl, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code").trim();
  check("live schema matches prisma/schema.prisma (empty migrate diff)", /No difference/i.test(diff) || diff === "", diff.slice(0, 120));

  // ---- 2. pre-Round-2 database keeps its Round 1 data
  const pre = await create("pre"), preUrl = dbUrl(pre);
  for (const d of PRE) await applySql(preUrl, d);
  const p = new PrismaClient({ datasourceUrl: preUrl });
  // raw SQL: the generated client already knows the NEW columns, which do not exist in this pre-policy database yet
  const x = sql => p.$executeRawUnsafe(sql);
  for (const i of ["A", "B"]) await x(`INSERT INTO "Team" (id, name, participants, "codeHash", variant, progress) VALUES ('T${i}', 'Team ${i}', '["x"]', 'hash${i}', '${i}', '{"chapters":[]}')`);
  await x(`INSERT INTO "GameSession" (id, "startsAt", deadline) VALUES (1, '2026-11-20T10:00:00Z', '2026-11-20T11:00:00Z')`);
  await x(`INSERT INTO "Submission" (id, "teamId", chapter, accepted, reason, answer, "scoringVersion", awarded, "chapterRaw", criteria) VALUES ('s1', 'TA', 0, false, 'partial', '{}', 2, 5, 5, '[]')`);
  await x(`INSERT INTO "TaskScore" ("teamId", chapter, "taskId", earned, max, criteria, "updatedAt") VALUES ('TA', 0, 'inbox.entry', 2, 6, '["inbox.entry:emailId"]', now())`);
  await x(`INSERT INTO "ChapterDraft" ("teamId", chapter, "taskId", data, "updatedAt") VALUES ('TA', 0, 'inbox.entry', '{"a":1}', now())`);
  await x(`INSERT INTO "AuditLog" (id, actor, action, detail) VALUES ('a1', 'organizer', 'qualification-confirmed', '{"digest":"abcdef12","top10":["TA"],"standby":["TB"]}')`);
  await x(`INSERT INTO "TeamSession" ("tokenHash", "teamId", role, "expiresAt") VALUES ('tok', 'TA', 'team', '2030-01-01')`);
  const colsOf = async t => (await p.$queryRawUnsafe(`select column_name from information_schema.columns where table_schema = 'public' and table_name = '${t}' order by ordinal_position`)).map(r => `"${r.column_name}"`).join(",");
  const cols = Object.fromEntries(await Promise.all(ROUND1.map(async t => [t, await colsOf(t)])));
  const snap = async () => { const out = {}; for (const t of ROUND1) out[t] = hash(await p.$queryRawUnsafe(`select ${cols[t]} from "${t}" order by 1,2`)); return out; };
  const before = await snap();
  await applySql(preUrl, SP);
  const after = await snap();
  check("pre-policy DB: every pre-existing Round 1 column of every row is unchanged after the scoring-policy migration", JSON.stringify(before) === JSON.stringify(after), ROUND1.filter(t => before[t] !== after[t]).join(","));
  const g = await p.gameSession.findUniqueOrThrow({ where: { id: 1 } }), ts = await p.taskScore.findFirstOrThrow(), sub = await p.submission.findFirstOrThrow();
  check("pre-policy DB: a round that already started keeps scoringPolicy NULL (legacy union-v0, never silently upgraded)", g.startsAt !== null && g.scoringPolicy === null);
  check("pre-policy DB: historic TaskScore/Submission rows get attempts=0 and NULL taskId/answerHash", ts.attempts === 0 && sub.taskId === null && sub.answerHash === null && sub.scoringVersion === 2);
  check("pre-policy DB: Round 2 tables present and empty", (await p.r2Finalist.count()) === 0 && (await p.r2Session.count()) === 0);
  await p.$disconnect();
} catch (e) { check("smoke test ran without an exception", false, String(e.message ?? e).split("\n")[0].slice(0, 200)); }
finally {
  const admin = new PrismaClient({ datasourceUrl: ADMIN_URL });
  for (const n of names) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${n}" WITH (FORCE)`).catch(() => undefined);
  await admin.$disconnect();
}
const failed = results.filter(r => !r[1]).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
