import "server-only";
import { session } from "@/lib/auth";
import { teamState } from "./service";
import { trailEvidence } from "./trail.server";

export async function trailAccess() {
  const auth = await session("team");
  if (!auth?.teamId) return { status: 401 } as const;
  const state = await teamState(auth.teamId);
  if (state.status === "waiting" || state.progress.chapters[0].completedAt === null) return { status: 403 } as const;
  return { status: 200, state, evidence: trailEvidence(state.variant) } as const;
}
