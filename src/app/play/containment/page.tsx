import { redirect } from "next/navigation";
import { containmentAccess } from "@/lib/game/containment-access.server";
import { ContainmentDesk } from "@/components/game/containment-desk";
import { initialChapterState, initialDrafts } from "@/lib/game/page-state";
import { OsHeader } from "@/components/ui/os-header";
import { signOut } from "@/app/login/actions";

export default async function ContainmentPage() {
  const access = await containmentAccess();
  if (access.status === 401) redirect("/login?next=/play/containment");
  if (access.status === 403) redirect("/play");
  const { state } = access;
  const drafts = await initialDrafts(state.id, 3);
  return <div className="site-shell"><OsHeader area="Round 1 · Containment"><form action={signOut}><button className="button-primary">Log out</button></form></OsHeader><main className="dashboard-main containment-main"><a className="back-link" href="/play">← Investigation dashboard</a><ContainmentDesk evidence={access.evidence} cctv={access.cctv} initialState={initialChapterState(state)} initialDrafts={drafts} /></main></div>;
}
