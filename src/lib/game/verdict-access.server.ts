import "server-only";
import { session } from "@/lib/auth";
import { teamState } from "./service";
import { verdictEvidence } from "./verdict.server";

export async function verdictAccess() {
  const auth = await session("team");
  if (!auth?.teamId) return { status: 401 } as const;
  const state = await teamState(auth.teamId);
  if (state.status === "waiting" || !state.unlocked[4]) return { status: 403 } as const;
  return { status: 200, state, evidence: verdictEvidence(state.variant) } as const;
}
