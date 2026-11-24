import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { InsiderDossier, InsiderRecord } from "@/types/insider";
import { newInsiderFragments } from "./insider-fragments.server";

// Evidence Wall, GROUP MODE (current): each team is assigned ONE group A/B/C once (30 teams -> exactly 10/10/10), holds ONE private slip and has ONE
// matching public wall card of its own (plus shared decoys per group). The team enters its slip code and the wall-card code; the server decides.
// LEGACY modes stay readable: three InsiderPair rows = the earlier three-pair wall; no rows = the original two-fragment gate.
// Evidence Wall v2 (earlier three-pair design, still supported): THREE independent pairs. A team holds three PRIVATE slips (team-specific random codes, in its envelope);
// the shared public wall holds, per team variant, one intended match per pair plus lookalike decoys. The participant compares the clues printed
// on a slip with the wall cards, then enters the slip code and the wall-card code. The server decides: the pair letter, the intended match and
// every decoy exist only in the event database (random codes), never in source or in any participant response.
import { FOLDERS, PAIRS, type Pair, type PairState } from "./evidence-wall-meta";
export { FOLDERS, PAIRS };
export type { Pair, PairState };
export const VARIANTS = ["A", "B", "C"] as const;
export const DECOYS_PER_PAIR = 2;
export const DECOYS_PER_GROUP = 2;
export const FINAL_ROSTER = 30; // the planned event size: 10 teams per group

const canonical = (value: string) => value.trim().toUpperCase().replace(/[\s-]/g, "");
const newCode = (prefix: "P" | "W") => `${prefix}-${randomBytes(12).toString("hex").toUpperCase().match(/.{6}/g)!.join("-")}`;
export const pairInputSchema = z.object({
  privateCode: z.string().max(64).transform(canonical).pipe(z.string().regex(/^P[A-F0-9]{24}$/)),
  publicCode: z.string().max(64).transform(canonical).pipe(z.string().regex(/^W[A-F0-9]{24}$/)),
}).strict();
type Db = Prisma.TransactionClient | typeof db;

/** Legacy three-pair wall only: this team's solved flags, or null (group-mode and two-fragment teams). Contains no codes. */
export async function pairsView(teamId: string, tx: Db = db): Promise<PairState | null> {
  const rows = await tx.insiderPair.findMany({ where: { teamId }, select: { pair: true, solvedAt: true } });
  if (rows.length < 2) return null;
  return { A: !!rows.find(r => r.pair === "A")?.solvedAt, B: !!rows.find(r => r.pair === "B")?.solvedAt, C: !!rows.find(r => r.pair === "C")?.solvedAt };
}
/** Group mode: this team's assigned group and whether it is solved (null = not in group mode). Exposes only the team's own letter, which is printed on its slip. */
export async function groupView(teamId: string, tx: Db = db): Promise<{ group: Pair; solved: boolean } | null> {
  const rows = await tx.insiderPair.findMany({ where: { teamId }, select: { pair: true, solvedAt: true } });
  return rows.length === 1 ? { group: rows[0].pair as Pair, solved: !!rows[0].solvedAt } : null;
}

export type PairOutcome = { ok: true; pair: Pair; already: boolean; all: boolean; group?: boolean } | { ok: false };
/** Validate one pair for one team inside the caller's per-team transaction. Every failure is the same answer (no hint about which half was wrong). */
export async function solvePair(tx: Prisma.TransactionClient, team: { id: string; variant: string }, supplied: unknown, now: number): Promise<PairOutcome> {
  const parsed = pairInputSchema.safeParse(supplied);
  if (!parsed.success) return { ok: false };
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const mine = await tx.insiderPair.findMany({ where: { teamId: team.id } });
  const wanted = digest(parsed.data.privateCode);
  const hits = mine.filter(p => timingSafeEqual(digest(canonical(p.privateCode)), wanted)); // codes are stored as printed; compared canonically, all rows, no early exit
  const row = hits[0];
  if (!row) return { ok: false };
  if (mine.length === 1) { // GROUP MODE: the team's own match card, and nothing else
    const card = (await tx.insiderWallCard.findMany({ where: { teamId: team.id } })).find(c => canonical(c.code) === parsed.data.publicCode);
    if (!card || card.role !== "match" || card.teamId !== team.id || card.pair !== row.pair) return { ok: false };
    const group = row.pair as Pair;
    if (row.solvedAt) return { ok: true, pair: group, already: true, all: true, group: true };
    await tx.insiderPair.update({ where: { teamId_pair: { teamId: team.id, pair: group } }, data: { solvedAt: new Date(now) } });
    await tx.insiderAccess.update({ where: { teamId: team.id }, data: { unlockedAt: new Date(now) } }); // the single pair opens the whole dossier
    return { ok: true, pair: group, already: false, all: true, group: true };
  }
  const wall = (await tx.insiderWallCard.findMany({ where: { variant: team.variant, teamId: null } })).find(c => canonical(c.code) === parsed.data.publicCode); // legacy: only the team's own variant is ever looked at
  if (!wall || wall.role !== "match" || wall.pair !== row.pair || wall.variant !== team.variant) return { ok: false };
  const pair = row.pair as Pair, others = mine.filter(p => p.pair !== row.pair);
  if (row.solvedAt) return { ok: true, pair, already: true, all: mine.every(p => p.solvedAt) };
  await tx.insiderPair.update({ where: { teamId_pair: { teamId: team.id, pair } }, data: { solvedAt: new Date(now) } });
  const all = others.every(p => p.solvedAt);
  if (all) await tx.insiderAccess.update({ where: { teamId: team.id }, data: { unlockedAt: new Date(now) } });
  return { ok: true, pair, already: false, all };
}

