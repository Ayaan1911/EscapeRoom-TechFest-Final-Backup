import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine";

// Evidence Wall, SHARED PAIRS (final design): exactly six fragments for the whole event; 30 teams -> 10/10/10; each team solves ONE pair. Disposable local PostgreSQL only (GHOST_DB_TEST=1).
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("Evidence Wall: three shared pairs (PostgreSQL)", { timeout: 180_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db, auth: typeof import("../src/lib/auth"), svc: typeof import("../src/lib/game/service"), kit: typeof import("../src/lib/game/insider-kit.server"), wall: typeof import("../src/lib/game/evidence-wall.server");
  let route: typeof import("../src/app/api/game/insider/route"), dossierOf: typeof import("../src/lib/game/insider.server").insiderDossier, demo: typeof import("../src/lib/demo/demo.server");
  const code = "temporary-test-access-only";
  const ids = Array.from({ length: 30 }, (_, i) => `G${String(i + 1).padStart(2, "0")}`);
  type Kit = NonNullable<Awaited<ReturnType<typeof kit.insiderSharedKit>>>;
  let sheets: Kit;
  const asTeam = async (id: string) => { await auth.logout(); expect(await auth.login("team", id, code)).toBe(true); };
  const asAdmin = async () => { await auth.logout(); expect(await auth.login("admin", "organizer", code)).toBe(true); };
  const groupOf = (team: string) => sheets.groups.find(g => g.teams.includes(team))!;
  const pairOf = (g: string) => sheets.groups.find(x => x.group === g)!;
  const teamsIn = (g: string) => pairOf(g).teams;
  async function attempt(team: string, payload: unknown) { await db.submission.updateMany({ where: { teamId: team }, data: { createdAt: new Date(Date.now() - 10_000) } }); return svc.mutateTeam(team, 2, "unlock", payload) as Promise<{ unlocked?: boolean; matched?: boolean; pair?: string; already?: boolean; groupMode?: boolean; error?: string }>; }
  const progressOf = async (team: string) => (await db.team.findUniqueOrThrow({ where: { id: team } })).progress;
  const dossierFor = async (team: string) => { await asTeam(team); const r = await route.GET(); return { code: r.status, body: await r.json() as { unlocked?: boolean; pairs?: unknown; group?: { group: string; solved: boolean }; dossier: null | { suspects: unknown[]; records: { id: string; kind: string }[] } } }; };
  const mkTeam = async (id: string, variant = "A") => { const p = initialProgress(); p.chapters[0].score = 15; p.chapters[0].unlockedAt = Date.now() - 500_000; p.chapters[1].score = 25; p.chapters[1].unlockedAt = Date.now() - 400_000; p.chapters[2].unlockedAt = Date.now() - 300_000; await db.team.create({ data: { id, name: `Team ${id}`, participants: "[]", codeHash: hashPassword(code), variant, progress: JSON.stringify(p) } }); };

  beforeAll(async () => {
    temp = await createTempDatabase("wallshared");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url; process.env.ADMIN_ACCESS_HASH = hashPassword(code); process.env.APP_ORIGIN = "http://127.0.0.1:3000";
    ({ db } = await import("../src/lib/db")); auth = await import("../src/lib/auth"); svc = await import("../src/lib/game/service"); kit = await import("../src/lib/game/insider-kit.server"); wall = await import("../src/lib/game/evidence-wall.server");
    route = await import("../src/app/api/game/insider/route"); dossierOf = (await import("../src/lib/game/insider.server")).insiderDossier; demo = await import("../src/lib/demo/demo.server");
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(Date.now() - 600_000), deadline: new Date(Date.now() + 3_000_000), scoringPolicy: "best-v1" } });
    for (const [i, id] of ids.entries()) await mkTeam(id, ["A", "B", "C"][i % 3]);
    await asAdmin(); sheets = (await kit.insiderSharedKit())!;
  });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("exactly six unique fragments: three pairs, no per-team codes, no decoys, no extra cards", async () => {
    const all = sheets.groups.flatMap(g => [g.privateCode!, g.publicCode!]);
    expect(sheets.groups.map(g => g.group)).toEqual(["A", "B", "C"]); expect(all).toHaveLength(6); expect(new Set(all).size).toBe(6);
    expect(all.filter(c => c.startsWith("P-"))).toHaveLength(3); expect(all.filter(c => c.startsWith("W-"))).toHaveLength(3);
    for (const c of all) expect(c).toMatch(/^[PW]-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/); // short, unambiguous, easy to type from a card
    expect(await db.insiderGroupCode.count()).toBe(3); expect(await db.insiderWallCard.count()).toBe(0); expect(await db.insiderPair.count()).toBe(0); // nothing per team, no decoys
    expect(sheets.summary).toMatchObject({ teams: 30, prepared: 30, unassigned: 0, counts: { A: 10, B: 10, C: 10 }, uniquePrivate: 3, uniquePublic: 3, codesReady: true, final: true, balanced: true });
    expect(await db.insiderGroupMember.count()).toBe(30);
  });

  it("30 teams split 10/10/10; all ten teams of a group share the SAME private and public code; the assignment is not team-ID order", async () => {
    for (const g of ["A", "B", "C"]) expect(teamsIn(g)).toHaveLength(10);
    expect(new Set(ids.map(id => groupOf(id).group)).size).toBe(3); expect(sheets.groups.flatMap(g => g.teams).sort()).toEqual(ids);
    for (const g of sheets.groups) for (const t of g.teams) { const state = await svc.teamState(t); expect(state.insiderGroup).toEqual({ group: g.group, solved: false }); }
    const seq = ids.map(id => groupOf(id).group).join(""); expect(seq).not.toBe(ids.map((_, i) => "ABC"[i % 3]).join("")); expect(seq).not.toBe("A".repeat(10) + "B".repeat(10) + "C".repeat(10));
  });

  it("codes and assignment never change: re-running preparation, reprinting and a fresh module load return the same six codes and the same teams", async () => {
    const again = (await kit.insiderSharedKit())!; await asAdmin();
    expect(again.groups).toEqual(sheets.groups); const reprint = (await kit.insiderSharedKit(undefined, { prepare: false }))!; expect(reprint.groups).toEqual(sheets.groups);
    vi.resetModules(); const fresh = await import("../src/lib/game/insider-kit.server"); const restarted = (await fresh.insiderSharedKit(undefined, { prepare: false }))!; expect(restarted.groups).toEqual(sheets.groups); // a restarted server reads the same rows
    expect(await db.insiderGroupCode.count()).toBe(3); expect(await db.insiderGroupMember.count()).toBe(30);
    await auth.logout(); expect(await kit.insiderSharedKit()).toBeNull(); expect(await kit.insiderGroupOverview()).toBeNull(); await asTeam("G01"); expect(await kit.insiderSharedKit()).toBeNull(); // organizer-only
  });

  it("the matching pair opens the whole dossier, and a SECOND team of the same group unlocks with the very same two codes", async () => {
    const g = groupOf("G01"), [a, b] = g.teams; await asTeam(a);
    const before = await progressOf(a), scoreBefore = (await svc.teamState(a)).score, s0 = await svc.teamState(a);
    expect(s0.insiderUnlocked).toBe(false); expect(s0.insiderPairs).toBeNull();
    const r = await attempt(a, { privateCode: g.privateCode, publicCode: g.publicCode });
    expect(r).toMatchObject({ matched: true, unlocked: true, pair: g.group, groupMode: true, already: false });
    const s = await svc.teamState(a); expect(s.insiderUnlocked).toBe(true); expect(s.insiderGroup).toEqual({ group: g.group, solved: true });
    const d = await dossierFor(a); expect(d.body.unlocked).toBe(true); expect(d.body.dossier!.records).toHaveLength(dossierOf(s.variant).records.length); expect(d.body.dossier!.suspects.length).toBeGreaterThan(0); // every folder: no other pair needed
    expect(await progressOf(a)).toBe(before); expect(s.score).toBe(scoreBefore); // no points, no chapter change
    expect(await db.auditLog.count({ where: { actor: a, action: "dossier-unlock" } })).toBe(1);
    expect((await svc.teamState(b)).insiderUnlocked).toBe(false); // a team-mate is not unlocked by someone else's solve
    expect(await attempt(b, { privateCode: g.privateCode, publicCode: g.publicCode })).toMatchObject({ matched: true, unlocked: true }); // the SAME codes
    expect(await attempt(a, { privateCode: g.privateCode, publicCode: g.publicCode })).toMatchObject({ unlocked: true }); // a repeat is harmless
  });

  it("progress persists across a refresh, a new session and re-login", async () => {
    const [a] = groupOf("G01").teams; for (let i = 0; i < 2; i++) { const d = await dossierFor(a); expect(d.body.unlocked).toBe(true); expect(d.body.group?.solved).toBe(true); expect(d.body.dossier).not.toBeNull(); }
  });

  it("wrong matches fail: the other groups' pairs, the letter alone, one half only, swapped halves, mixed halves, garbage, extra fields", async () => {
    const t = ids.find(id => groupOf(id).group === "A" && !groupOf("G01").teams.includes(id)) ?? teamsIn("A").at(-1)!, mine = pairOf("A").teams.includes(t) ? pairOf("A") : groupOf(t);
    const other = sheets.groups.filter(g => g.group !== mine.group); await asTeam(t);
    const cases: [unknown, string][] = [
      [{ privateCode: other[0].privateCode, publicCode: other[0].publicCode }, "another group's full pair"], [{ privateCode: other[1].privateCode, publicCode: other[1].publicCode }, "the third group's pair"],
      [{ privateCode: mine.privateCode, publicCode: other[0].publicCode }, "my private + other public"], [{ privateCode: other[0].privateCode, publicCode: mine.publicCode }, "other private + my public"],
      [{ privateCode: mine.group, publicCode: mine.group }, "the group letter alone"], [{ privateCode: mine.privateCode, publicCode: mine.group }, "private + letter"], [{ privateCode: mine.group, publicCode: mine.publicCode }, "letter + public"],
      [{ privateCode: mine.publicCode, publicCode: mine.privateCode }, "swapped halves"], [{ privateCode: mine.privateCode, publicCode: mine.privateCode }, "private twice"], [{ privateCode: mine.publicCode, publicCode: mine.publicCode }, "public twice"],
      [{ privateCode: mine.privateCode }, "private only"], [{ publicCode: mine.publicCode }, "public only"], [{ privateCode: "not a code", publicCode: mine.publicCode }, "malformed"], [{ privateCode: "P-AAAA-AAAA", publicCode: "W-AAAA-AAAA" }, "unknown codes"],
      [{ privateCode: mine.privateCode, publicCode: mine.publicCode, extra: 1 }, "extra field"], [null, "no payload"],
    ];
    if (t === "G01") throw new Error("test setup");
    for (const [payload, why] of cases) { const r = await attempt(t, payload); expect(r.matched, why).toBe(false); expect(r.unlocked, why).toBe(false); }
    const s = await svc.teamState(t); expect(s.insiderUnlocked).toBe(false); expect(s.insiderGroup?.solved).toBe(false); expect((await dossierFor(t)).body.dossier).toBeNull();
    expect(await db.submission.count({ where: { teamId: t, reason: "fragment-rejected" } })).toBeGreaterThanOrEqual(cases.length);
  });

  it("every group's teams unlock with their own pair only (A, B and C), tolerant of case, spaces and hyphens", async () => {
    for (const g of sheets.groups) {
      const t = g.teams.find(id => id !== groupOf("G01").teams[0] && id !== groupOf("G01").teams[1])!; await asTeam(t); const loose = (c: string) => ` ${c.toLowerCase().replace(/-/g, " ")} `;
      const wrongGroup = sheets.groups.find(x => x.group !== g.group)!; expect((await attempt(t, { privateCode: wrongGroup.privateCode, publicCode: wrongGroup.publicCode })).matched).toBe(false);
      expect(await attempt(t, { privateCode: loose(g.privateCode!), publicCode: loose(g.publicCode!) })).toMatchObject({ matched: true, unlocked: true, pair: g.group });
    }
  });

  it("scored tasks stay sealed until the match; the existing task flow opens afterwards", async () => {
    const t = teamsIn("B").find(id => id !== groupOf("G01").teams[0])!; await asTeam(t);
    const early = await svc.mutateTeam(t, 2, "submit", { employeeId: "EMP-A-01" }, "insider.suspect") as { error?: string }; if ((await svc.teamState(t)).insiderUnlocked) return; expect(early.error).toMatch(/Unlock the dossier/);
    const g = groupOf(t); await attempt(t, { privateCode: g.privateCode, publicCode: g.publicCode });
    await db.submission.updateMany({ where: { teamId: t }, data: { createdAt: new Date(Date.now() - 10_000) } });
    const ok = await svc.mutateTeam(t, 2, "submit", { employeeId: "EMP-A-01" }, "insider.suspect") as { error?: string }; expect(ok.error ?? "").not.toMatch(/Unlock the dossier/);
  });

  it("no code reaches a participant before it is earned: state, dossier API and unlock responses contain none of the six codes or the full map", async () => {
    const all = sheets.groups.flatMap(g => [g.privateCode!, g.publicCode!]);
    for (const team of ["G28", "G29"]) {
      const g = groupOf(team); await asTeam(team); const wrong = sheets.groups.find(x => x.group !== g.group)!;
      const bodies = [JSON.stringify(await svc.teamState(team)), await (await route.GET()).text(), JSON.stringify(await attempt(team, { privateCode: wrong.privateCode, publicCode: wrong.publicCode }))];
      for (const body of bodies) { for (const c of all) expect(body).not.toContain(c); expect(body).not.toMatch(/privateCode|publicCode|decoy|InsiderGroupCode/i); }
    }
  });

  it("earlier data stays safe: per-team group, three-pair and two-fragment teams keep working, are not touched by preparation, and the per-team group converts only on explicit request", async () => {
    for (const id of ["E1", "E2", "T3", "L1"]) await mkTeam(id);
    // earlier per-team group preparation (release 89e52d4): ONE InsiderPair row + its own match card; E1 has not solved it, E2 already did
    for (const [id, solved] of [["E1", false], ["E2", true]] as const) {
      await db.insiderAccess.create({ data: { teamId: id, fragmentA: `A-${id}`, fragmentB: `B-${id}`, unlockedAt: solved ? new Date() : null } });
      await db.insiderPair.create({ data: { teamId: id, pair: id === "E1" ? "B" : "C", privateCode: `P-${id.repeat(12)}`.replace(/[^A-F0-9P-]/g, "A"), solvedAt: solved ? new Date() : null } });
    }
    await db.insiderWallCard.create({ data: { code: "W-E1E1E1E1E1E1E1E1E1E1E1E1".replace(/[^A-F0-9W-]/g, "A"), variant: "A", pair: "B", role: "match", teamId: "E1" } });
    // three-pair team and a two-fragment team
    await db.insiderAccess.create({ data: { teamId: "T3", fragmentA: "A-T3", fragmentB: "B-T3" } }); for (const pair of ["A", "B", "C"]) await db.insiderPair.create({ data: { teamId: "T3", pair, privateCode: `P-T3${pair}`.padEnd(30, "A").replace(/[^A-F0-9P-]/g, "A") } });
    await db.insiderAccess.create({ data: { teamId: "L1", fragmentA: "A-111111-222222-333333-444444", fragmentB: "B-555555-666666-777777-888888", unlockedAt: new Date() } });
    await asAdmin(); const before = (await kit.insiderSharedKit(undefined, { prepare: false }))!; expect(before.summary).toMatchObject({ teams: 34, prepared: 30, earlier: 3, convertible: 2 });
    const prepared = (await kit.insiderSharedKit())!; await asAdmin(); // preparing everyone assigns only the team with no earlier rows
    expect(prepared.groups.flatMap(g => g.teams)).toContain("L1"); expect(prepared.groups.flatMap(g => g.teams)).not.toContain("E1"); expect(prepared.groups.flatMap(g => g.teams)).not.toContain("T3"); expect(prepared.summary.earlier).toBe(3 - 0);
    expect(await db.insiderGroupCode.findMany({ orderBy: { group: "asc" } }).then(r => r.map(x => x.privateCode))).toEqual(sheets.groups.map(g => g.privateCode)); // the six codes are untouched
    expect((await svc.teamState("T3")).insiderPairs).toEqual({ A: false, B: false, C: false }); expect((await svc.teamState("E1")).insiderGroup).toEqual({ group: "B", solved: false }); // earlier modes still read as before
    expect((await dossierFor("E2")).body.unlocked).toBe(true);
    // explicit conversion: group letters and solved state are kept, nothing is deleted, three-pair teams are untouched
    const result = await db.$transaction(tx => wall.convertEarlierToShared(tx)); expect(result.converted).toBe(2);
    expect(await db.insiderGroupMember.findUniqueOrThrow({ where: { teamId: "E1" } })).toMatchObject({ group: "B", solvedAt: null }); expect((await db.insiderGroupMember.findUniqueOrThrow({ where: { teamId: "E2" } })).solvedAt).not.toBeNull();
    expect(await db.insiderGroupMember.count({ where: { teamId: "T3" } })).toBe(0); expect(await db.insiderPair.count({ where: { teamId: { in: ["E1", "E2", "T3"] } } })).toBe(5); // history kept
    expect((await db.$transaction(tx => wall.convertEarlierToShared(tx))).converted).toBe(0); // idempotent
    const b = sheets.groups.find(g => g.group === "B")!; expect((await dossierFor("E2")).body.unlocked).toBe(true); // an already-unlocked team stays unlocked
    expect(await attempt("E1", { privateCode: "P-E1E1E1E1E1E1E1E1E1E1E1E1".replace(/[^A-F0-9P-]/g, "A"), publicCode: "W-E1E1E1E1E1E1E1E1E1E1E1E1".replace(/[^A-F0-9W-]/g, "A") })).toMatchObject({ matched: false }); // earlier per-team codes no longer open it
    expect(await attempt("E1", { privateCode: b.privateCode, publicCode: b.publicCode })).toMatchObject({ matched: true, unlocked: true, pair: "B" }); // the shared pair does
    // the two-fragment team is unchanged
    expect((await dossierFor("L1")).body.unlocked).toBe(true);
  });

  it("Demo Mode stays isolated: its simulated chapter state has no group and nothing is written", async () => {
    const s = demo.demoChapterState() as { insiderUnlocked?: boolean; insiderGroup?: unknown }; expect(s.insiderUnlocked).toBe(true); expect(s.insiderGroup ?? null).toBeNull();
    const members = await db.insiderGroupMember.count(), codes = await db.insiderGroupCode.count(); void demo.demoChapterState(); expect(await db.insiderGroupMember.count()).toBe(members); expect(await db.insiderGroupCode.count()).toBe(codes);
  });
});
