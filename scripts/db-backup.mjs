// Logical PostgreSQL backup / verify / restore for the Ghost_404 tables (works against Neon or any PostgreSQL).
//   node scripts/db-backup.mjs backup [dir]                 -> dir/ghost-<UTC stamp>.json (default ./backups); read-only, safe while the app runs
//   node scripts/db-backup.mjs verify <file>                -> structure + counts, no database access
//   node scripts/db-backup.mjs restore <file> --yes         -> only into a database with NO teams
//   node scripts/db-backup.mjs restore <file> --yes --replace  -> replaces ALL rows (asks for the exact database name via GHOST_CONFIRM_DB)
// Connection: DIRECT_URL (preferred) or DATABASE_URL. The file holds team data and password hashes: never commit or publish it.
import { PrismaClient } from "@prisma/client";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const [command, a] = process.argv.slice(2);
const flag = name => process.argv.includes(name);
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
// NOTE: this logical tool covers the core tables only. For the EVENT database use pg_dump -Fc (docs/ghost404-credential-provisioning.md): it also keeps the roster, Insider group/code tables, scores and Round 2 data.
const TABLES = ["team", "teamProvision", "insiderAccess", "insiderGroupCode", "insiderGroupMember", "teamSession", "gameSession", "submission", "auditLog", "loginAttempt"];
const dateKeys = new Set(["provisionedAt", "activatedAt", "withdrawnAt", "assignedAt", "solvedAt", "unlockedAt", "expiresAt", "startsAt", "deadline", "endedAt", "createdAt", "windowStart"]);
const revive = rows => rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, dateKeys.has(k) && typeof v === "string" ? new Date(v) : v])));
const need = () => { if (!url) throw new Error("Set DIRECT_URL or DATABASE_URL."); return new PrismaClient({ datasourceUrl: url }); };

async function backup(dir = "backups") {
  const db = need();
  try {
    const data = {};
    await db.$transaction(async tx => { for (const t of TABLES) data[t] = await tx[t].findMany(); }, { isolationLevel: "RepeatableRead" }); // one consistent snapshot
    const body = { format: "ghost404-backup-1", createdAt: new Date().toISOString(), counts: Object.fromEntries(TABLES.map(t => [t, data[t].length])), data };
    const text = JSON.stringify(body);
    mkdirSync(dir, { recursive: true });
    const file = resolve(join(dir, `ghost-${body.createdAt.replace(/[:.]/g, "-")}.json`));
    writeFileSync(file, text, { flag: "wx" }); // never overwrite
    console.log(`Backup written: ${file}\nteams: ${body.counts.team}, submissions: ${body.counts.submission}, audit: ${body.counts.auditLog}, sha256: ${createHash("sha256").update(text).digest("hex").slice(0, 16)}`);
  } finally { await db.$disconnect(); }
}
function load(file) {
  const body = JSON.parse(readFileSync(file, "utf8"));
  if (body.format !== "ghost404-backup-1") throw new Error("Not a Ghost_404 backup file");
  for (const t of TABLES) if (!Array.isArray(body.data[t]) || body.data[t].length !== body.counts[t]) throw new Error(`Backup is damaged: table ${t} count mismatch`);
  return body;
}
function verify(file) {
  const body = load(file);
  console.log(`Backup OK (${body.createdAt})\n${TABLES.map(t => `${t}: ${body.counts[t]}`).join("\n")}`);
}
async function restore(file) {
  if (!flag("--yes")) throw new Error("Restore changes the database. Re-run with --yes after stopping the application.");
  const body = load(file), db = need();
  try {
    const [{ name }] = await db.$queryRawUnsafe("SELECT current_database() AS name");
    const existing = await db.team.count();
    if (existing > 0 && !flag("--replace")) throw new Error(`Database "${name}" already holds ${existing} teams. Restore only into an empty database, or pass --replace (and set GHOST_CONFIRM_DB=${name}).`);
    if (existing > 0 && process.env.GHOST_CONFIRM_DB !== name) throw new Error(`--replace needs GHOST_CONFIRM_DB=${name} to confirm the target database.`);
    await db.$transaction(async tx => {
      for (const t of [...TABLES].reverse()) await tx[t].deleteMany();
      for (const t of TABLES) if (body.data[t].length) await tx[t].createMany({ data: revive(body.data[t]) });
    }, { timeout: 120_000, maxWait: 30_000 });
    console.log(`Restored ${body.counts.team} teams into "${name}".`);
  } finally { await db.$disconnect(); }
}
try {
  if (command === "backup") await backup(a);
  else if (command === "verify" && a) verify(a);
  else if (command === "restore" && a) await restore(a);
  else { console.error("Usage: backup [dir] | verify <file> | restore <file> --yes [--replace]"); process.exit(2); }
} catch (error) { console.error(error.message); process.exit(1); }
