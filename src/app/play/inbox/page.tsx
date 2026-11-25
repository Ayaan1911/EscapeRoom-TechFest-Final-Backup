import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { teamState } from "@/lib/game/service";
import { InboxDeskLoader } from "@/components/game/evidence-loader";
import { initialChapterState, initialDrafts } from "@/lib/game/page-state";
import { OsHeader } from "@/components/ui/os-header";
import { signOut } from "@/app/login/actions";

export default async function InboxPage() {
  const auth = await session("team");
  if (!auth?.teamId) redirect("/login?next=/play/inbox");
  const state = await teamState(auth.teamId);
  if (state.status === "waiting") redirect("/play");
  const drafts = await initialDrafts(state.id, 0);
  return <div className="site-shell"><OsHeader area="Round 1 · Inbox"><form action={signOut}><button className="button-primary">Log out</button></form></OsHeader><main className="dashboard-main inbox-main"><a className="back-link" href="/play">← Investigation dashboard</a><InboxDeskLoader initialState={initialChapterState(state)} initialDrafts={drafts} /></main></div>;
}
