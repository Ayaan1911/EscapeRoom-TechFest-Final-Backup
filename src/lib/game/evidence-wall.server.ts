import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { InsiderDossier, InsiderRecord } from "@/types/insider";
import { newInsiderFragments } from "./insider-fragments.server";

// Evidence Wall v2 (Insider chapter): THREE independent pairs. A team holds three PRIVATE slips (team-specific random codes, in its envelope);
// the shared public wall holds, per team variant, one intended match per pair plus lookalike decoys. The participant compares the clues printed
// on a slip with the wall cards, then enters the slip code and the wall-card code. The server decides: the pair letter, the intended match and
// every decoy exist only in the event database (random codes), never in source or in any participant response.
import { FOLDERS, PAIRS, type Pair, type PairState } from "./evidence-wall-meta";
export { FOLDERS, PAIRS };
export type { Pair, PairState };
export const VARIANTS = ["A", "B", "C"] as const;
export const DECOYS_PER_PAIR = 2;

const canonical = (value: string) => value.trim().toUpperCase().replace(/[\s-]/g, "");
const newCode = (prefix: "P" | "W") => `${prefix}-${randomBytes(12).toString("hex").toUpperCase().match(/.{6}/g)!.join("-")}`;
export const pairInputSchema = z.object({
  privateCode: z.string().max(64).transform(canonical).pipe(z.string().regex(/^P[A-F0-9]{24}$/)),
  publicCode: z.string().max(64).transform(canonical).pipe(z.string().regex(/^W[A-F0-9]{24}$/)),
}).strict();
type Db = Prisma.TransactionClient | typeof db;

/** Idempotent: per variant and pair, exactly one match and DECOYS_PER_PAIR decoys. Never regenerates an existing card (printed cards stay valid). */
export async function ensureWallCards(tx: Db = db) {
  const rows = await tx.insiderWallCard.findMany({ select: { variant: true, pair: true, role: true } });
  const have = (variant: string, pair: string, role: string) => rows.filter(r => r.variant === variant && r.pair === pair && r.role === role).length;
  const data: { code: string; variant: string; pair: string; role: string }[] = [];
  for (const variant of VARIANTS) for (const pair of PAIRS) {
    for (let i = have(variant, pair, "match"); i < 1; i++) data.push({ code: newCode("W"), variant, pair, role: "match" });
    for (let i = have(variant, pair, "decoy"); i < DECOYS_PER_PAIR; i++) data.push({ code: newCode("W"), variant, pair, role: "decoy" });
  }
  if (data.length) await tx.insiderWallCard.createMany({ data });
  return data.length;
}
/** Idempotent: the three private slips of one team. Also makes sure the legacy InsiderAccess row exists (its unlockedAt is the "fully open" flag). */
export async function ensureTeamPairs(tx: Db, teamId: string) {
  await tx.insiderAccess.upsert({ where: { teamId }, create: { teamId, ...newInsiderFragments() }, update: {} });
  await tx.insiderPair.createMany({ data: PAIRS.map(pair => ({ teamId, pair, privateCode: newCode("P") })), skipDuplicates: true });
  return tx.insiderPair.findMany({ where: { teamId }, orderBy: { pair: "asc" } });
}

/** This team's solved flags, or null when no pairs were issued to it (legacy two-fragment gate). Contains no codes. */
export async function pairsView(teamId: string, tx: Db = db): Promise<PairState | null> {
  const rows = await tx.insiderPair.findMany({ where: { teamId }, select: { pair: true, solvedAt: true } });
  if (rows.length === 0) return null;
  return { A: !!rows.find(r => r.pair === "A")?.solvedAt, B: !!rows.find(r => r.pair === "B")?.solvedAt, C: !!rows.find(r => r.pair === "C")?.solvedAt };
}

export type PairOutcome = { ok: true; pair: Pair; already: boolean; all: boolean } | { ok: false };
/** Validate one pair for one team inside the caller's per-team transaction. Every failure is the same answer (no hint about which half was wrong). */
export async function solvePair(tx: Prisma.TransactionClient, team: { id: string; variant: string }, supplied: unknown, now: number): Promise<PairOutcome> {
  const parsed = pairInputSchema.safeParse(supplied);
  if (!parsed.success) return { ok: false };
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const mine = await tx.insiderPair.findMany({ where: { teamId: team.id } });
  const wanted = digest(parsed.data.privateCode);
  const hits = mine.filter(p => timingSafeEqual(digest(canonical(p.privateCode)), wanted)); // codes are stored as printed; compared canonically, all three, no early exit
  const row = hits[0];
  const wall = (await tx.insiderWallCard.findMany({ where: { variant: team.variant } })).find(c => canonical(c.code) === parsed.data.publicCode); // only the team's own variant is ever looked at
  if (!row || !wall || wall.role !== "match" || wall.pair !== row.pair || wall.variant !== team.variant) return { ok: false };
  const pair = row.pair as Pair, others = mine.filter(p => p.pair !== row.pair);
  if (row.solvedAt) return { ok: true, pair, already: true, all: mine.every(p => p.solvedAt) };
  await tx.insiderPair.update({ where: { teamId_pair: { teamId: team.id, pair } }, data: { solvedAt: new Date(now) } });
  const all = others.every(p => p.solvedAt);
  if (all) await tx.insiderAccess.update({ where: { teamId: team.id }, data: { unlockedAt: new Date(now) } });
  return { ok: true, pair, already: false, all };
}

/** The part of the dossier a team may see: only the folders of solved pairs (staff profiles once any pair is solved). */
export function openFolders(dossier: InsiderDossier, solved: PairState): InsiderDossier {
  const kinds = new Set<InsiderRecord["kind"]>(PAIRS.filter(p => solved[p]).flatMap(p => FOLDERS[p].kinds));
  return { caseId: dossier.caseId, suspects: PAIRS.some(p => solved[p]) ? dossier.suspects : [], records: dossier.records.filter(r => kinds.has(r.kind)) };
}
export const folderCards = (solved: PairState) => PAIRS.map(pair => ({ pair, title: FOLDERS[pair].title, blurb: FOLDERS[pair].blurb, solved: solved[pair] }));
