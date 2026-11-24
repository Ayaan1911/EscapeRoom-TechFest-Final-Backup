import "server-only";
import { session } from "@/lib/auth";
import { db } from "@/lib/db";
import { insiderWallStation, newInsiderFragments } from "./insider-fragments.server";
import { groupSummary, PAIRS, prepareShared } from "./evidence-wall.server";

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

/** Organizer-only: the six shared fragments (three pairs) and which teams belong to each group. Preparation is idempotent: the codes are created once and an assigned team keeps its group;
 *  reprinting only reads. `teamIds` limits which teams get ASSIGNED, never which codes exist. */
export async function insiderSharedKit(teamIds?: string[], options: { prepare?: boolean } = {}) {
  if (!await session("admin")) return null;
  if (options.prepare ?? true) await db.$transaction(tx => prepareShared(tx, teamIds), { isolationLevel: "Serializable" });
  const [summary, codes, members] = await Promise.all([groupSummary(), db.insiderGroupCode.findMany(), db.insiderGroupMember.findMany({ orderBy: { teamId: "asc" }, select: { teamId: true, group: true, solvedAt: true } })]);
  const groups = PAIRS.map(group => {
    const c = codes.find(x => x.group === group);
    return { group, privateCode: c?.privateCode ?? null, publicCode: c?.publicCode ?? null, teams: members.filter(m => m.group === group).map(m => m.teamId), solved: members.filter(m => m.group === group && m.solvedAt).length };
  });
  return { summary, groups, ready: codes.length === PAIRS.length };
}
