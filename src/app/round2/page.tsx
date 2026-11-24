import { redirect } from "next/navigation";
import { OsHeader } from "@/components/ui/os-header";
import { Restricted } from "@/components/round2/states";
import { OpenShell } from "@/components/round2/paper/open-shell";
import { signOut } from "@/app/login/actions";
import { finalistAccess } from "@/lib/round2/access.server";
import { participantStatus } from "@/lib/round2/paper/service.server";

export const dynamic = "force-dynamic";
// GHOST RETURNS Part A (60 minutes, four open injects). Server-rendered gate: injects are only in the HTML while the server clock runs.
export default async function Round2Page() {
  const access = await finalistAccess();
  if (access.state === "anonymous") redirect("/login?next=/round2");
  const shell = (body: React.ReactNode) => <div className="site-shell r2-site"><OsHeader area="Round 2 · GHOST RETURNS"><form action={signOut}><button className="button-primary">Log out</button></form></OsHeader><main className="dashboard-main">{body}</main></div>;
  if (access.state !== "active") return shell(<Restricted kind={access.state} />);
  return shell(<OpenShell teamName={access.teamName} initial={await participantStatus()} />);
}
