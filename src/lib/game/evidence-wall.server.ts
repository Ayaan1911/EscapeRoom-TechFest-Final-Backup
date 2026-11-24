import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { InsiderDossier, InsiderRecord } from "@/types/insider";
import { newInsiderFragments } from "./insider-fragments.server";
import { competitorWhere } from "./roster";

// Evidence Wall, SHARED PAIRS (final design): exactly SIX fragments for the whole event: Private A/Public A, Private B/Public B, Private C/Public C. Each team is assigned ONE group once
// (30 teams -> exactly 10/10/10) and all teams of a group share that group's pair. The team enters the private and the public code; the server decides.
// EARLIER modes stay readable: one InsiderPair row + its own card = the earlier per-team group mode; three rows = the earlier three-pair wall; no rows = the original two-fragment gate.
// Evidence Wall v2 (earlier three-pair design, still supported): THREE independent pairs. A team holds three PRIVATE slips (team-specific random codes, in its envelope);
// the shared public wall holds, per team variant, one intended match per pair plus lookalike decoys. The participant compares the clues printed
// on a slip with the wall cards, then enters the slip code and the wall-card code. The server decides: the pair letter, the intended match and
// every decoy exist only in the event database (random codes), never in source or in any participant response.
import { FOLDERS, PAIRS, type Pair, type PairState } from "./evidence-wall-meta";
export { FOLDERS, PAIRS };
export type { Pair, PairState };
export const VARIANTS = ["A", "B", "C"] as const;
export const DECOYS_PER_PAIR = 2; // earlier three-pair mode only; the final design has no decoys
export const FINAL_ROSTER = 30; // the planned event size: 10 teams per group

const canonical = (value: string) => value.trim().toUpperCase().replace(/[\s-]/g, "");
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
/** Group mode: this team's assigned group and whether it is solved (null = not in group mode). Exposes only the team's own letter, which is printed on its access card.
 *  A shared-pair membership wins; otherwise the earlier per-team group mode (one InsiderPair row) is reported the same way. */
export async function groupView(teamId: string, tx: Db = db): Promise<{ group: Pair; solved: boolean } | null> {
  const member = await tx.insiderGroupMember.findUnique({ where: { teamId }, select: { group: true, solvedAt: true } });
  if (member) return { group: member.group as Pair, solved: !!member.solvedAt };
  const rows = await tx.insiderPair.findMany({ where: { teamId }, select: { pair: true, solvedAt: true } });
  return rows.length === 1 ? { group: rows[0].pair as Pair, solved: !!rows[0].solvedAt } : null;
}
/** True when the team takes part in any pair-based wall (shared, per-team or three-pair); false = the original two-fragment gate. */
export async function usesWall(tx: Db, teamId: string) {
  return (await tx.insiderGroupMember.count({ where: { teamId } })) + (await tx.insiderPair.count({ where: { teamId } })) > 0;
}

// ---------- shared pairs (FINAL design): six codes for the whole event ----------
// Short, easy to copy from a printed card: P-XXXX-XXXX / W-XXXX-XXXX from an alphabet without 0 O 1 I L (31^8 combinations; attempts are spaced 3 s apart by the server).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const chars = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const newSharedCode = (prefix: "P" | "W") => `${prefix}-${chars(4)}-${chars(4)}`;
export const sharedInputSchema = z.object({
  privateCode: z.string().max(64).transform(canonical).pipe(z.string().regex(/^P[2-9A-HJ-NP-Z]{8}$/)),
  publicCode: z.string().max(64).transform(canonical).pipe(z.string().regex(/^W[2-9A-HJ-NP-Z]{8}$/)),
}).strict();
const digest = (value: string) => createHash("sha256").update(value).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(canonical(a)), digest(canonical(b)));

/** Idempotent: creates the pair of each group that does not have one yet, never replaces an existing code (printed cards stay valid), safe under concurrent calls. */
export async function ensureGroupCodes(tx: Db) {
  const have = new Set((await tx.insiderGroupCode.findMany({ select: { group: true } })).map(r => r.group));
  const data = PAIRS.filter(g => !have.has(g)).map(group => ({ group, privateCode: newSharedCode("P"), publicCode: newSharedCode("W") }));
  if (data.length) await tx.insiderGroupCode.createMany({ data, skipDuplicates: true });
  return tx.insiderGroupCode.findMany({ orderBy: { group: "asc" } });
}

