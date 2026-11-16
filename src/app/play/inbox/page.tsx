import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { teamState } from "@/lib/game/service";
import { inboxEvidence } from "@/lib/game/inbox.server";
import { InboxDesk } from "@/components/game/inbox-desk";
import { Brand } from "@/components/ui/brand";
import { signOut } from "@/app/login/actions";

export default async function InboxPage() {
  const auth = await session("team");
  if (!auth?.teamId) redirect("/login?next=/play/inbox");
  const state = await teamState(auth.teamId);
  if (state.status === "waiting") redirect("/play");
  const evidence = inboxEvidence(state.variant);
  return <div className="site-shell"><header className="site-header"><Brand /><form action={signOut}><button className="button-primary">Log out</button></form></header><main className="dashboard-main inbox-main"><a className="back-link" href="/play">← Investigation dashboard</a><InboxDesk evidence={{ caseId: evidence.caseId, recipient: evidence.recipient, emails: evidence.emails, artifacts: evidence.artifacts }} initialState={{ progress: state.progress, score: state.score, current: state.current, status: state.status, chapterHints: state.chapterHints, serverNow: state.serverNow, round: { deadline: state.round.deadline?.toISOString() ?? null } }} /></main></div>;
}
