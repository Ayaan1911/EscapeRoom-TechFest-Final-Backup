import "server-only";
import { session } from "@/lib/auth";
import { db, serializable } from "@/lib/db";
import { progressSchema, status } from "./engine";
import { teamState } from "./service";
import { containmentCctv, containmentEvidence } from "./containment.server";

const grantWhere = (teamId: string) => ({ actor: "organizer", action: "containment-copy", detail: { contains: `"teamId":${JSON.stringify(teamId)},` } });
export async function containmentAccess() {
  const auth = await session("team");
  if (!auth?.teamId) return { status: 401 } as const;
  const state = await teamState(auth.teamId);
  if (state.status === "waiting" || state.progress.chapters[2].completedAt === null) return { status: 403 } as const;
  const grant = await db.auditLog.findFirst({ where: grantWhere(auth.teamId) });
  return { status: 200, state, evidence: containmentEvidence(state.variant), fallbackCctv: grant ? containmentCctv(state.variant) : null } as const;
}
export async function authorizeContainmentCopy(teamId: string, reason: string) {
  if (!await session("admin")) throw new Error("Organizer authorization required");
  return serializable(async tx => {
    const team = await tx.team.findUniqueOrThrow({ where: { id: teamId } });
    const round = await tx.gameSession.findUniqueOrThrow({ where: { id: 1 } });
    if (status(round) !== "active" || progressSchema.parse(JSON.parse(team.progress)).chapters[2].completedAt === null) throw new Error("Team must have access to active Containment");
    if (!await tx.auditLog.findFirst({ where: grantWhere(teamId) })) await tx.auditLog.create({ data: { actor: "organizer", action: "containment-copy", detail: JSON.stringify({ teamId, reason }) } });
  });
}
export async function containmentPrintData(variants: string[]) {
  if (!await session("admin")) return null;
  return variants.filter(variant => ["A", "B", "C"].includes(variant)).map(containmentCctv);
}
