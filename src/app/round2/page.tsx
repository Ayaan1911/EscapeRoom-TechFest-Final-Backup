import { redirect } from "next/navigation";
import { OsHeader } from "@/components/ui/os-header";
import { Restricted } from "@/components/round2/states";
import { PaperShell } from "@/components/round2/paper/paper-shell";
import { signOut } from "@/app/login/actions";
import { finalistAccess } from "@/lib/round2/access.server";
import { participantStatus } from "@/lib/round2/paper/service.server";
import { OpenShell } from "@/components/round2/paper/open-shell";

export const dynamic = "force-dynamic";
// GHOST RETURNS (paper edition). Server-rendered gate: the initial HTML carries only the chapter the server clock has open right now.
export default async function Round2Page() {
  const access = await finalistAccess();
  if (access.state === "anonymous") redirect("/login?next=/round2");
  const shell = (body: React.ReactNode) => <div className="site-shell r2-site"><OsHeader area="Round 2 · Paper investigation"><form action={signOut}><button className="button-primary">Log out</button></form></OsHeader><main className="dashboard-main">{body}</main></div>;
  if (access.state !== "active") return shell(<Restricted kind={access.state} />);
  const status = await participantStatus();
  return shell("format" in status ? <OpenShell teamName={access.teamName} initial={status} /> : <PaperShell teamName={access.teamName} initial={status} />);
}
