import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { ADMIN_URL, createTempDatabase } from "../scripts/pg-temp.mjs";
import { hashPassword, verifyPassword } from "../src/lib/password.mjs";
import { generateBundle, type Bundle } from "../scripts/credentials-lib.mjs";
import { importBundle, inspect, verifyDatabase } from "../scripts/credentials-db.mjs";

// Final event credentials against REAL PostgreSQL databases. Disposable local databases only (GHOST_DB_TEST=1): two independent databases stand in for the Render preview and the college LAN.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));

const WORK = "D:/Ghost404-TestWorkspace/tmp/cred-test"; mkdirSync(WORK, { recursive: true });
const dbCount = async (url: string) => { const c = new PrismaClient({ datasourceUrl: url }); try { return await c.team.count(); } finally { await c.$disconnect(); } };
const dockerOk = spawnSync("docker", ["exec", "ghost404-pg-test", "pg_dump", "--version"]).status === 0;

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("Final event credentials (PostgreSQL, two independent databases)", { timeout: 240_000 }, () => {
  const bundle: Bundle = generateBundle(), adminCode = "temporary-test-organizer-code";
  const made: { drop(): Promise<void> }[] = [], clients: PrismaClient[] = [];
  let A: Awaited<ReturnType<typeof createTempDatabase>>, B: Awaited<ReturnType<typeof createTempDatabase>>;
  let dbA: PrismaClient, dbB: PrismaClient;
  let auth: typeof import("../src/lib/auth"), svc: typeof import("../src/lib/game/service"), reserve: typeof import("../src/lib/game/reserve.server"), wall: typeof import("../src/lib/game/evidence-wall.server");
  const client = (url: string) => { const c = new PrismaClient({ datasourceUrl: url }); clients.push(c); return c; };
  const pw = (id: string) => bundle.teams.find(t => t.id === id)!.password;
  const rows = async (db: PrismaClient) => (await db.team.findMany({ orderBy: { id: "asc" }, include: { provision: true, groupMember: true } })).map(t => ({ id: t.id, name: t.name, variant: t.variant, kind: t.provision?.kind, slot: t.provision?.slot, bundleId: t.provision?.bundleId, group: t.groupMember?.group ?? null }));
  const asAdmin = async () => { await auth.logout(); expect(await auth.login("admin", "organizer", adminCode)).toBe(true); };

  beforeAll(async () => {
    A = await createTempDatabase("credA"); B = await createTempDatabase("credB"); made.push(A, B); dbA = client(A.url); dbB = client(B.url);
    process.env.DATABASE_URL = A.url; process.env.DIRECT_URL = A.url; process.env.ADMIN_ACCESS_HASH = hashPassword(adminCode); process.env.APP_ORIGIN = "http://127.0.0.1:3000";
    (globalThis as { prisma?: unknown }).prisma = undefined; auth = await import("../src/lib/auth"); svc = await import("../src/lib/game/service"); reserve = await import("../src/lib/game/reserve.server"); wall = await import("../src/lib/game/evidence-wall.server");
  });
  afterAll(async () => { for (const c of clients) await c.$disconnect(); await (await import("../src/lib/db")).db.$disconnect(); for (const m of made) await m.drop(); rmSync(WORK, { recursive: true, force: true }); });

  it("a dry run (the default) reports the plan and writes nothing; an apply needs the exact database name", async () => {
    const dry = await importBundle(dbA, bundle); expect(dry.status).toBe("dry-run"); expect(dry.written).toBe(false);
    expect(dry.info).toMatchObject({ classification: "fresh", database: A.name }); expect(dry.info.plan.create).toHaveLength(32); expect(dry.info.plan.codes).toEqual(["A", "B", "C"]);
    expect(await dbA.team.count()).toBe(0);
    await expect(importBundle(dbA, bundle, { apply: true })).rejects.toThrow(/confirm-database/); await expect(importBundle(dbA, bundle, { apply: true, confirmDatabase: "some_other_db" })).rejects.toThrow(/confirm-database/);
    expect(await dbA.team.count()).toBe(0); expect(await dbA.auditLog.count()).toBe(0);
  });

  it("installs exactly 32 accounts with salted hashes, the roster record, 10/10/10 Insider groups and the six shared codes", async () => {
    const result = await importBundle(dbA, bundle, { apply: true, confirmDatabase: A.name }); expect(result.status).toBe("applied");
    const teams = await dbA.team.findMany({ orderBy: { id: "asc" }, include: { provision: true } });
    expect(teams.map(t => t.id)).toEqual(bundle.teams.map(t => t.id)); expect(teams.filter(t => t.provision?.kind === "primary")).toHaveLength(30); expect(teams.filter(t => t.provision?.kind === "reserve").map(t => t.id)).toEqual(["TEAM-31", "TEAM-32"]);
    for (const t of teams) { expect(t.codeHash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/); expect(verifyPassword(pw(t.id), t.codeHash)).toBe(true); expect(t.codeHash).not.toContain(pw(t.id)); expect(t.provision!.bundleId).toBe(bundle.bundleId); }
    const members = await dbA.insiderGroupMember.findMany(); expect(members).toHaveLength(30); for (const g of ["A", "B", "C"]) expect(members.filter(m => m.group === g)).toHaveLength(10);
    for (const t of bundle.teams.filter(x => x.kind === "primary")) expect(members.find(m => m.teamId === t.id)!.group).toBe(t.group);
    expect(members.some(m => m.teamId === "TEAM-31" || m.teamId === "TEAM-32")).toBe(false); // reserves have no group until activated
    const codes = await dbA.insiderGroupCode.findMany({ orderBy: { group: "asc" } }); expect(codes.map(c => [c.privateCode, c.publicCode])).toEqual((["A", "B", "C"] as const).map(g => [bundle.fragments[g].private, bundle.fragments[g].public]));
    expect(await dbA.insiderPair.count()).toBe(0); expect(await dbA.insiderWallCard.count()).toBe(0);
    expect(await dbA.insiderAccess.count()).toBe(30); // the dossier flag row exists for every primary, still locked
    const audit = await dbA.auditLog.findMany({ where: { action: "credentials-provisioned" } }); expect(audit).toHaveLength(1); for (const t of bundle.teams) expect(audit[0].detail).not.toContain(t.password); // audit has counts only
    const v = await verifyDatabase(dbA, bundle); expect(v).toMatchObject({ ok: true, checked: 32, passwordsOk: 32, groups: { A: 10, B: 10, C: 10 } });
  });

  it("running the importer again verifies and changes NOTHING (no duplicates, hashes, groups, progress or audit)", async () => {
    const snapshot = async () => JSON.stringify([await dbA.team.findMany({ orderBy: { id: "asc" } }), await dbA.teamProvision.findMany({ orderBy: { teamId: "asc" } }), await dbA.insiderGroupMember.findMany({ orderBy: { teamId: "asc" } }), await dbA.insiderGroupCode.findMany(), await dbA.auditLog.count()]);
    const before = await snapshot(); const again = await importBundle(dbA, bundle, { apply: true, confirmDatabase: A.name });
    expect(again.status).toBe("verified"); expect(again.written).toBe(false); expect(again.info.classification).toBe("already-provisioned"); expect(await snapshot()).toBe(before);
    // live event state is preserved by a later run
    const p = JSON.parse((await dbA.team.findUniqueOrThrow({ where: { id: "TEAM-05" } })).progress); p.chapters[0].score = 12; await dbA.team.update({ where: { id: "TEAM-05" }, data: { progress: JSON.stringify(p) } });
    await dbA.submission.create({ data: { teamId: "TEAM-05", chapter: 0, accepted: true, reason: "test", answer: null } }); const mid = await snapshot();
    expect((await importBundle(dbA, bundle, { apply: true, confirmDatabase: A.name })).status).toBe("verified"); expect(await snapshot()).toBe(mid);
    expect(JSON.parse((await dbA.team.findUniqueOrThrow({ where: { id: "TEAM-05" } })).progress).chapters[0].score).toBe(12); expect((await inspect(dbA, bundle)).submissions).toBe(1);
  });

  it("never overwrites: a different password, a different shared code or a different bundle is a CONFLICT and nothing is written", async () => {
    const original = (await dbA.team.findUniqueOrThrow({ where: { id: "TEAM-07" } })).codeHash;
    await dbA.team.update({ where: { id: "TEAM-07" }, data: { codeHash: hashPassword("QQQ-QQQ-QQQ") } });
    const r = await importBundle(dbA, bundle, { apply: true, confirmDatabase: A.name }); expect(r.status).toBe("conflict"); expect(r.written).toBe(false); expect(r.info.conflicts.join(" ")).toMatch(/TEAM-07.*DIFFERENT password/); for (const t of bundle.teams) expect(r.info.conflicts.join(" ")).not.toContain(t.password);
    expect((await verifyDatabase(dbA, bundle)).ok).toBe(false); await dbA.team.update({ where: { id: "TEAM-07" }, data: { codeHash: original } });
    await dbA.insiderGroupCode.update({ where: { group: "B" }, data: { publicCode: "W-AAAA-AAAA" } }); expect((await importBundle(dbA, bundle)).status).toBe("conflict"); await dbA.insiderGroupCode.update({ where: { group: "B" }, data: { publicCode: bundle.fragments.B.public } });
    const other = generateBundle(); const foreign = await importBundle(dbA, other, { apply: true, confirmDatabase: A.name }); expect(foreign.status).toBe("conflict"); expect(await dbA.team.count()).toBe(32); // a different bundle cannot replace these accounts
    expect((await importBundle(dbA, bundle)).status).toBe("verified");
  });

  it("MANDATORY: the same bundle installed into a SECOND, independent database accepts the identical credentials, groups and shared codes", async () => {
    const result = await importBundle(dbB, bundle, { apply: true, confirmDatabase: B.name }); expect(result.status).toBe("applied");
    expect(await dbA.team.count()).toBe(32); expect(await dbB.team.count()).toBe(32);
    for (const db of [dbA, dbB]) expect(await verifyDatabase(db, bundle)).toMatchObject({ ok: true, passwordsOk: 32, groups: { A: 10, B: 10, C: 10 } }); // every ORIGINAL password authenticates against BOTH
    expect(await rows(dbB)).toEqual(await rows(dbA)); // same 32 IDs, kinds, slots, variants, names, groups, bundle id
    expect(await dbB.insiderGroupCode.findMany({ orderBy: { group: "asc" }, select: { group: true, privateCode: true, publicCode: true } })).toEqual(await dbA.insiderGroupCode.findMany({ orderBy: { group: "asc" }, select: { group: true, privateCode: true, publicCode: true } }));
    const ha = await dbA.team.findMany({ orderBy: { id: "asc" }, select: { codeHash: true } }), hb = await dbB.team.findMany({ orderBy: { id: "asc" }, select: { codeHash: true } });
    expect(ha.every((h, i) => h.codeHash !== hb[i].codeHash)).toBe(true); // independent salts: the hashes differ, the passwords do not
    for (const db of [dbA, dbB]) { expect(await db.team.count({ where: { id: { startsWith: "GH-" } } })).toBe(0); expect(new Set((await db.team.findMany({ select: { id: true } })).map(t => t.id)).size).toBe(32); } // no duplicates, no replacement IDs
    expect((await importBundle(dbB, bundle)).status).toBe("verified");
  });

  it("the real application login accepts the printed credentials on BOTH databases (and the same letters in lower case); a wrong password is refused", async () => {
    expect(await auth.login("team", "TEAM-01", pw("TEAM-01"))).toBe(true); await auth.logout();
    expect(await auth.login("team", "team-02", pw("TEAM-02").toLowerCase())).toBe(true); await auth.logout(); // lower-case typing reaches the same account
    expect(await auth.login("team", "TEAM-03", "AAA-AAA-AAA")).toBe(false); expect(await auth.login("team", "TEAM-03", pw("TEAM-04"))).toBe(false); // another team's password never works
    process.env.DATABASE_URL = B.url; process.env.DIRECT_URL = B.url; (globalThis as { prisma?: unknown }).prisma = undefined; vi.resetModules();
    const authB = await import("../src/lib/auth"), dbMod = await import("../src/lib/db");
    try { for (const id of ["TEAM-01", "TEAM-17", "TEAM-30", "TEAM-31", "TEAM-32"]) { expect(await authB.login("team", id, pw(id))).toBe(true); await authB.logout(); } expect(await authB.login("team", "TEAM-01", pw("TEAM-02"))).toBe(false); }
    finally { await dbMod.db.$disconnect(); process.env.DATABASE_URL = A.url; process.env.DIRECT_URL = A.url; }
  });

  it("reserves are not competitors: unranked, blocked from play, outside the 10/10/10 counts, until an organizer replaces a team", async () => {
    expect((await svc.leaderboard()).map(t => t.id)).not.toContain("TEAM-31"); expect(await svc.leaderboard()).toHaveLength(30);
    const state = await svc.teamState("TEAM-31"); expect(state.standby).toBe("reserve"); expect(state.status).toBe("waiting");
    const live = { startsAt: new Date(Date.now() - 60_000), deadline: new Date(Date.now() + 3_000_000), scoringPolicy: "best-v1" }; await dbA.gameSession.upsert({ where: { id: 1 }, create: { id: 1, ...live }, update: live });
    expect((await svc.teamState("TEAM-31")).status).toBe("waiting"); // the round is live, the reserve still waits
    expect(await svc.mutateTeam("TEAM-31", 0, "hint", undefined)).toMatchObject({ error: expect.stringMatching(/reserve account is not active/) });
    expect(await dbA.submission.count({ where: { teamId: "TEAM-31" } })).toBe(0);
    const summary = await wall.groupSummary(dbA); expect(summary).toMatchObject({ teams: 30, prepared: 30, unassigned: 0, counts: { A: 10, B: 10, C: 10 }, final: true });
    expect((await svc.teamState("TEAM-01")).standby).toBeNull();
  });

  it("reserve replacement: organizer-only, explicit, one reserve per slot, never an extra competitor; the group is inherited and nothing is transferred", async () => {
    await auth.logout(); await expect(reserve.activateReserve({ reserveId: "TEAM-31", replacesId: "TEAM-05", reason: "card lost" })).rejects.toThrow(/Organizer authorization/); // no organizer session
    await asAdmin();
    await expect(reserve.activateReserve({ reserveId: "TEAM-31", replacesId: "TEAM-05", reason: "card lost" })).rejects.toThrow(/already has progress/); // TEAM-05 has a score and a submission
    await expect(reserve.activateReserve({ reserveId: "TEAM-03", replacesId: "TEAM-05", reason: "card lost" })).rejects.toThrow(/not a provisioned reserve/); await expect(reserve.activateReserve({ reserveId: "TEAM-31", replacesId: "TEAM-32", reason: "card lost" })).rejects.toThrow(/must be a provisioned primary/);
    await expect(reserve.activateReserve({ reserveId: "TEAM-31", replacesId: "TEAM-09", reason: "x" })).rejects.toThrow(/reason/);
    const group = bundle.teams.find(t => t.id === "TEAM-05")!.group!;
    const done = await reserve.activateReserve({ reserveId: "TEAM-31", replacesId: "TEAM-05", reason: "printed card unreadable", acknowledgeProgress: true }); expect(done).toEqual({ reserveId: "TEAM-31", replacesId: "TEAM-05", group });
    const board = (await svc.leaderboard()).map(t => t.id); expect(board).toHaveLength(30); expect(board).toContain("TEAM-31"); expect(board).not.toContain("TEAM-05"); // replaced, not added
    expect(await wall.groupSummary(dbA)).toMatchObject({ teams: 30, counts: { A: 10, B: 10, C: 10 }, final: true }); // the active 10/10/10 split is intact
    expect((await dbA.insiderGroupMember.findUniqueOrThrow({ where: { teamId: "TEAM-31" } }))).toMatchObject({ group, solvedAt: null });
    const s31 = await svc.teamState("TEAM-31"); expect(s31.standby).toBeNull(); expect(s31.status).toBe("active"); expect(s31.score).toBe(0); expect(s31.insiderGroup).toEqual({ group, solved: false }); // starts blank
    expect((await svc.teamState("TEAM-05")).standby).toBe("replaced"); expect(JSON.parse((await dbA.team.findUniqueOrThrow({ where: { id: "TEAM-05" } })).progress).chapters[0].score).toBe(12); // history kept, not transferred
    await expect(reserve.activateReserve({ reserveId: "TEAM-31", replacesId: "TEAM-06", reason: "again" })).rejects.toThrow(/already active/); await expect(reserve.activateReserve({ reserveId: "TEAM-32", replacesId: "TEAM-05", reason: "again" })).rejects.toThrow(/already been replaced/);
    expect((await verifyDatabase(dbA, bundle)).problems.filter(p => !/TEAM-31|TEAM-05/.test(p))).toEqual([]); expect(verifyPassword(pw("TEAM-31"), (await dbA.team.findUniqueOrThrow({ where: { id: "TEAM-31" } })).codeHash)).toBe(true); // the reserve's login is unchanged
    await auth.logout(); expect(await auth.login("team", "TEAM-31", pw("TEAM-31"))).toBe(true);
    const audit = await dbA.auditLog.findFirstOrThrow({ where: { action: "reserve-activated" } }); expect(JSON.parse(audit.detail)).toMatchObject({ reserveId: "TEAM-31", replacesId: "TEAM-05", group }); for (const t of bundle.teams) expect(audit.detail).not.toContain(t.password);
    await auth.logout();
  });

  it("no plaintext password reaches participant responses or the database", async () => {
    const state = JSON.stringify(await svc.teamState("TEAM-01")); for (const t of bundle.teams) expect(state).not.toContain(t.password); expect(state).not.toMatch(/codeHash|password/i);
    const text = JSON.stringify(await dbA.team.findMany({ select: { id: true, name: true, participants: true, progress: true, variant: true } })) + JSON.stringify(await dbA.auditLog.findMany()) + JSON.stringify(await dbA.submission.findMany());
    for (const t of bundle.teams) expect(text).not.toContain(t.password);
  });

  it("migrations do not touch credentials: `prisma migrate deploy` on a fresh database, import, then deploy again", async () => {
    const admin = new PrismaClient({ datasourceUrl: ADMIN_URL }), name = `ghostt_credm_${Date.now().toString(36)}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); made.push({ drop: async () => { await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.$disconnect(); } });
    const target = new URL(ADMIN_URL); target.pathname = `/${name}`; const env = { ...process.env, DATABASE_URL: target.href, DIRECT_URL: target.href };
    const deploy = () => spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "deploy"], { env, encoding: "utf8", shell: process.platform === "win32" });
    const first = deploy(); expect(first.status, first.stdout + first.stderr).toBe(0);
    const dbM = client(target.href); expect((await inspect(dbM, bundle)).schema).toMatchObject({ ok: true, migrationTable: true });
    expect((await importBundle(dbM, bundle, { apply: true, confirmDatabase: name })).status).toBe("applied");
    const before = JSON.stringify(await dbM.team.findMany({ orderBy: { id: "asc" }, select: { id: true, codeHash: true } }));
    const second = deploy(); expect(second.status, second.stdout + second.stderr).toBe(0); expect(second.stdout).toMatch(/No pending migrations/);
    expect(JSON.stringify(await dbM.team.findMany({ orderBy: { id: "asc" }, select: { id: true, codeHash: true } }))).toBe(before); expect((await verifyDatabase(dbM, bundle)).ok).toBe(true);
  });

  it("a database without the new tables is refused (schema not ready) and nothing is written", async () => {
    const admin = new PrismaClient({ datasourceUrl: ADMIN_URL }), name = `ghostt_credx_${Date.now().toString(36)}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); made.push({ drop: async () => { await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.$disconnect(); } });
    const target = new URL(ADMIN_URL); target.pathname = `/${name}`; const empty = client(target.href);
    const r = await importBundle(empty, bundle, { apply: true, confirmDatabase: name }); expect(r.status).toBe("schema-missing"); expect(r.written).toBe(false); expect(r.info.schema.missingTables).toContain("Team");
  });

  it("the organizer CLI works end to end on a disposable database, refuses unsafe use, and never prints a password, a code or the passphrase", async () => {
    const dir = `${WORK}/cli`, file = `${dir}/event.enc`, pass = "cli-test-passphrase-0123456789";
    const admin = new PrismaClient({ datasourceUrl: ADMIN_URL }), name = `ghostt_credc_${Date.now().toString(36)}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); made.push({ drop: async () => { await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.$disconnect(); } });
    const target = new URL(ADMIN_URL); target.pathname = `/${name}`; await (await import("../scripts/pg-temp.mjs")).applyMigrations(target.href);
    const env = { ...process.env, GHOST_CRED_PASSPHRASE: pass, DATABASE_URL: target.href, DIRECT_URL: target.href };
    const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/credentials.mjs", ...args], { env, encoding: "utf8" });
    const gen = run("generate", "--out", file); expect(gen.status, gen.stderr).toBe(0); expect(gen.stdout).toContain("Nothing secret was printed");
    expect(run("generate", "--out", file).stderr).toMatch(/Refusing to overwrite/); // generated ONCE
    expect(run("generate", "--out", "./inside-repo.enc").stderr).toMatch(/inside the repository/); // never into the repo
    const { decryptBundle } = await import("../scripts/credentials-lib.mjs"), real = decryptBundle(readFileSync(file, "utf8"), pass);
    expect(run("check", "--bundle", file).stdout).toContain("10/10/10"); expect(run("preflight", "--bundle", file).stdout).toMatch(/Classification\s+fresh/);
    const dry = run("import", "--bundle", file); expect(dry.stdout).toContain("DRY RUN"); expect(await dbCount(target.href)).toBe(0);
    expect(run("import", "--bundle", file, "--apply").stderr).toMatch(/confirm-database/); expect(await dbCount(target.href)).toBe(0);
    const apply = run("import", "--bundle", file, "--apply", "--confirm-database", name); expect(apply.status, apply.stderr).toBe(0); expect(apply.stdout).toContain("APPLIED"); expect(await dbCount(target.href)).toBe(32);
    expect(run("import", "--bundle", file, "--apply", "--confirm-database", name).stdout).toContain("nothing to write"); // second run verifies only
    const ver = run("verify", "--bundle", file); expect(ver.status).toBe(0); expect(ver.stdout).toContain("32 of 32 passwords match"); expect(ver.stdout).toContain("VERIFIED");
    const printed = run("print", "--bundle", file, "--out", `${dir}/cards`, "--include", "all"); expect(printed.status, printed.stderr).toBe(0);
    const out = [gen, dry, apply, ver, printed].map(r => r.stdout + r.stderr).join(" "); for (const t of real.teams) expect(out).not.toContain(t.password); expect(out).not.toContain(pass); for (const g of ["A", "B", "C"] as const) expect(out).not.toContain(real.fragments[g].private);
    const html = readFileSync(printed.stdout.match(/Card file\s+(.+)/)![1].trim(), "utf8"); expect(html).toContain(real.teams[0].password); expect(html).toContain(real.fragments[real.teams[0].group!].private); expect((html.match(/<article class="card/g) ?? []).length).toBe(32);
    expect(spawnSync(process.execPath, ["scripts/credentials.mjs", "check", "--bundle", file], { env: { ...env, GHOST_CRED_PASSPHRASE: "wrong-wrong-wrong-wrong-1" }, encoding: "utf8" }).stderr).toMatch(/wrong passphrase/);
  });

  it.skipIf(!dockerOk)("backup and restore: a pg_dump of the event database restored into ANOTHER database accepts the same credentials; the dump holds no plaintext password", async () => {
    const dump = (name: string, args: string[]) => spawnSync("docker", ["exec", "ghost404-pg-test", "pg_dump", "-U", "postgres", ...args, "-d", name], { maxBuffer: 256 * 1024 * 1024 });
    const custom = dump(A.name, ["-Fc"]); expect(custom.status, String(custom.stderr)).toBe(0); writeFileSync(`${WORK}/event.dump`, custom.stdout);
    const plain = dump(A.name, ["--no-owner"]); expect(plain.status).toBe(0); const sql = plain.stdout.toString("utf8");
    for (const t of bundle.teams) expect(sql).not.toContain(t.password); expect(sql).toContain("TEAM-01"); expect(sql).toMatch(/[a-f0-9]{32}:[a-f0-9]{128}/); // hashes only
    const admin = new PrismaClient({ datasourceUrl: ADMIN_URL }), name = `ghostt_credr_${Date.now().toString(36)}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); made.push({ drop: async () => { await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.$disconnect(); } });
    const restore = spawnSync("docker", ["exec", "-i", "ghost404-pg-test", "pg_restore", "-U", "postgres", "--no-owner", "-d", name], { input: readFileSync(`${WORK}/event.dump`), maxBuffer: 64 * 1024 * 1024 }); expect(restore.status, String(restore.stderr)).toBe(0);
    const target = new URL(ADMIN_URL); target.pathname = `/${name}`; const restored = client(target.href);
    const v = await verifyDatabase(restored, bundle); expect(v.passwordsOk).toBe(32); expect(v.groups).toEqual({ A: 10, B: 10, C: 10 });
    expect(v.problems.filter(p => !/TEAM-31|TEAM-05/.test(p))).toEqual([]); // only the intentional reserve replacement differs from the printed bundle
    expect(await restored.team.count()).toBe(32); expect(JSON.parse((await restored.team.findUniqueOrThrow({ where: { id: "TEAM-05" } })).progress).chapters[0].score).toBe(12); // event state came back too
    expect(await restored.auditLog.count({ where: { action: "reserve-activated" } })).toBe(1);
  });
});
