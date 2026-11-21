// Fail-closed safety rules for scripts/load-test.mjs. Kept separate so they are unit-tested (tests/load-safety.test.ts).
// Principles: remote mode only ever targets a DISPOSABLE, explicitly named, verified-empty test database; cleanup deletes
// ONLY rows this run created, by exact id/key/token (never by time window, never unfiltered); no broad-delete fallback exists.
import { digest } from "../src/lib/password.mjs";

export const TEST_MARK = "loadtest";
const FORBIDDEN_DB_WORDS = /preview|prod|event|live|round1|real/i;

/** Removes connection strings and any known secret values from text destined for logs or errors. */
export function redact(text, secrets = []) {
  let out = String(text ?? "").replace(/postgres(?:ql)?:\/\/[^\s'")]+/gi, "[redacted-db-url]");
  for (const s of secrets) if (s && String(s).length >= 4) out = out.split(String(s)).join("[redacted]");
  return out.replace(/(password|passwd|pwd|secret|token)(["'\s:=]+)[^\s"',;]+/gi, "$1$2[redacted]");
}

export function databaseName(url) {
  let u; try { u = new URL(url); } catch { throw new Error("database URL is not a valid URL (value withheld)"); }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error("database URL must be postgresql://");
  return decodeURIComponent(u.pathname.replace(/^\//, ""));
}

/** Throws unless every condition for touching a hosted service + database is explicitly satisfied. Never echoes secrets. */
export function assertRemoteTarget({ origin, databaseUrl, adminCode, argv = [], env = {} }) {
  let o; try { o = new URL(origin); } catch { throw new Error("remote origin is not a valid URL"); }
  if (o.protocol !== "https:") throw new Error("remote origin must be https");
  if (/^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(o.hostname)) throw new Error("remote origin must be a hosted DNS name, not a local/IP address");
  if (!o.hostname.toLowerCase().includes(TEST_MARK)) throw new Error(`remote origin host must contain "${TEST_MARK}" (a dedicated test service, never the preview or event service)`);
  if (!argv.includes("--yes-remote")) throw new Error("remote mode requires --yes-remote");
  if (!argv.includes("--authorize-round-control")) throw new Error("remote mode starts and then expires the round on the TEST service: pass --authorize-round-control to authorize that");
  if (env.GHOST_LOAD_ENV !== "disposable-loadtest") throw new Error("set GHOST_LOAD_ENV=disposable-loadtest to identify this as a disposable test environment");
  if (!adminCode) throw new Error("GHOST_LOAD_ADMIN_CODE is not set");
  if (!databaseUrl) throw new Error("GHOST_LOAD_DATABASE_URL is not set");
  const name = databaseName(databaseUrl);
  if (!new RegExp(`^[a-z0-9_]*${TEST_MARK}[a-z0-9_]*$`, "i").test(name)) throw new Error(`target database name must contain "${TEST_MARK}" (disposable test database)`);
  if (FORBIDDEN_DB_WORDS.test(name)) throw new Error("target database name looks like a preview/event database; refusing");
  if (env.GHOST_LOAD_TARGET_DB !== name) throw new Error("GHOST_LOAD_TARGET_DB must equal the target database name (typed confirmation of identity)");
  return { database: name, host: o.hostname };
}

/** The target must hold no data at all (so nothing here can be real) and no started round. */
export async function assertEmpty(db) {
  const counts = {
    teams: await db.team.count(), insiderAccess: await db.insiderAccess.count(), sessions: await db.teamSession.count(),
    submissions: await db.submission.count(), auditLogs: await db.auditLog.count(), loginAttempts: await db.loginAttempt.count(),
  };
  const round = await db.gameSession.findUnique({ where: { id: 1 } });
  const dirty = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`);
  if (round && (round.startsAt || round.deadline || round.endedAt)) dirty.push("round already started/ended");
  if (dirty.length) throw new Error(`target database is not empty (${dirty.join(", ")}); refusing to run`);
}

/** Tracks every row this run creates so cleanup can be exact. */
export class Scope {
  teamIds = new Set();
  adminTokens = new Set(); // raw cookie values of organizer sessions created by this run (hashed on cleanup)
  round = null; // { original, last } once this run has touched the round row
  addTeam(id) { this.teamIds.add(id); }
}

/** The ONLY way the harness changes the round: remembers the original state and the last value it wrote. */
export async function writeRound(db, scope, { startsAt, deadline }) {
  if (!scope.round) scope.round = { original: await db.gameSession.findUnique({ where: { id: 1 } }), last: null };
  await db.gameSession.upsert({ where: { id: 1 }, create: { id: 1, startsAt, deadline, scoringPolicy: "best-v1" }, update: { startsAt, deadline, endedAt: null, scoringPolicy: "best-v1" } }); // rehearse under the approved scoring policy
  scope.round.last = { startsAt, deadline };
}

/** Exact-scope cleanup. Never throws; reports which steps failed. No unfiltered or time-window delete exists here. */
export async function cleanup(db, scope) {
  const ids = [...scope.teamIds], failed = [];
  const step = async (name, fn) => { try { await fn(); } catch { failed.push(name); } };
  if (ids.length) {
    await step("submissions", () => db.submission.deleteMany({ where: { teamId: { in: ids } } }));
    await step("auditLogs", () => db.auditLog.deleteMany({ where: { actor: { in: ids } } }));
    const keys = [...ids.map(id => digest(`team:${id}`)), digest("admin:organizer")];
    await step("loginAttempts", () => db.loginAttempt.deleteMany({ where: { key: { in: keys } } }));
  }
  const tokens = [...scope.adminTokens].map(t => digest(t));
  if (tokens.length) await step("adminSessions", () => db.teamSession.deleteMany({ where: { tokenHash: { in: tokens }, role: "admin" } }));
  if (ids.length) await step("teams", () => db.team.deleteMany({ where: { id: { in: ids } } })); // sessions + insider access cascade
  const r = scope.round;
  if (r?.last) { // compare-and-restore: only touches the round row if it still holds exactly what this run wrote
    const was = { id: 1, startsAt: r.last.startsAt, deadline: r.last.deadline };
    await step("round", () => r.original
      ? db.gameSession.updateMany({ where: was, data: { startsAt: r.original.startsAt, deadline: r.original.deadline, endedAt: r.original.endedAt } })
      : db.gameSession.deleteMany({ where: was }));
  }
  return { ok: failed.length === 0, failed };
}
