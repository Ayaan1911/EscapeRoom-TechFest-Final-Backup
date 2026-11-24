import "server-only";
import { session } from "@/lib/auth";
import { teamState } from "./service";
import { insiderDossier } from "./insider.server";
import { openFolders } from "./evidence-wall.server";

export async function insiderAccess() {
  const auth = await session("team");
  if (!auth?.teamId) return { status: 401 } as const;
  const state = await teamState(auth.teamId);
  if (state.status === "waiting" || !state.unlocked[2]) return { status: 403 } as const;
  // Pair teams see only the folders they have reconstructed; teams without pairs (legacy) see the whole dossier once unlocked, as before.
  const pairs = state.insiderPairs, dossier = pairs ? (state.insiderUnlocked ? insiderDossier(state.variant) : pairs.A || pairs.B || pairs.C ? openFolders(insiderDossier(state.variant), pairs) : null) : state.insiderUnlocked ? insiderDossier(state.variant) : null;
  return { status: 200, state, dossier } as const;
}