export type PairOutcome = { ok: true; pair: Pair; already: boolean; all: boolean; group?: boolean } | { ok: false };
/** Validate one pair for one team inside the caller's per-team transaction. Every failure is the same answer (no hint about which half was wrong). */
export async function solvePair(tx: Prisma.TransactionClient, team: { id: string; variant: string }, supplied: unknown, now: number): Promise<PairOutcome> {
  const member = await tx.insiderGroupMember.findUnique({ where: { teamId: team.id } });
  if (member) { // SHARED PAIRS: the team's own group's private + public code, and nothing else
    const parsed = sharedInputSchema.safeParse(supplied), codes = await tx.insiderGroupCode.findUnique({ where: { group: member.group } });
    if (!parsed.success || !codes) return { ok: false };
    const okPrivate = same(codes.privateCode, parsed.data.privateCode), okPublic = same(codes.publicCode, parsed.data.publicCode); // both always evaluated
    if (!okPrivate || !okPublic) return { ok: false };
    const group = member.group as Pair;
    if (member.solvedAt) return { ok: true, pair: group, already: true, all: true, group: true };
    await tx.insiderGroupMember.update({ where: { teamId: team.id }, data: { solvedAt: new Date(now) } });
    await tx.insiderAccess.upsert({ where: { teamId: team.id }, create: { teamId: team.id, ...newInsiderFragments(), unlockedAt: new Date(now) }, update: { unlockedAt: new Date(now) } }); // the single pair opens the whole dossier
    return { ok: true, pair: group, already: false, all: true, group: true };
  }
  const parsed = pairInputSchema.safeParse(supplied); // earlier modes (per-team group, three-pair): long random codes
  if (!parsed.success) return { ok: false };
  const mine = await tx.insiderPair.findMany({ where: { teamId: team.id } });
  const wanted = digest(parsed.data.privateCode);
  const hits = mine.filter(p => timingSafeEqual(digest(canonical(p.privateCode)), wanted)); // codes are stored as printed; compared canonically, all rows, no early exit
  const row = hits[0];
  if (!row) return { ok: false };
  if (mine.length === 1) { // earlier per-team group mode: the team's own match card
    const card = (await tx.insiderWallCard.findMany({ where: { teamId: team.id } })).find(c => canonical(c.code) === parsed.data.publicCode);
    if (!card || card.role !== "match" || card.teamId !== team.id || card.pair !== row.pair) return { ok: false };
    const group = row.pair as Pair;
    if (row.solvedAt) return { ok: true, pair: group, already: true, all: true, group: true };
    await tx.insiderPair.update({ where: { teamId_pair: { teamId: team.id, pair: group } }, data: { solvedAt: new Date(now) } });
    await tx.insiderAccess.update({ where: { teamId: team.id }, data: { unlockedAt: new Date(now) } });
    return { ok: true, pair: group, already: false, all: true, group: true };
  }
  const wall = (await tx.insiderWallCard.findMany({ where: { variant: team.variant, teamId: null } })).find(c => canonical(c.code) === parsed.data.publicCode); // three-pair: only the team's own variant is ever looked at
  if (!wall || wall.role !== "match" || wall.pair !== row.pair || wall.variant !== team.variant) return { ok: false };
  const pair = row.pair as Pair, others = mine.filter(p => p.pair !== row.pair);
  if (row.solvedAt) return { ok: true, pair, already: true, all: mine.every(p => p.solvedAt) };
  await tx.insiderPair.update({ where: { teamId_pair: { teamId: team.id, pair } }, data: { solvedAt: new Date(now) } });
  const all = others.every(p => p.solvedAt);
  if (all) await tx.insiderAccess.update({ where: { teamId: team.id }, data: { unlockedAt: new Date(now) } });
  return { ok: true, pair, already: false, all };
}

// ---------- preparation (organizer) ----------
export type GroupSummary = {
  teams: number; prepared: number; unassigned: number; earlier: number; counts: Record<Pair, number>;
  uniquePrivate: number; uniquePublic: number; codesReady: boolean; final: boolean; balanced: boolean; convertible: number;
};
/** Read-only organizer summary. `earlier` = teams on an earlier per-team or three-pair preparation (not counted as prepared); `convertible` = of those, teams with one per-team group
 *  that the explicit conversion can move to the shared pairs. `final` = the planned 30-team 10/10/10 split with all six codes in place. */
