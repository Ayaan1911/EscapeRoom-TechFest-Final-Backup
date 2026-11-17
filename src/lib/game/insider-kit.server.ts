import "server-only";
import { session } from "@/lib/auth";
import { db } from "@/lib/db";
import { insiderWallStation, newInsiderFragments } from "./insider-fragments.server";

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
