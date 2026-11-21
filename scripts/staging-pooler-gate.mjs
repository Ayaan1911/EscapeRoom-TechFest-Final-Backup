// FIRST HOSTED GATE: does the per-team transaction locking (src/lib/db.ts teamTx) behave correctly through Neon's POOLED connection (PgBouncer, transaction mode)?
//   node scripts/staging-pooler-gate.mjs --local                      (rehearse against the disposable local PostgreSQL; proves the gate itself works)
//   node scripts/staging-pooler-gate.mjs                              (hosted: needs the env below; creates and drops only its own _gate_* tables)
// Hosted env (never printed, never committed): GHOST_GATE_DATABASE_URL = the POOLED Neon URL of the EMPTY staging database,
//   GHOST_LOAD_TARGET_DB = its name (must contain "loadtest"), GHOST_LOAD_ENV=disposable-loadtest.
// PASS criteria (all must hold): (A) no lost update when 5 concurrent transactions per team take pg_advisory_xact_lock(hashtext(team)) -> every counter equals 5;
//   (B) the control without the lock DOES lose updates (proves the probe can detect a broken pooler); (C) a FOR SHARE row lock blocks a conflicting UPDATE until commit;
//   (D) 50 teams x 1 transaction in parallel: zero errors; (E) the ordinary Prisma pooled connection works with the app's settings. Exit code 1 on any FAIL.
import { PrismaClient } from "@prisma/client";

const local = process.argv.includes("--local");
const log = (ok, name, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const results = [];
let url, temp = null;
if (local) {
  const { createTempDatabase } = await import("./pg-temp.mjs");
  temp = await createTempDatabase("gate"); url = temp.url;
} else {
  url = process.env.GHOST_GATE_DATABASE_URL;
  const target = process.env.GHOST_LOAD_TARGET_DB ?? "";
  if (!url || process.env.GHOST_LOAD_ENV !== "disposable-loadtest" || !/loadtest/i.test(target)) { console.error("Refusing: set GHOST_GATE_DATABASE_URL, GHOST_LOAD_ENV=disposable-loadtest and GHOST_LOAD_TARGET_DB (a name containing 'loadtest')."); process.exit(2); }
  const u = new URL(url);
  if (!u.pathname.slice(1).toLowerCase().includes("loadtest") || u.pathname.slice(1) !== target) { console.error("Refusing: the database in the URL is not the declared loadtest database."); process.exit(2); }
  if (/ep-aged-sound-ao2lwi7k/.test(url)) { console.error("Refusing: that host is the existing preview database."); process.exit(2); }
}
const sep = url.includes("?") ? "&" : "?";
const db = new PrismaClient({ datasourceUrl: `${url}${/connection_limit=/.test(url) ? "" : `${sep}connection_limit=${process.env.DB_POOL_SIZE ?? 5}`}`, transactionOptions: { maxWait: 15_000, timeout: 15_000 } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS _gate_counter (team TEXT PRIMARY KEY, n INT NOT NULL)`);
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS _gate_row (id INT PRIMARY KEY, v INT NOT NULL)`);
  await db.$executeRawUnsafe(`DELETE FROM _gate_counter`); await db.$executeRawUnsafe(`DELETE FROM _gate_row`);
  const teams = Array.from({ length: 20 }, (_, i) => `gate-${i}`);
  for (const t of teams) await db.$executeRawUnsafe(`INSERT INTO _gate_counter (team, n) VALUES ('${t}', 0)`);
  const bump = (team, locked) => db.$transaction(async tx => {
    if (locked) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${team}))`;
    const [{ n }] = await tx.$queryRaw`SELECT n FROM _gate_counter WHERE team = ${team}`;
    await sleep(15); // widen the read-modify-write window
    await tx.$executeRaw`UPDATE _gate_counter SET n = ${n + 1} WHERE team = ${team}`;
  }, { isolationLevel: "ReadCommitted" });
  const counts = async () => Object.fromEntries((await db.$queryRawUnsafe(`SELECT team, n FROM _gate_counter`)).map(r => [r.team, r.n]));

  // (B) control first: WITHOUT the lock the probe must lose updates (otherwise it could not detect a pooler that drops locks)
  await Promise.all(teams.flatMap(t => Array.from({ length: 5 }, () => bump(t, false))));
  const control = await counts(), lost = teams.filter(t => control[t] !== 5).length;
  log(lost > 0, "(B) control without the lock loses updates (the probe can see a broken lock)", `${lost}/20 teams lost updates`);
  await db.$executeRawUnsafe(`UPDATE _gate_counter SET n = 0`);

  // (A) the real pattern: per-team advisory xact lock, 100 concurrent transactions
  let errors = 0; await Promise.all(teams.flatMap(t => Array.from({ length: 5 }, () => bump(t, true).catch(() => { errors++; }))));
  const locked = await counts(), bad = teams.filter(t => locked[t] !== 5);
  log(bad.length === 0 && errors === 0, "(A) per-team pg_advisory_xact_lock: no lost update across 100 concurrent transactions", `errors=${errors}, wrong counters=${bad.length}`);

  // (C) FOR SHARE blocks a conflicting UPDATE until the sharing transaction commits (the organizer-stop vs submission guarantee)
  await db.$executeRawUnsafe(`INSERT INTO _gate_row (id, v) VALUES (1, 0)`);
  let updateDoneAt = 0, commitAt = 0;
  const holder = db.$transaction(async tx => { await tx.$queryRaw`SELECT 1 FROM _gate_row WHERE id = 1 FOR SHARE`; await sleep(800); commitAt = Date.now(); }, { isolationLevel: "ReadCommitted" });
  await sleep(200);
  const updater = db.$executeRawUnsafe(`UPDATE _gate_row SET v = 1 WHERE id = 1`).then(() => { updateDoneAt = Date.now(); });
  await Promise.all([holder, updater]);
  log(updateDoneAt >= commitAt, "(C) FOR SHARE blocks a conflicting UPDATE until commit", `update finished ${updateDoneAt - commitAt} ms after the share holder committed`);

  // (D) 50 teams, one transaction each, in parallel (the submission storm shape)
  const t0 = Date.now(); let e50 = 0; const lat = [];
  await Promise.all(Array.from({ length: 50 }, (_, i) => { const s = Date.now(); return bump(teams[i % 20], true).catch(() => { e50++; }).then(() => lat.push(Date.now() - s)); }));
  lat.sort((a, b) => a - b);
  log(e50 === 0, "(D) 50 parallel locked transactions complete without error", `p50=${lat[25]}ms p99=${lat[49]}ms wall=${Date.now() - t0}ms`);

  // (E) the app's own pooled settings work for a simple round trip
  const [{ ok }] = await db.$queryRaw`SELECT 1 AS ok`; log(ok === 1, "(E) pooled connection round trip");
} catch (e) { log(false, "gate ran without an exception", String(e.message ?? e).split("\n")[0].slice(0, 200)); }
finally {
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS _gate_counter`).catch(() => undefined); await db.$executeRawUnsafe(`DROP TABLE IF EXISTS _gate_row`).catch(() => undefined);
  await db.$disconnect(); await temp?.drop();
}
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed -> ${failed ? "GATE FAILED: release blocked, do not continue the rehearsal" : "GATE PASSED"}`);
process.exit(failed ? 1 : 0);
