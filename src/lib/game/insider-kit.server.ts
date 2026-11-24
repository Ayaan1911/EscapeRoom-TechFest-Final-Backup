import "server-only";
import { session } from "@/lib/auth";
import { db } from "@/lib/db";
import { insiderWallStation, newInsiderFragments } from "./insider-fragments.server";
import { groupSummary, PAIRS, prepareGroups } from "./evidence-wall.server";

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

/** Organizer-only: the group summary (read-only, never creates anything). */
export async function insiderGroupOverview() {
  if (!await session("admin")) return null;
  return groupSummary();
}

/** Organizer-only CODE SHEETS for the one-group-per-team Evidence Wall (not the final physical pack). Idempotent: a reprint never changes an assignment or an issued code.
 *  `teamIds` limits PREPARATION; the sheets always list every prepared team so the wall stays complete. */
export async function insiderGroupSheets(teamIds?: string[], options: { prepare?: boolean } = {}) {
  if (!await session("admin")) return null;
  if (options.prepare ?? true) await db.$transaction(tx => prepareGroups(tx, teamIds), { isolationLevel: "Serializable" });
  const [summary, teams, pairs, cards] = await Promise.all([groupSummary(), db.team.findMany({ select: { id: true, name: true, variant: true } }), db.insiderPair.findMany({ orderBy: { teamId: "asc" } }), db.insiderWallCard.findMany({ orderBy: { code: "asc" } })]);
  const byTeam = new Map(teams.map(t => [t.id, t])), perTeam = new Map<string, number>();
  for (const p of pairs) perTeam.set(p.teamId, (perTeam.get(p.teamId) ?? 0) + 1);
  const slips = pairs.filter(p => perTeam.get(p.teamId) === 1).map(p => ({ teamId: p.teamId, teamName: byTeam.get(p.teamId)?.name ?? "", variant: byTeam.get(p.teamId)?.variant ?? "", group: p.pair, code: p.privateCode }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.teamId.localeCompare(b.teamId));
  const wall = cards.filter(c => c.teamId !== null || c.variant === "*").map(c => ({ code: c.code, group: c.pair, role: c.role, teamId: c.teamId }));
  return { summary, slips, wall, groups: PAIRS };
}
