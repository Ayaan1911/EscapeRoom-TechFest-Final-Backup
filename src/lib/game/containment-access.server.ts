import "server-only";
import { session } from "@/lib/auth";
import { teamState } from "./service";
import { containmentCctv, containmentEvidence } from "./containment.server";

/** Chapter 4 is fully digital: the security-room snapshot is part of the evidence every team sees on screen once the chapter is open (no printed copy, station or organizer grant). */
export async function containmentAccess() {
  const auth = await session("team");
  if (!auth?.teamId) return { status: 401 } as const;
  const state = await teamState(auth.teamId);
  if (state.status === "waiting" || !state.unlocked[3]) return { status: 403 } as const;
  return { status: 200, state, evidence: containmentEvidence(state.variant), cctv: containmentCctv(state.variant) } as const;
}
