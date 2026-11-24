import "server-only";
import { db } from "@/lib/db";
import { session } from "@/lib/auth";
import { participantStatus } from "./paper/service.server";

export type Access = { state: "anonymous" } | { state: "outsider" | "standby" | "withdrawn" | "active"; teamId: string; teamName: string };
/** Page-level access classification for /round2. Reads only; the team id comes from the session cookie. Never touches challenge content. */
export async function finalistAccess(): Promise<Access> {
  const auth = await session("team");
  if (!auth?.teamId) return { state: "anonymous" };
  const [team, finalist] = await Promise.all([db.team.findUnique({ where: { id: auth.teamId }, select: { name: true } }), db.r2Finalist.findUnique({ where: { teamId: auth.teamId }, select: { status: true } })]);
  const state = !finalist ? "outsider" : finalist.status === "standby" ? "standby" : finalist.status === "withdrawn" ? "withdrawn" : "active";
  return { state, teamId: auth.teamId, teamName: team?.name ?? auth.teamId };
}

export type Round2Entry = { decided: boolean; role: "none" | "finalist" | "standby"; phase: "not_started" | "running" | "complete" };
/** What THIS team may be told about Round 2 on its own dashboard. No other team's status, no standings, no content. */
export async function round2Entry(teamId: string): Promise<Round2Entry> {
  const [finalist, decided, status] = await Promise.all([
    db.r2Finalist.findUnique({ where: { teamId }, select: { status: true } }),
    db.auditLog.count({ where: { actor: "organizer", action: "qualification-confirmed" } }),
    participantStatus(),
  ]);
  const role = finalist?.status === "active" ? "finalist" : finalist?.status === "standby" ? "standby" : "none";
  return { decided: decided > 0, role, phase: status.phase };
}
