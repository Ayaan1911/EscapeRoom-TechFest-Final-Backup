import { redirect } from "next/navigation";
import { insiderAccess } from "@/lib/game/insider-access.server";
import { InsiderDesk } from "@/components/game/insider-desk";
import { initialChapterState, initialDrafts } from "@/lib/game/page-state";
import { Brand } from "@/components/ui/brand";
import { signOut } from "@/app/login/actions";

export default async function InsiderPage() {
  const access = await insiderAccess();
  if (access.status === 401) redirect("/login?next=/play/insider");
  if (access.status === 403) redirect("/play");
  const { state } = access;
  const drafts = await initialDrafts(state.id, 2);
  return <div className="site-shell"><header className="site-header"><Brand /><form action={signOut}><button className="button-primary">Log out</button></form></header><main className="dashboard-main insider-main"><a className="back-link" href="/play">← Investigation dashboard</a><InsiderDesk initialDossier={access.dossier} initialState={initialChapterState(state)} initialDrafts={drafts} /></main></div>;
}
