// Consistent online SQLite backup / verified restore (no extra dependencies; uses node:sqlite).
//   node scripts/db-backup.mjs backup  <database.db> [backups-dir]      -> backups/ghost-<UTC>.db (VACUUM INTO: safe while the app runs)
//   node scripts/db-backup.mjs verify  <backup.db>                      -> integrity + row counts
//   node scripts/db-backup.mjs restore <backup.db> <database.db> --yes  -> STOP THE APP FIRST; current DB is kept as <db>.before-restore-<UTC>
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
const [cmd, a, b] = process.argv.slice(2);
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "Z");
const fail = m => { console.error(m); process.exit(1); };
function inspect(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const check = db.prepare("PRAGMA integrity_check").get().integrity_check;
    if (check !== "ok") fail(`Integrity check FAILED for ${file}: ${check}`);
    const n = t => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    return { teams: n("Team"), submissions: n("Submission"), audit: n("AuditLog"), sessions: n("GameSession") };
  } finally { db.close(); }
}
if (cmd === "backup") {
  if (!a || !existsSync(a)) fail("Usage: backup <database.db> [backups-dir]");
  const dir = resolve(b ?? "backups"); mkdirSync(dir, { recursive: true });
  const out = join(dir, `ghost-${stamp()}.db`);
  if (existsSync(out)) fail(`${out} already exists`);
  const db = new DatabaseSync(a);
  try { db.exec("PRAGMA busy_timeout=10000"); db.exec(`VACUUM INTO '${out.replaceAll("'", "''")}'`); } finally { db.close(); }
  console.log(`Backup written: ${out}`, inspect(out));
} else if (cmd === "verify") {
  if (!a || !existsSync(a)) fail("Usage: verify <backup.db>");
  console.log("Backup OK", inspect(a));
} else if (cmd === "restore") {
  if (!a || !b || !existsSync(a)) fail("Usage: restore <backup.db> <database.db> --yes");
  if (!process.argv.includes("--yes")) fail("Restore replaces the live database file. Stop the app, then re-run with --yes.");
  inspect(a);
  if (existsSync(b)) { const keep = `${b}.before-restore-${stamp()}`; copyFileSync(b, keep); console.log(`Current database preserved as ${keep}`); }
  for (const ext of ["-wal", "-shm"]) if (existsSync(b + ext)) rmSync(b + ext); // stale WAL must not replay over the restored file
  mkdirSync(dirname(resolve(b)), { recursive: true });
  copyFileSync(a, b);
  console.log(`Restored ${basename(a)} -> ${b}`, inspect(b));
} else fail("Commands: backup | verify | restore");
