// Database side of the final event credentials: preflight, import (dry-run by default), verification. Takes a PrismaClient so the same code serves the CLI, the tests and any number of
// SEPARATE databases (Render preview, college LAN). It never prints or stores a plaintext password; the database only receives salted scrypt hashes made by the application's own hashPassword.
//   * dry-run unless apply is true AND the operator names the exact database (confirmDatabase)
//   * never overwrites: an existing account whose password/kind/group/code differs is a CONFLICT and nothing is written
//   * idempotent: re-running against a provisioned database verifies and writes nothing
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine.ts";
import { GROUPS, fingerprint, validateBundle } from "./credentials-lib.mjs";

const REQUIRED_TABLES = ["Team", "TeamProvision", "InsiderAccess", "InsiderGroupCode", "InsiderGroupMember", "AuditLog", "GameSession"];
const REQUIRED_MIGRATIONS = ["20261128000000_insider_shared_pairs", "20261129000000_team_provision"];
const fragment = part => `${part}-${randomBytes(12).toString("hex").toUpperCase().match(/.{6}/g).join("-")}`;

/** host:port/database with no user name or password; and a coarse environment label. */
export function describeUrl(url) {
  try {
    const u = new URL(url), host = u.hostname, local = /^(localhost|127\.|\[?::1\]?$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    return { target: `${host}${u.port ? `:${u.port}` : ""}${u.pathname}`, environment: local ? "local / LAN" : /render\.com|neon\.tech|onrender/.test(host) ? "hosted (Render / Neon)" : "remote" };
  } catch { return { target: "(unparseable url)", environment: "unknown" }; }
}

export async function schemaStatus(db) {
  const missing = [];
  for (const t of REQUIRED_TABLES) { const [{ r }] = await db.$queryRawUnsafe(`select to_regclass('public."${t}"')::text as r`); if (!r) missing.push(t); }
  let applied = null, missingMigrations = [];
  const [{ r }] = await db.$queryRawUnsafe(`select to_regclass('public."_prisma_migrations"')::text as r`);
  if (r) { applied = (await db.$queryRawUnsafe(`select migration_name from "_prisma_migrations" where finished_at is not null`)).map(x => x.migration_name); missingMigrations = REQUIRED_MIGRATIONS.filter(m => !applied.includes(m)); }
  return { ok: missing.length === 0 && missingMigrations.length === 0, missingTables: missing, missingMigrations, migrationTable: !!r };
}

export async function inspect(db, bundle) {
  validateBundle(bundle);
  const [{ name: database }] = await db.$queryRawUnsafe("select current_database() as name");
  const schema = await schemaStatus(db);
  const base = { database, schema, bundleId: bundle.bundleId, fingerprint: fingerprint(bundle) };
  if (!schema.ok) return { ...base, classification: "schema-missing", conflicts: [], plan: { create: [], attach: [], verify: [], codes: [], members: [] } };
  const ids = bundle.teams.map(t => t.id);
  const [teamCount, existing, codes, members, session, submissions, taskScores] = await Promise.all([
    db.team.count(), db.team.findMany({ where: { id: { in: ids } }, include: { provision: true } }),
    db.insiderGroupCode.findMany(), db.insiderGroupMember.findMany({ where: { teamId: { in: ids } } }),
    db.gameSession.findUnique({ where: { id: 1 } }), db.submission.count(), db.taskScore.count(),
  ]);
  const conflicts = [], have = new Map(existing.map(t => [t.id, t])), memberOf = new Map(members.map(m => [m.teamId, m]));
  for (const t of bundle.teams) {
    const row = have.get(t.id); if (!row) continue;
    if (!verifyPassword(t.password, row.codeHash)) conflicts.push(`${t.id}: the existing account has a DIFFERENT password (not overwritten)`);
    if (row.variant !== t.variant) conflicts.push(`${t.id}: the existing account has a different case variant`);
    if (row.provision && (row.provision.kind !== t.kind || row.provision.slot !== t.slot)) conflicts.push(`${t.id}: the existing roster record has a different kind or slot`);
    if (row.provision && row.provision.bundleId !== bundle.bundleId) conflicts.push(`${t.id}: provisioned from a different bundle (${row.provision.bundleId})`);
    const m = memberOf.get(t.id); if (t.kind === "primary" && m && m.group !== t.group) conflicts.push(`${t.id}: the existing Insider group differs`);
  }
  for (const c of codes) { const b = bundle.fragments[c.group]; if (!b || b.private !== c.privateCode || b.public !== c.publicCode) conflicts.push(`Insider group ${c.group}: the database already holds DIFFERENT shared codes (not overwritten)`); }
  const plan = {
    create: bundle.teams.filter(t => !have.has(t.id)).map(t => t.id),
    attach: bundle.teams.filter(t => have.get(t.id) && !have.get(t.id).provision).map(t => t.id), // account verified but not yet part of the roster record
    verify: bundle.teams.filter(t => have.has(t.id)).map(t => t.id),
    codes: GROUPS.filter(g => !codes.some(c => c.group === g)),
    members: bundle.teams.filter(t => t.kind === "primary" && !memberOf.has(t.id)).map(t => t.id),
  };
  const classification = conflicts.length ? "conflict" : plan.verify.length === 0 ? "fresh" : plan.verify.length === ids.length && !plan.attach.length && !plan.codes.length && !plan.members.length ? "already-provisioned" : "partial";
  return { ...base, classification, conflicts, plan, teamCount, existingBundleTeams: existing.length, round: !session?.startsAt ? "not started" : session.endedAt ? "ended" : "started", submissions, taskScores, insiderCodes: codes.length };
}

/** apply=false: dry-run (default). apply=true needs confirmDatabase === the connected database's name. Returns { status, info, written }. Never throws for a conflict. */
export async function importBundle(db, bundle, { apply = false, confirmDatabase } = {}) {
  const info = await inspect(db, bundle);
  if (info.classification === "schema-missing") return { status: "schema-missing", info, written: false };
  if (info.classification === "conflict") return { status: "conflict", info, written: false };
  const p = info.plan, work = p.create.length + p.attach.length + p.codes.length + p.members.length;
  if (work === 0) return { status: "verified", info, written: false }; // idempotent: nothing to do
  if (!apply) return { status: "dry-run", info, written: false };
  if (confirmDatabase !== info.database) throw new Error(`Refusing to write: --confirm-database must equal the connected database name ("${info.database}").`);
  const byId = new Map(bundle.teams.map(t => [t.id, t])), hashes = new Map(p.create.map(id => [id, hashPassword(byId.get(id).password)])); // hashed before the transaction (scrypt is slow)
  await db.$transaction(async tx => {
    for (const id of p.create) {
      const t = byId.get(id);
      await tx.team.create({ data: { id, name: t.name, participants: "[]", codeHash: hashes.get(id), variant: t.variant, progress: JSON.stringify(initialProgress()) } });
    }
    for (const id of [...p.create, ...p.attach]) { const t = byId.get(id); await tx.teamProvision.create({ data: { teamId: id, kind: t.kind, slot: t.slot, bundleId: bundle.bundleId } }); }
    for (const g of p.codes) await tx.insiderGroupCode.create({ data: { group: g, privateCode: bundle.fragments[g].private, publicCode: bundle.fragments[g].public } });
    for (const id of p.members) {
      await tx.insiderAccess.upsert({ where: { teamId: id }, create: { teamId: id, fragmentA: fragment("A"), fragmentB: fragment("B") }, update: {} });
      await tx.insiderGroupMember.create({ data: { teamId: id, group: byId.get(id).group } });
    }
    await tx.auditLog.create({ data: { actor: "organizer-cli", action: "credentials-provisioned", detail: JSON.stringify({ bundleId: bundle.bundleId, fingerprint: info.fingerprint, created: p.create.length, attached: p.attach.length, codes: p.codes.length, members: p.members.length }) } });
  }, { isolationLevel: "Serializable", timeout: 60_000 });
  return { status: "applied", info, written: true };
}

/** Checks every printed credential against the database exactly as the login does (scrypt hash compare), plus roster, groups and shared codes. Reports problems without secrets. */
export async function verifyDatabase(db, bundle) {
  validateBundle(bundle);
  const problems = [], ids = bundle.teams.map(t => t.id);
  const [rows, members, codes] = await Promise.all([db.team.findMany({ where: { id: { in: ids } }, include: { provision: true } }), db.insiderGroupMember.findMany({ where: { teamId: { in: ids } } }), db.insiderGroupCode.findMany()]);
  const rowOf = new Map(rows.map(r => [r.id, r])), memberOf = new Map(members.map(m => [m.teamId, m]));
  let passwordsOk = 0;
  for (const t of bundle.teams) {
    const r = rowOf.get(t.id);
    if (!r) { problems.push(`${t.id}: missing`); continue; }
    if (verifyPassword(t.password, r.codeHash)) passwordsOk++; else problems.push(`${t.id}: the printed password does NOT match`);
    if (!r.provision || r.provision.kind !== t.kind || r.provision.slot !== t.slot) problems.push(`${t.id}: roster record missing or different`);
    const m = memberOf.get(t.id);
    if (t.kind === "primary" && (!m || m.group !== t.group)) problems.push(`${t.id}: Insider group is not ${t.group}`);
  }
  for (const g of GROUPS) { const c = codes.find(x => x.group === g); if (!c || c.privateCode !== bundle.fragments[g].private || c.publicCode !== bundle.fragments[g].public) problems.push(`Insider group ${g}: shared codes differ from the bundle`); }
  return { ok: problems.length === 0, checked: ids.length, passwordsOk, groups: Object.fromEntries(GROUPS.map(g => [g, bundle.teams.filter(t => t.kind === "primary" && memberOf.get(t.id)?.group === g).length])), problems };
}

/** Reserves that were activated in the event database, with the group they inherited (so a reprinted reserve card can carry the right private fragment). */
export async function reserveActivations(db, bundle) {
  const out = {};
  for (const t of bundle.teams.filter(x => x.kind === "reserve")) {
    const m = await db.insiderGroupMember.findUnique({ where: { teamId: t.id } }), p = await db.teamProvision.findUnique({ where: { teamId: t.id } });
    if (p?.activatedAt && m) out[t.id] = { group: m.group };
  }
  return out;
}
