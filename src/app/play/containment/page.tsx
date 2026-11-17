import { redirect } from "next/navigation";
import { containmentAccess } from "@/lib/game/containment-access.server";
import { ContainmentDesk } from "@/components/game/containment-desk";
import { Brand } from "@/components/ui/brand";
import { signOut } from "@/app/login/actions";

export default async function ContainmentPage() {
  const access = await containmentAccess();
  if (access.status === 401) redirect("/login?next=/play/containment");
  if (access.status === 403) redirect("/play");
  const { state } = access;
  return <div className="site-shell"><header className="site-header"><Brand /><form action={signOut}><button className="button-primary">Log out</button></form></header><main className="dashboard-main containment-main"><a className="back-link" href="/play">← Investigation dashboard</a><ContainmentDesk evidence={access.evidence} initialCctv={access.fallbackCctv} initialState={{ progress: state.progress, score: state.score, current: state.current, status: state.status, serverNow: state.serverNow, round: { deadline: state.round.deadline?.toISOString() ?? null }, chapterHints: state.chapterHints }} /></main></div>;
}
