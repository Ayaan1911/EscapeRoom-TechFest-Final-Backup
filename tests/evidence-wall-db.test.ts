import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine";

// Evidence Wall GROUP MODE: one assigned group A/B/C per team (30 teams -> 10/10/10). Disposable local PostgreSQL only (GHOST_DB_TEST=1).
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("Evidence Wall: one assigned group per team (PostgreSQL)", { timeout: 180_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db, auth: typeof import("../src/lib/auth"), svc: typeof import("../src/lib/game/service"), kit: typeof import("../src/lib/game/insider-kit.server");
  let route: typeof import("../src/app/api/game/insider/route"), dossierOf: typeof import("../src/lib/game/insider.server").insiderDossier, demo: typeof import("../src/lib/demo/demo.server");
  const code = "temporary-test-access-only";
  const ids = Array.from({ length: 30 }, (_, i) => `G${String(i + 1).padStart(2, "0")}`);
  const variantOfIndex = (i: number) => ["A", "B", "C"][i % 3];
  type Sheets = NonNullable<Awaited<ReturnType<typeof kit.insiderGroupSheets>>>;
  let sheets: Sheets;
  const asTeam = async (id: string) => { await auth.logout(); expect(await auth.login("team", id, code)).toBe(true); };
  const asAdmin = async () => { await auth.logout(); expect(await auth.login("admin", "organizer", code)).toBe(true); };
  const slip = (team: string) => sheets.slips.find(s => s.teamId === team)!;
  const matchCard = (team: string) => sheets.wall.find(c => c.teamId === team && c.role === "match")!;
  const decoy = (group: string, n = 0) => sheets.wall.filter(c => c.group === group && c.role === "decoy")[n];
  async function attempt(team: string, payload: unknown) { await db.submission.updateMany({ where: { teamId: team }, data: { createdAt: new Date(Date.now() - 10_000) } }); return svc.mutateTeam(team, 2, "unlock", payload) as Promise<{ unlocked?: boolean; matched?: boolean; pair?: string; already?: boolean; groupMode?: boolean; error?: string }>; }
  const progressOf = async (team: string) => (await db.team.findUniqueOrThrow({ where: { id: team } })).progress;
  const dossierFor = async (team: string) => { await asTeam(team); const r = await route.GET(); return { code: r.status, body: await r.json() as { unlocked?: boolean; pairs?: unknown; group?: { group: string; solved: boolean }; dossier: null | { suspects: unknown[]; records: { id: string; kind: string }[] } } }; };
  const mkTeam = async (id: string, variant: string) => { const p = initialProgress(); p.chapters[0].score = 15; p.chapters[0].unlockedAt = Date.now() - 500_000; p.chapters[1].score = 25; p.chapters[1].unlockedAt = Date.now() - 400_000; p.chapters[2].unlockedAt = Date.now() - 300_000; await db.team.create({ data: { id, name: `Team ${id}`, participants: "[]", codeHash: hashPassword(code), variant, progress: JSON.stringify(p) } }); };

  beforeAll(async () => {
    temp = await createTempDatabase("wallgroups");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url; process.env.ADMIN_ACCESS_HASH = hashPassword(code); process.env.APP_ORIGIN = "http://127.0.0.1:3000";
    ({ db } = await import("../src/lib/db")); auth = await import("../src/lib/auth"); svc = await import("../src/lib/game/service"); kit = await import("../src/lib/game/insider-kit.server");
    route = await import("../src/app/api/game/insider/route"); dossierOf = (await import("../src/lib/game/insider.server")).insiderDossier; demo = await import("../src/lib/demo/demo.server");
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(Date.now() - 600_000), deadline: new Date(Date.now() + 3_000_000), scoringPolicy: "best-v1" } });
    for (const [i, id] of ids.entries()) await mkTeam(id, variantOfIndex(i));
    await asAdmin(); sheets = (await kit.insiderGroupSheets())!;
  });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("30 teams are split exactly 10 / 10 / 10, each team holds ONE private fragment and has ONE matching public card", async () => {
    const count = (g: string) => sheets.slips.filter(s => s.group === g).length;
    expect([count("A"), count("B"), count("C")]).toEqual([10, 10, 10]);
    expect(sheets.slips).toHaveLength(30); expect(new Set(sheets.slips.map(s => s.teamId)).size).toBe(30); expect(await db.insiderPair.count()).toBe(30);
    expect(sheets.summary).toMatchObject({ teams: 30, prepared: 30, unassigned: 0, counts: { A: 10, B: 10, C: 10 }, final: true, balanced: true });
    const matches = sheets.wall.filter(c => c.role === "match");
    expect(matches).toHaveLength(30); expect(new Set(matches.map(c => c.teamId)).size).toBe(30); // exactly one counterpart per team
    for (const s of sheets.slips) expect(matchCard(s.teamId).group).toBe(s.group); // the counterpart sits in the team's own group
    expect(sheets.wall.filter(c => c.role === "decoy")).toHaveLength(6); // two lookalikes per group, shared; no hundreds of cards
    const all = [...sheets.slips.map(s => s.code), ...sheets.wall.map(c => c.code)]; expect(new Set(all).size).toBe(all.length);
    expect(sheets.slips.every(s => /^P-(?:[A-F0-9]{6}-){3}[A-F0-9]{6}$/.test(s.code))).toBe(true); expect(sheets.wall.every(c => /^W-(?:[A-F0-9]{6}-){3}[A-F0-9]{6}$/.test(c.code))).toBe(true);
  });

  it("the assignment is not a team-ID pattern, is saved once, and is unchanged by re-running preparation or reprinting", async () => {
    const byId = ids.map(id => slip(id).group);
    expect(byId.join("")).not.toBe(ids.map((_, i) => "ABC"[i % 3]).join("")); expect(byId.join("")).not.toBe("A".repeat(10) + "B".repeat(10) + "C".repeat(10)); // shuffled, not round-robin or blocks
    const again = (await kit.insiderGroupSheets())!; await asAdmin();
    expect(again.slips).toEqual(sheets.slips); expect(again.wall).toEqual(sheets.wall); // same groups, same codes, same decoys
    const reprint = (await kit.insiderGroupSheets(undefined, { prepare: false }))!; expect(reprint.slips).toEqual(sheets.slips);
    expect(await db.insiderPair.count()).toBe(30); expect(await db.insiderWallCard.count()).toBe(36);
    await auth.logout(); expect(await kit.insiderGroupSheets()).toBeNull(); expect(await kit.insiderGroupOverview()).toBeNull(); await asTeam("G01"); expect(await kit.insiderGroupSheets()).toBeNull(); // organizer-only
  });

  it("the correct private fragment + its own public card opens the whole dossier at once, with no other pair required", async () => {
    await asTeam("G01"); const t = slip("G01"), before = await progressOf("G01"), scoreBefore = (await svc.teamState("G01")).score;
    const state0 = await svc.teamState("G01"); expect(state0.insiderGroup).toEqual({ group: t.group, solved: false }); expect(state0.insiderPairs).toBeNull(); expect(state0.insiderUnlocked).toBe(false);
    const r = await attempt("G01", { privateCode: t.code, publicCode: matchCard("G01").code });
    expect(r).toMatchObject({ matched: true, unlocked: true, pair: t.group, groupMode: true, already: false });
    const s = await svc.teamState("G01"); expect(s.insiderUnlocked).toBe(true); expect(s.insiderGroup).toEqual({ group: t.group, solved: true });
    const d = await dossierFor("G01"); expect(d.code).toBe(200); expect(d.body.unlocked).toBe(true); expect(d.body.dossier!.records).toHaveLength(dossierOf(s.variant).records.length); // every folder, not one third
    expect(d.body.dossier!.suspects.length).toBeGreaterThan(0); expect(d.body.group).toEqual({ group: t.group, solved: true }); expect(d.body.pairs).toBeUndefined();
    expect(await progressOf("G01")).toBe(before); expect(s.score).toBe(scoreBefore); // the match scores nothing and changes no chapter state
    expect(await db.auditLog.count({ where: { actor: "G01", action: "dossier-unlock" } })).toBe(1);
  });

  it("progress persists across a refresh, a new session and a re-login; a repeat is harmless", async () => {
    for (let i = 0; i < 2; i++) { const d = await dossierFor("G01"); expect(d.body.unlocked).toBe(true); expect(d.body.group?.solved).toBe(true); expect(d.body.dossier).not.toBeNull(); }
    const t = slip("G01"), audits = await db.auditLog.count({ where: { actor: "G01", action: "pair-solve" } });
    expect(await attempt("G01", { privateCode: t.code, publicCode: matchCard("G01").code })).toMatchObject({ unlocked: true }); // already unlocked: no error, no duplicate audit
    expect(await db.auditLog.count({ where: { actor: "G01", action: "pair-solve" } })).toBe(audits);
  });

  it("wrong combinations never validate: letter only, a decoy, another team's card, another group's card, someone else's fragment, garbage, extra fields", async () => {
    await asTeam("G02"); const t = slip("G02"), mine = matchCard("G02").code;
    const sameGroupOther = ids.find(id => id !== "G02" && slip(id).group === t.group)!, otherGroup = ids.find(id => slip(id).group !== t.group)!;
    for (const [priv, pub, why] of [
      [t.code, t.group, "group letter only"], [t.group, mine, "letter as slip"], [t.code, decoy(t.group, 0).code, "decoy"], [t.code, decoy(t.group, 1).code, "second decoy"],
      [t.code, matchCard(sameGroupOther).code, "another team's card, same group"], [t.code, matchCard(otherGroup).code, "a card of another group"],
      [slip(sameGroupOther).code, mine, "another team's fragment with my own card"], [t.code, "W-000000-000000-000000-000000", "unknown card"], ["not a code", mine, "malformed"], [t.code, t.code, "slip typed as wall card"],
    ] as const) { const r = await attempt("G02", { privateCode: priv, publicCode: pub }); expect(r.matched, why).toBe(false); expect(r.unlocked, why).toBe(false); }
    expect(await attempt("G02", { privateCode: t.code, publicCode: mine, extra: 1 })).toMatchObject({ matched: false }); // strict payload
    const s = await svc.teamState("G02"); expect(s.insiderUnlocked).toBe(false); expect(s.insiderGroup?.solved).toBe(false);
    expect((await dossierFor("G02")).body.dossier).toBeNull();
    expect(await db.submission.count({ where: { teamId: "G02", reason: "fragment-rejected" } })).toBeGreaterThanOrEqual(11);
  });

  it("the same answer in another format (case, spaces, hyphens) matches", async () => {
    await asTeam("G02"); const loose = (c: string) => c.toLowerCase().replace(/-/g, " ");
    expect(await attempt("G02", { privateCode: loose(slip("G02").code), publicCode: ` ${matchCard("G02").code.toLowerCase()} ` })).toMatchObject({ matched: true, unlocked: true });
  });

  it("team isolation: team B cannot use team A's fragment or card, and nothing changes for either", async () => {
    await asTeam("G03"); const a = ids.find(id => id !== "G03" && slip(id).group === slip("G03").group && id !== "G01" && id !== "G02")!;
    expect((await attempt("G03", { privateCode: slip(a).code, publicCode: matchCard(a).code })).matched).toBe(false); // both of A's pieces
    expect((await attempt("G03", { privateCode: slip("G03").code, publicCode: matchCard(a).code })).matched).toBe(false);
    expect((await svc.teamState(a)).insiderGroup?.solved).toBe(false); expect((await svc.teamState("G03")).insiderGroup?.solved).toBe(false);
  });

  it("scored tasks stay sealed until the match; the existing task flow opens afterwards", async () => {
    await asTeam("G04"); const early = await svc.mutateTeam("G04", 2, "submit", { employeeId: "EMP-A-01" }, "insider.suspect") as { error?: string }; expect(early.error).toMatch(/Unlock the dossier/);
    await attempt("G04", { privateCode: slip("G04").code, publicCode: matchCard("G04").code });
    await db.submission.updateMany({ where: { teamId: "G04" }, data: { createdAt: new Date(Date.now() - 10_000) } });
    const ok = await svc.mutateTeam("G04", 2, "submit", { employeeId: "EMP-A-01" }, "insider.suspect") as { error?: string }; expect(ok.error ?? "").not.toMatch(/Unlock the dossier/);
  });

  it("no solution leaks through participant responses: no code, no card role, no other team's group", async () => {
    const all = [...sheets.slips.map(s => s.code), ...sheets.wall.map(c => c.code)];
    for (const team of ["G05", "G06"]) {
      await asTeam(team);
      const bodies = [JSON.stringify(await svc.teamState(team)), await (await route.GET()).text(), JSON.stringify(await attempt(team, { privateCode: slip(team).code, publicCode: decoy(slip(team).group).code }))];
      for (const body of bodies) { for (const c of all) expect(body).not.toContain(c); expect(body).not.toMatch(/"role":"(?:match|decoy)"|decoy|privateCode|publicCode|wallCard|insiderWall/i); }
    }
  });

  it("legacy data stays safe: a three-pair team and a two-fragment team keep working and are not converted by preparation", async () => {
    await mkTeam("T3", "A"); await mkTeam("L1", "A"); await mkTeam("L2", "B");
    // an earlier three-pair team (rows exactly as the previous release wrote them) with its variant-level cards
    await db.insiderAccess.create({ data: { teamId: "T3", fragmentA: "A-333333-333333-333333-333333", fragmentB: "B-333333-333333-333333-333333" } });
    await db.insiderPair.createMany({ data: (["A", "B", "C"] as const).map(pair => ({ teamId: "T3", pair, privateCode: `P-${pair.repeat(6)}-${pair.repeat(6)}-${pair.repeat(6)}-${pair.repeat(6)}`.replace(/[^A-F0-9P-]/g, "A") })) });
    const cardA = "W-AAAAAA-AAAAAA-AAAAAA-AAAAAA"; await db.insiderWallCard.create({ data: { code: cardA, variant: "A", pair: "A", role: "match" } });
    await db.insiderAccess.create({ data: { teamId: "L1", fragmentA: "A-111111-222222-333333-444444", fragmentB: "B-555555-666666-777777-888888", unlockedAt: new Date() } });
    await db.insiderAccess.create({ data: { teamId: "L2", fragmentA: "A-AAAAAA-BBBBBB-CCCCCC-DDDDDD", fragmentB: "B-EEEEEE-FFFFFF-000000-111111" } });
    await asAdmin(); const after = (await kit.insiderGroupSheets(["G01", "G02"]))!; // preparing selected teams touches nobody else
    expect(after.slips).toHaveLength(30); expect(await db.insiderPair.count({ where: { teamId: { in: ["L1", "L2"] } } })).toBe(0); expect(await db.insiderPair.count({ where: { teamId: "T3" } })).toBe(3);
    const o = (await kit.insiderGroupOverview())!; expect(o).toMatchObject({ teams: 33, prepared: 30, unassigned: 2, legacy: 1, final: false }); // demonstration roster is labelled, not "final"
    // three-pair team: one solved pair opens only its folder (as before), the legacy API shape is unchanged
    await asTeam("T3"); expect((await svc.teamState("T3")).insiderPairs).toEqual({ A: false, B: false, C: false }); expect((await svc.teamState("T3")).insiderGroup).toBeNull();
    expect(await attempt("T3", { privateCode: "P-AAAAAA-AAAAAA-AAAAAA-AAAAAA", publicCode: cardA })).toMatchObject({ matched: true, pair: "A", unlocked: false });
    expect((await dossierFor("T3")).body.pairs).toEqual({ A: true, B: false, C: false });
    // two-fragment teams: unchanged gate
    const l1 = await dossierFor("L1"); expect(l1.body.unlocked).toBe(true); expect(l1.body.pairs).toBeUndefined(); expect(l1.body.group).toBeUndefined();
    expect(await attempt("L2", { fragmentA: "A-111111-222222-333333-444444", fragmentB: "B-EEEEEE-FFFFFF-000000-111111" })).toMatchObject({ unlocked: false });
    expect(await attempt("L2", { fragmentA: "A-AAAAAA-BBBBBB-CCCCCC-DDDDDD", fragmentB: "B-EEEEEE-FFFFFF-000000-111111" })).toMatchObject({ unlocked: true });
    // a group team cannot use its legacy fragments as a bypass
    const legacy = await db.insiderAccess.findUniqueOrThrow({ where: { teamId: "G07" } }); const r = await attempt("G07", { fragmentA: legacy.fragmentA, fragmentB: legacy.fragmentB }); expect(r.unlocked).toBe(false); expect((await svc.teamState("G07")).insiderUnlocked).toBe(false);
    // preparing all teams later assigns the two-fragment teams but never touches the three-pair team
    await asAdmin(); const full = (await kit.insiderGroupSheets())!; expect(full.slips.some(s => s.teamId === "T3")).toBe(false); expect(full.slips.some(s => s.teamId === "L1") && full.slips.some(s => s.teamId === "L2")).toBe(true);
    expect(full.summary.balanced).toBe(true); for (const id of ids) expect(full.slips.find(s => s.teamId === id)!.group).toBe(slip(id).group); // the 30 earlier assignments did not move
  });

  it("Demo Mode stays isolated: its simulated chapter state has no group and nothing is written", async () => {
    const s = demo.demoChapterState() as { insiderUnlocked?: boolean; insiderGroup?: unknown }; expect(s.insiderUnlocked).toBe(true); expect(s.insiderGroup ?? null).toBeNull();
    const pairs = await db.insiderPair.count(), cards = await db.insiderWallCard.count(); void demo.demoChapterState(); expect(await db.insiderPair.count()).toBe(pairs); expect(await db.insiderWallCard.count()).toBe(cards);
  });
});
