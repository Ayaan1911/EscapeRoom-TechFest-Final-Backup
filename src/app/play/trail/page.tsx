import { redirect } from "next/navigation";
import { trailAccess } from "@/lib/game/trail-access.server";
import { TrailDesk } from "@/components/game/trail-desk";
import { Brand } from "@/components/ui/brand";
import { signOut } from "@/app/login/actions";

export default async function TrailPage() {
  const access = await trailAccess();
  if (access.status === 401) redirect("/login?next=/play/trail");
  if (access.status === 403) redirect("/play");
  const { state, evidence } = access;
  return <div className="site-shell"><header className="site-header"><Brand /><form action={signOut}><button className="button-primary">Log out</button></form></header><main className="dashboard-main trail-main"><a className="back-link" href="/play">← Investigation dashboard</a><TrailDesk evidence={evidence} initialState={{ progress: state.progress, score: state.score, current: state.current, status: state.status, chapterHints: state.chapterHints, serverNow: state.serverNow, round: { deadline: state.round.deadline?.toISOString() ?? null } }} /></main></div>;
}
