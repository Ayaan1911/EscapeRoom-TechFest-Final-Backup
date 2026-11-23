import { redirect } from "next/navigation";
import { trailAccess } from "@/lib/game/trail-access.server";
import { TrailDesk } from "@/components/game/trail-desk";
import { initialChapterState, initialDrafts } from "@/lib/game/page-state";
import { OsHeader } from "@/components/ui/os-header";
import { signOut } from "@/app/login/actions";

export default async function TrailPage() {
  const access = await trailAccess();
  if (access.status === 401) redirect("/login?next=/play/trail");
  if (access.status === 403) redirect("/play");
  const { state, evidence } = access;
  const drafts = await initialDrafts(state.id, 1);
  return <div className="site-shell"><OsHeader area="Round 1 · Trail"><form action={signOut}><button className="button-primary">Log out</button></form></OsHeader><main className="dashboard-main trail-main"><a className="back-link" href="/play">← Investigation dashboard</a><TrailDesk evidence={evidence} initialState={initialChapterState(state)} initialDrafts={drafts} /></main></div>;
}
