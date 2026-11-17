import "server-only";
import { session } from "@/lib/auth";
import { teamState } from "./service";
import { insiderDossier } from "./insider.server";

export async function insiderAccess() {
  const auth = await session("team");
  if (!auth?.teamId) return { status: 401 } as const;
  const state = await teamState(auth.teamId);
  if (state.status === "waiting" || state.progress.chapters[1].completedAt === null) return { status: 403 } as const;
  return { status: 200, state, dossier: state.insiderUnlocked ? insiderDossier(state.variant) : null } as const;
}