export async function groupSummary(tx: Db = db): Promise<GroupSummary> {
  const [teams, members, pairs, codes] = await Promise.all([tx.team.count({ where: competitorWhere }), tx.insiderGroupMember.findMany({ where: { team: competitorWhere }, select: { teamId: true, group: true } }), tx.insiderPair.findMany({ select: { teamId: true } }), tx.insiderGroupCode.count()]);
  const counts: Record<Pair, number> = { A: 0, B: 0, C: 0 }, memberIds = new Set(members.map(m => m.teamId));
  for (const m of members) counts[m.group as Pair]++;
  const perTeam = new Map<string, number>();
  for (const p of pairs) if (!memberIds.has(p.teamId)) perTeam.set(p.teamId, (perTeam.get(p.teamId) ?? 0) + 1);
  const prepared = members.length, earlier = perTeam.size, vals = Object.values(counts);
  return { teams, prepared, unassigned: teams - prepared - earlier, earlier, counts, uniquePrivate: codes, uniquePublic: codes, codesReady: codes === PAIRS.length, convertible: [...perTeam.values()].filter(n => n === 1).length,
    final: teams === FINAL_ROSTER && counts.A === 10 && counts.B === 10 && counts.C === 10 && codes === PAIRS.length, balanced: Math.max(...vals) - Math.min(...vals) <= 1 };
}
/** Once-only, balanced assignment into the three shared groups. Teams that already have a membership or any earlier pair row are never touched. New teams are shuffled (CSPRNG, so the
 *  split does not follow team-ID order) and each goes to the currently smallest group, so 30 teams always end exactly 10/10/10. The six codes are created once. Re-running changes nothing. */
export async function prepareShared(tx: Prisma.TransactionClient, teamIds?: string[]) {
  const codes = await ensureGroupCodes(tx);
  const teams = await tx.team.findMany({ where: { ...competitorWhere, ...(teamIds ? { id: { in: teamIds } } : {}) }, select: { id: true }, orderBy: { id: "asc" } });
  const taken = new Set([...(await tx.insiderGroupMember.findMany({ select: { teamId: true } })), ...(await tx.insiderPair.findMany({ select: { teamId: true } }))].map(r => r.teamId));
  const counts: Record<Pair, number> = { A: 0, B: 0, C: 0 };
  for (const m of await tx.insiderGroupMember.findMany({ where: { team: competitorWhere }, select: { group: true } })) counts[m.group as Pair]++;
  const fresh = teams.filter(t => !taken.has(t.id));
  for (let i = fresh.length - 1; i > 0; i--) { const j = randomInt(i + 1); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
  for (const team of fresh) {
    const min = Math.min(...PAIRS.map(g => counts[g])), smallest = PAIRS.filter(g => counts[g] === min), group = smallest[randomInt(smallest.length)];
    counts[group]++;
    await tx.insiderAccess.upsert({ where: { teamId: team.id }, create: { teamId: team.id, ...newInsiderFragments() }, update: {} }); // unlockedAt lives here
    await tx.insiderGroupMember.create({ data: { teamId: team.id, group } });
  }
  return { assigned: fresh.length, codes };
}
/** EXPLICIT conversion of the earlier per-team group preparation (one InsiderPair row per team): the team keeps its group letter and its solved state, and from now on uses the
 *  shared pair. Nothing is deleted or rewritten (the old rows stay as history and are ignored); a team that already unlocked stays unlocked. Three-pair and two-fragment teams are not touched. */
export async function convertEarlierToShared(tx: Prisma.TransactionClient) {
  await ensureGroupCodes(tx);
  const members = new Set((await tx.insiderGroupMember.findMany({ select: { teamId: true } })).map(m => m.teamId));
  const rows = await tx.insiderPair.findMany(), per = new Map<string, typeof rows>();
  for (const r of rows) per.set(r.teamId, [...(per.get(r.teamId) ?? []), r]);
  let converted = 0;
  for (const [teamId, list] of per) {
    if (members.has(teamId) || list.length !== 1) continue;
    await tx.insiderGroupMember.create({ data: { teamId, group: list[0].pair, solvedAt: list[0].solvedAt } });
    converted++;
  }
  return { converted };
}

/** The part of the dossier a team may see: only the folders of solved pairs (staff profiles once any pair is solved). */
export function openFolders(dossier: InsiderDossier, solved: PairState): InsiderDossier {
  const kinds = new Set<InsiderRecord["kind"]>(PAIRS.filter(p => solved[p]).flatMap(p => FOLDERS[p].kinds));
  return { caseId: dossier.caseId, suspects: PAIRS.some(p => solved[p]) ? dossier.suspects : [], records: dossier.records.filter(r => kinds.has(r.kind)) };
}
export const folderCards = (solved: PairState) => PAIRS.map(pair => ({ pair, title: FOLDERS[pair].title, blurb: FOLDERS[pair].blurb, solved: solved[pair] }));
