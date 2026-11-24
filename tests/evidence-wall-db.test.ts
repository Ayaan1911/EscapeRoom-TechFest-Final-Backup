import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine";

// Three-pair Evidence Wall (Insider chapter). Disposable local PostgreSQL only (GHOST_DB_TEST=1).
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value), delete: (key: string) => jar.delete(key) }) }));

describe.skipIf(process.env.GHOST_DB_TEST !== "1")("Evidence Wall: three public/private pairs (PostgreSQL)", { timeout: 180_000 }, () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let db: typeof import("../src/lib/db").db, auth: typeof import("../src/lib/auth"), svc: typeof import("../src/lib/game/service"), kit: typeof import("../src/lib/game/insider-kit.server"), wall: typeof import("../src/lib/game/evidence-wall.server");
  let route: typeof import("../src/app/api/game/insider/route"), dossierOf: typeof import("../src/lib/game/insider.server").insiderDossier, demo: typeof import("../src/lib/demo/demo.server");
  const code = "temporary-test-access-only";
  const teams: [string, string][] = [["E01", "A"], ["E02", "A"], ["E03", "B"], ["E04", "C"], ["L01", "A"], ["L02", "A"]];
  type Sheets = NonNullable<Awaited<ReturnType<typeof kit.insiderPairSheets>>>;
  let sheets: Sheets;
  const asTeam = async (id: string) => { await auth.logout(); expect(await auth.login("team", id, code)).toBe(true); };
  const asAdmin = async () => { await auth.logout(); expect(await auth.login("admin", "organizer", code)).toBe(true); };
  const slip = (team: string, pair: string) => sheets.slips.find(s => s.teamId === team && s.pair === pair)!.code;
  const card = (variant: string, pair: string, role = "match", n = 0) => sheets.wall.filter(c => c.variant === variant && c.pair === pair && c.role === role)[n].code;
  const variantOf = (id: string) => teams.find(t => t[0] === id)![1];
  /** One unlock attempt as the team. The 3-second spacing rule is real; the test backdates its own submissions instead of sleeping. */
  async function attempt(team: string, payload: unknown) { await db.submission.updateMany({ where: { teamId: team }, data: { createdAt: new Date(Date.now() - 10_000) } }); return svc.mutateTeam(team, 2, "unlock", payload) as Promise<{ unlocked?: boolean; matched?: boolean; pair?: string; already?: boolean; error?: string }>; }
  const solvedOf = async (team: string) => (await svc.teamState(team)).insiderPairs;
  const progressOf = async (team: string) => (await db.team.findUniqueOrThrow({ where: { id: team } })).progress;
  const dossierFor = async (team: string) => { await asTeam(team); const r = await route.GET(); return { code: r.status, body: await r.json() as { unlocked?: boolean; pairs?: unknown; dossier: null | { suspects: unknown[]; records: { id: string; kind: string }[] } } }; };

  beforeAll(async () => {
    temp = await createTempDatabase("wall");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url; process.env.ADMIN_ACCESS_HASH = hashPassword(code); process.env.APP_ORIGIN = "http://127.0.0.1:3000";
    ({ db } = await import("../src/lib/db")); auth = await import("../src/lib/auth"); svc = await import("../src/lib/game/service"); kit = await import("../src/lib/game/insider-kit.server"); wall = await import("../src/lib/game/evidence-wall.server");
    route = await import("../src/app/api/game/insider/route"); dossierOf = (await import("../src/lib/game/insider.server")).insiderDossier; demo = await import("../src/lib/demo/demo.server");
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(Date.now() - 600_000), deadline: new Date(Date.now() + 3_000_000), scoringPolicy: "best-v1" } });
    for (const [id, variant] of teams) { const p = initialProgress(); p.chapters[0].score = 15; p.chapters[0].unlockedAt = Date.now() - 500_000; p.chapters[1].score = 25; p.chapters[1].unlockedAt = Date.now() - 400_000; p.chapters[2].unlockedAt = Date.now() - 300_000; await db.team.create({ data: { id, name: `Team ${id}`, participants: "[]", codeHash: hashPassword(code), variant, progress: JSON.stringify(p) } }); }
    // legacy rows exactly as before this feature: fragments known, L01 already unlocked, no pair rows
    await db.insiderAccess.create({ data: { teamId: "L01", fragmentA: "A-111111-222222-333333-444444", fragmentB: "B-555555-666666-777777-888888", unlockedAt: new Date() } });
    await db.insiderAccess.create({ data: { teamId: "L02", fragmentA: "A-AAAAAA-BBBBBB-CCCCCC-DDDDDD", fragmentB: "B-EEEEEE-FFFFFF-000000-111111" } });
    await asAdmin(); sheets = (await kit.insiderPairSheets(["E01", "E02", "E03", "E04"]))!;
  });
  afterAll(async () => { await db?.$disconnect(); await temp?.drop(); });

  it("organizer code sheets: 3 private slips per team, 1 match + 2 decoys per pair per variant, stable on reprint, organizer-only", async () => {
    expect(sheets.slips).toHaveLength(12); expect(new Set(sheets.slips.map(s => s.code)).size).toBe(12);
    expect(sheets.wall).toHaveLength(27); expect(sheets.wall.filter(c => c.role === "match")).toHaveLength(9); expect(sheets.wall.filter(c => c.role === "decoy")).toHaveLength(18);
    for (const v of ["A", "B", "C"]) for (const p of ["A", "B", "C"]) { expect(card(v, p, "match")).toMatch(/^W-/); expect(sheets.wall.filter(c => c.variant === v && c.pair === p && c.role === "match")).toHaveLength(1); }
    expect(sheets.slips.every(s => /^P-(?:[A-F0-9]{6}-){3}[A-F0-9]{6}$/.test(s.code))).toBe(true);
    const again = (await kit.insiderPairSheets(["E01", "E02", "E03", "E04"]))!; expect(again.slips.map(s => s.code)).toEqual(sheets.slips.map(s => s.code)); expect(again.wall.map(c => c.code)).toEqual(sheets.wall.map(c => c.code));
    await auth.logout(); expect(await kit.insiderPairSheets()).toBeNull(); await asTeam("E01"); expect(await kit.insiderPairSheets()).toBeNull();
    expect(await db.insiderPair.count()).toBe(12); // no pairs for teams that were not prepared
  });

  it("every evidence folder is non-empty for every variant (each reveal has a real purpose) and the three folders partition the dossier", () => {
    for (const v of ["A", "B", "C"]) {
      const d = dossierOf(v), by = (pair: "A" | "B" | "C") => d.records.filter(r => wall.FOLDERS[pair].kinds.includes(r.kind));
      for (const p of ["A", "B", "C"] as const) expect(by(p).length, `variant ${v} folder ${p}`).toBeGreaterThan(0);
      expect(by("A").length + by("B").length + by("C").length).toBe(d.records.length);
    }
  });

  it("correct pairing A, B and C each open their own folder, one at a time", async () => {
    await asTeam("E01");
    expect(await solvedOf("E01")).toEqual({ A: false, B: false, C: false });
    expect(await attempt("E01", { privateCode: slip("E01", "A"), publicCode: card("A", "A") })).toMatchObject({ matched: true, pair: "A", unlocked: false });
    expect(await solvedOf("E01")).toEqual({ A: true, B: false, C: false });
    expect(await attempt("E01", { privateCode: slip("E01", "B"), publicCode: card("A", "B") })).toMatchObject({ matched: true, pair: "B", unlocked: false });
    expect(await solvedOf("E01")).toEqual({ A: true, B: true, C: false });
  });

  it("each solved pair opens ONLY its own folder in the participant API (staff profiles after the first)", async () => {
    const d = await dossierFor("E01"); expect(d.code).toBe(200); expect(d.body.unlocked).toBe(false);
    const kinds = new Set(d.body.dossier!.records.map(r => r.kind)); expect([...kinds].sort()).toEqual(["access", "approval", "custody", "policy"]); // A + B folders only
    expect(kinds.has("message")).toBe(false); expect(kinds.has("timeline")).toBe(false); expect(d.body.dossier!.suspects.length).toBeGreaterThan(0);
  });

  it("wrong combinations never validate: A+B, A+C, B+A, a decoy, a card from another variant, garbage", async () => {
    await asTeam("E02");
    for (const [priv, pub, why] of [[slip("E02", "A"), card("A", "B"), "A+B"], [slip("E02", "A"), card("A", "C"), "A+C"], [slip("E02", "B"), card("A", "A"), "B+A"], [slip("E02", "C"), card("A", "A"), "C+A"],
      [slip("E02", "A"), card("A", "A", "decoy", 0), "decoy of A"], [slip("E02", "A"), card("A", "A", "decoy", 1), "second decoy"], [slip("E02", "A"), card("B", "A"), "match of ANOTHER variant"], [slip("E02", "A"), "W-000000-000000-000000-000000", "unknown wall code"],
      ["not a code", card("A", "A"), "malformed"], [slip("E02", "A"), slip("E02", "A"), "slip typed as wall card"]]) {
      const r = await attempt("E02", { privateCode: priv, publicCode: pub }); expect(r.matched, why).toBe(false); expect(r.unlocked, why).toBe(false);
    }
    expect(await attempt("E02", { privateCode: slip("E02", "A"), publicCode: card("A", "A"), extra: 1 })).toMatchObject({ matched: false }); // strict payload
    expect(await solvedOf("E02")).toEqual({ A: false, B: false, C: false });
    expect(await db.submission.count({ where: { teamId: "E02", reason: "fragment-rejected" } })).toBeGreaterThanOrEqual(10); // rejections are recorded, never counted as progress
  });

  it("the same answer in a different format still matches (case, spaces, hyphens), and a repeat is harmless", async () => {
    const loose = (c: string) => c.toLowerCase().replace(/-/g, " ");
    const first = await attempt("E02", { privateCode: loose(slip("E02", "C")), publicCode: ` ${card("A", "C").toLowerCase()} ` }); expect(first).toMatchObject({ matched: true, pair: "C", already: false });
    const auditBefore = await db.auditLog.count({ where: { actor: "E02", action: "pair-solve" } });
    const again = await attempt("E02", { privateCode: slip("E02", "C"), publicCode: card("A", "C") }); expect(again).toMatchObject({ matched: true, pair: "C", already: true });
    expect(await db.auditLog.count({ where: { actor: "E02", action: "pair-solve" } })).toBe(auditBefore); // no duplicate record
    expect(await solvedOf("E02")).toEqual({ A: false, B: false, C: true });
  });

  it("progress survives a refresh: state is read from the server every time", async () => {
    expect(await solvedOf("E01")).toEqual({ A: true, B: true, C: false });
    const again = await dossierFor("E01"); expect(again.body.pairs).toEqual({ A: true, B: true, C: false });
  });

  it("a team cannot unlock another team's evidence: its own wall card with someone else's slip fails and changes nothing", async () => {
    await asTeam("E02");
    const r = await attempt("E02", { privateCode: slip("E01", "C"), publicCode: card("A", "C") }); expect(r.matched).toBe(false); // E01's slip, correct card
    expect(await solvedOf("E01")).toEqual({ A: true, B: true, C: false }); expect(await solvedOf("E02")).toEqual({ A: false, B: false, C: true });
  });

  it("different teams solving at the same moment do not interfere", async () => {
    const [x, y] = await Promise.all([attempt("E03", { privateCode: slip("E03", "A"), publicCode: card("B", "A") }), attempt("E04", { privateCode: slip("E04", "B"), publicCode: card("C", "B") })]);
    expect(x).toMatchObject({ matched: true, pair: "A" }); expect(y).toMatchObject({ matched: true, pair: "B" });
    expect(await solvedOf("E03")).toEqual({ A: true, B: false, C: false }); expect(await solvedOf("E04")).toEqual({ A: false, B: true, C: false });
    expect((await attempt("E03", { privateCode: slip("E03", "A"), publicCode: card("C", "A") })).matched).toBe(false); // variant C's card is not E03's (variant B)
  });

  it("scored submissions stay sealed until all three folders are open; no progress or chapter state changes while matching", async () => {
    const before = await progressOf("E01");
    await asTeam("E01"); const early = await svc.mutateTeam("E01", 2, "submit", { employeeId: "EMP-A-01" }, "insider.suspect") as { error?: string }; expect(early.error).toMatch(/Unlock the dossier/);
    expect(await progressOf("E01")).toBe(before); // matching and the refused submission touched no score, hint or chapter unlock
    const state = await svc.teamState("E01"); expect(state.insiderUnlocked).toBe(false); expect(state.unlocked[2]).toBe(true);
  });

  it("completion at 3/3 opens the whole dossier once, without submitting anything or changing the score", async () => {
    const before = await progressOf("E01"), scoreBefore = (await svc.teamState("E01")).score;
    const r = await attempt("E01", { privateCode: slip("E01", "C"), publicCode: card("A", "C") });
    expect(r).toMatchObject({ matched: true, pair: "C", unlocked: true });
    expect(await solvedOf("E01")).toEqual({ A: true, B: true, C: true }); expect((await svc.teamState("E01")).insiderUnlocked).toBe(true);
    expect(await progressOf("E01")).toBe(before); expect((await svc.teamState("E01")).score).toBe(scoreBefore);
    expect(await db.auditLog.count({ where: { actor: "E01", action: "dossier-unlock" } })).toBe(1);
    const d = await dossierFor("E01"); expect(d.body.unlocked).toBe(true); expect(d.body.dossier!.records).toHaveLength(dossierOf("A").records.length);
    await db.submission.updateMany({ where: { teamId: "E01" }, data: { createdAt: new Date(Date.now() - 10_000) } });
    const ok = await svc.mutateTeam("E01", 2, "submit", { employeeId: "EMP-A-01" }, "insider.suspect") as { error?: string }; expect(ok.error ?? "").not.toMatch(/Unlock the dossier/); // the existing task flow is now reachable
  });

  it("direct access without a solved pair gets no evidence; anonymous and locked-chapter callers are refused", async () => {
    await auth.logout(); expect((await route.GET()).status).toBe(401);
    const none = await dossierFor("E04"); expect(none.code).toBe(200); expect(none.body.dossier).not.toBeNull(); // E04 solved one pair: only that folder
    expect([...new Set(none.body.dossier!.records.map(r => r.kind))].sort()).toEqual(wall.FOLDERS.B.kinds.slice().sort());
    await db.team.create({ data: { id: "E05", name: "No pairs solved", participants: "[]", codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(Object.assign(initialProgress(), { chapters: initialProgress().chapters.map((c, i) => i < 2 ? { ...c, score: i === 0 ? 15 : 25, unlockedAt: 1 } : { ...c, unlockedAt: 1 }) })) } });
    await asAdmin(); await kit.insiderPairSheets(["E05"]); await asTeam("E05"); const blank = await route.GET(); expect(blank.status).toBe(200); expect((await blank.json()).dossier).toBeNull(); // issued, nothing solved: nothing shown
    const locked = await dossierFor("L02"); expect(locked.body.dossier).toBeNull();
  });

  // note: round2.role in the team state is the unrelated Round 2 eligibility flag, hence the precise pattern below
  it("no solution leaks through participant responses: no slip code, wall code, pairing or card role", async () => {
    const all = [...sheets.slips.map(s => s.code), ...sheets.wall.map(c => c.code)];
    for (const team of ["E01", "E02", "E03", "E04"]) {
      await asTeam(team);
      const bodies = [JSON.stringify(await svc.teamState(team)), await (await route.GET()).text(), JSON.stringify(await attempt(team, { privateCode: slip(team, "A"), publicCode: card(variantOf(team), "B") }))];
      for (const body of bodies) { for (const c of all) expect(body).not.toContain(c); expect(body).not.toMatch(/"role":"(?:match|decoy)"|decoy|privateCode|publicCode|wallCard|insiderWall|insiderPair/i); }
    }
  });

  it("legacy compatibility: a team with no pairs keeps its unlocked dossier and the two-fragment unlock; pair teams cannot use it as a bypass", async () => {
    await asTeam("L01"); const done = await dossierFor("L01"); expect(done.body.unlocked).toBe(true); expect(done.body.pairs).toBeUndefined(); /* legacy response shape is unchanged */ expect(done.body.dossier!.records).toHaveLength(dossierOf("A").records.length); // already unlocked stays unlocked
    expect(await attempt("L02", { fragmentA: "A-111111-222222-333333-444444", fragmentB: "B-EEEEEE-FFFFFF-000000-111111" })).toMatchObject({ unlocked: false }); // wrong pair
    expect(await attempt("L02", { fragmentA: "A-AAAAAA-BBBBBB-CCCCCC-DDDDDD", fragmentB: "B-EEEEEE-FFFFFF-000000-111111" })).toMatchObject({ unlocked: true });
    const legacy = await db.insiderAccess.findUniqueOrThrow({ where: { teamId: "E02" } }); // E02 has pairs; its legacy fragments exist but must not open anything
    const r = await attempt("E02", { fragmentA: legacy.fragmentA, fragmentB: legacy.fragmentB }); expect(r.unlocked).toBe(false); expect((await svc.teamState("E02")).insiderUnlocked).toBe(false);
  });

  it("Demo Mode stays isolated: its simulated chapter state has no pairs and the kit/solve code never ran for it", async () => {
    const s = demo.demoChapterState() as { insiderUnlocked?: boolean; insiderPairs?: unknown }; expect(s.insiderUnlocked).toBe(true); expect(s.insiderPairs ?? null).toBeNull();
    const pairsBefore = await db.insiderPair.count(), wallBefore = await db.insiderWallCard.count(); void demo.demoChapterState(); expect(await db.insiderPair.count()).toBe(pairsBefore); expect(await db.insiderWallCard.count()).toBe(wallBefore);
  });
});