// ---------- group assignment (organizer) ----------
export type GroupSummary = { teams: number; prepared: number; unassigned: number; legacy: number; counts: Record<Pair, number>; final: boolean; balanced: boolean };
/** Read-only organizer summary. `legacy` = teams on the earlier three-pair wall (not counted as prepared). `final` = the planned 30-team 10/10/10 split is complete. */
export async function groupSummary(tx: Db = db): Promise<GroupSummary> {
  const [teams, rows] = await Promise.all([tx.team.count(), tx.insiderPair.findMany({ select: { teamId: true, pair: true } })]);
  const byTeam = new Map<string, string[]>();
  for (const r of rows) byTeam.set(r.teamId, [...(byTeam.get(r.teamId) ?? []), r.pair]);
  const counts: Record<Pair, number> = { A: 0, B: 0, C: 0 };
  let legacy = 0;
  for (const g of byTeam.values()) { if (g.length === 1) counts[g[0] as Pair]++; else legacy++; }
  const prepared = counts.A + counts.B + counts.C, vals = Object.values(counts);
  return { teams, prepared, unassigned: teams - prepared - legacy, legacy, counts, final: teams === FINAL_ROSTER && counts.A === 10 && counts.B === 10 && counts.C === 10, balanced: Math.max(...vals) - Math.min(...vals) <= 1 };
}
/** Once-only, balanced assignment. Teams that already hold a pair row (any mode) are never touched. New teams are shuffled (CSPRNG, so the split does not follow team-ID order)
 *  and each goes to the currently smallest group, so 30 teams always end 10/10/10 and later additions keep the split within one team. Persisted; re-running changes nothing. */
export async function prepareGroups(tx: Prisma.TransactionClient, teamIds?: string[]) {
  const teams = await tx.team.findMany({ where: teamIds ? { id: { in: teamIds } } : {}, select: { id: true, variant: true }, orderBy: { id: "asc" } });
  const existing = await tx.insiderPair.findMany({ select: { teamId: true, pair: true } });
  const have = new Set(existing.map(r => r.teamId)), counts: Record<Pair, number> = { A: 0, B: 0, C: 0 };
  const perTeam = new Map<string, number>();
  for (const r of existing) perTeam.set(r.teamId, (perTeam.get(r.teamId) ?? 0) + 1);
  for (const r of existing) if (perTeam.get(r.teamId) === 1) counts[r.pair as Pair]++;
  const fresh = teams.filter(t => !have.has(t.id));
  for (let i = fresh.length - 1; i > 0; i--) { const j = randomInt(i + 1); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
  for (const team of fresh) {
    const min = Math.min(...PAIRS.map(g => counts[g])), smallest = PAIRS.filter(g => counts[g] === min), group = smallest[randomInt(smallest.length)];
    counts[group]++;
    await tx.insiderAccess.upsert({ where: { teamId: team.id }, create: { teamId: team.id, ...newInsiderFragments() }, update: {} }); // unlockedAt lives here
    await tx.insiderPair.create({ data: { teamId: team.id, pair: group, privateCode: newCode("P") } });
    await tx.insiderWallCard.create({ data: { code: newCode("W"), variant: team.variant, pair: group, role: "match", teamId: team.id } });
  }
  const decoys = await tx.insiderWallCard.groupBy({ by: ["pair"], where: { role: "decoy", teamId: null, variant: "*" }, _count: true });
  const data: { code: string; variant: string; pair: string; role: string }[] = [];
  for (const g of PAIRS) for (let i = decoys.find(d => d.pair === g)?._count ?? 0; i < DECOYS_PER_GROUP; i++) data.push({ code: newCode("W"), variant: "*", pair: g, role: "decoy" });
  if (data.length) await tx.insiderWallCard.createMany({ data });
  return { assigned: fresh.length };
}

/** The part of the dossier a team may see: only the folders of solved pairs (staff profiles once any pair is solved). */
export function openFolders(dossier: InsiderDossier, solved: PairState): InsiderDossier {
  const kinds = new Set<InsiderRecord["kind"]>(PAIRS.filter(p => solved[p]).flatMap(p => FOLDERS[p].kinds));
  return { caseId: dossier.caseId, suspects: PAIRS.some(p => solved[p]) ? dossier.suspects : [], records: dossier.records.filter(r => kinds.has(r.kind)) };
}
export const folderCards = (solved: PairState) => PAIRS.map(pair => ({ pair, title: FOLDERS[pair].title, blurb: FOLDERS[pair].blurb, solved: solved[pair] }));
