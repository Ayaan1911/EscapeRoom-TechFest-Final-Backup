import { redirect } from "next/navigation";
import { verdictAccess } from "@/lib/game/verdict-access.server";
import { VerdictDesk } from "@/components/game/verdict-desk";
import { initialChapterState, initialDrafts } from "@/lib/game/page-state";
import { Brand } from "@/components/ui/brand";
import { signOut } from "@/app/login/actions";

export default async function VerdictPage() {
  const access = await verdictAccess();
  if (access.status === 401) redirect("/login?next=/play/verdict");
  if (access.status === 403) redirect("/play");
  const { state } = access;
  const drafts = await initialDrafts(state.id, 4);
  return <div className="site-shell"><header className="site-header"><Brand /><form action={signOut}><button className="button-primary">Log out</button></form></header><main className="dashboard-main verdict-main"><a className="back-link" href="/play">← Investigation dashboard</a><VerdictDesk evidence={access.evidence} team={{ id: state.id, name: state.name }} initialState={initialChapterState(state)} initialDrafts={drafts} /></main></div>;
}
