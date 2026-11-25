import "server-only";
import { session } from "@/lib/auth";
import { teamState } from "./service";
import { inboxEvidence } from "./inbox.server";

/** Same gate as /play/inbox: a team session and a round that is not waiting. Returns only the fields the Inbox desk renders
 * (the forensic snapshot stays on its own page, opened by the player). Never includes the solution. */
export async function inboxAccess() {
  const auth = await session("team");
  if (!auth?.teamId) return { status: 401 } as const;
  const state = await teamState(auth.teamId);
  if (state.status === "waiting") return { status: 403 } as const;
  const { caseId, recipient, emails, artifacts } = inboxEvidence(state.variant);
  return { status: 200, state, evidence: { caseId, recipient, emails, artifacts } } as const;
}
