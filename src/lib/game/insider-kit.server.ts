import "server-only";
import { session } from "@/lib/auth";
import { db } from "@/lib/db";
import { insiderWallStation, newInsiderFragments } from "./insider-fragments.server";
import { ensureTeamPairs, ensureWallCards, PAIRS, VARIANTS } from "./evidence-wall.server";

export async function insiderPrintData(part: "A" | "B", teamIds?: string[]) {
  if (!await session("admin")) return null;
  const teams = await db.team.findMany({ where: teamIds ? { id: { in: teamIds } } : {}, select: { id: true }, orderBy: { id: "asc" } });
  const cards = [];
  for (const team of teams) {
    const access = await db.insiderAccess.upsert({ where: { teamId: team.id }, create: { teamId: team.id, ...newInsiderFragments() }, update: {} });
    cards.push({ teamId: team.id, station: insiderWallStation(team.id), fragment: part === "A" ? access.fragmentA : access.fragmentB });
  }
  return cards.sort((a, b) => a.station.localeCompare(b.station) || a.teamId.localeCompare(b.teamId));
}

/** Organizer-only CODE SHEETS for the three-pair Evidence Wall (not the final physical pack). Idempotent: a reprint never changes an issued code. */
export async function insiderPairSheets(teamIds?: string[]) {
  if (!await session("admin")) return null;
  await ensureWallCards();
  const teams = await db.team.findMany({ where: teamIds ? { id: { in: teamIds } } : {}, select: { id: true, variant: true }, orderBy: { id: "asc" } });
  const slips = [];
  for (const team of teams) for (const pair of await db.$transaction(tx => ensureTeamPairs(tx, team.id))) slips.push({ teamId: team.id, variant: team.variant, pair: pair.pair, code: pair.privateCode });
  const wall = await db.insiderWallCard.findMany({ orderBy: [{ variant: "asc" }, { pair: "asc" }, { role: "asc" }, { code: "asc" }] });
  return { slips, wall, pairs: PAIRS, variants: VARIANTS };
}
