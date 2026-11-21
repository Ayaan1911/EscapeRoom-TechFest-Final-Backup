import "server-only";
import { db } from "@/lib/db";
import { session } from "@/lib/auth";

export type Access = { state: "anonymous" } | { state: "outsider" | "standby" | "withdrawn" | "active"; teamId: string; teamName: string };
/** Page-level access classification for /round2. Reads only; the team id comes from the session cookie. Never touches challenge content. */
export async function finalistAccess(): Promise<Access> {
  const auth = await session("team");
  if (!auth?.teamId) return { state: "anonymous" };
  const [team, finalist] = await Promise.all([db.team.findUnique({ where: { id: auth.teamId }, select: { name: true } }), db.r2Finalist.findUnique({ where: { teamId: auth.teamId }, select: { status: true } })]);
  const state = !finalist ? "outsider" : finalist.status === "standby" ? "standby" : finalist.status === "withdrawn" ? "withdrawn" : "active";
  return { state, teamId: auth.teamId, teamName: team?.name ?? auth.teamId };
}
