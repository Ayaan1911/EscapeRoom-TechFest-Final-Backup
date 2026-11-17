import { redirect } from "next/navigation";
import { verdictAccess } from "@/lib/game/verdict-access.server";
import { VerdictDesk } from "@/components/game/verdict-desk";
import { Brand } from "@/components/ui/brand";
import { signOut } from "@/app/login/actions";

export default async function VerdictPage() {
  const access = await verdictAccess();
  if (access.status === 401) redirect("/login?next=/play/verdict");
  if (access.status === 403) redirect("/play");
  const { state } = access;
  return <div className="site-shell"><header className="site-header"><Brand /><form action={signOut}><button className="button-primary">Log out</button></form></header><main className="dashboard-main verdict-main"><a className="back-link" href="/play">← Investigation dashboard</a><VerdictDesk evidence={access.evidence} team={{ id: state.id, name: state.name }} initialState={{ progress: state.progress, score: state.score, current: state.current, status: state.status, serverNow: state.serverNow, round: { deadline: state.round.deadline?.toISOString() ?? null }, chapterHints: state.chapterHints }} /></main></div>;
}
