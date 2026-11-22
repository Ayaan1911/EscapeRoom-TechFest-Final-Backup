import { redirect } from "next/navigation";
import { Brand } from "@/components/ui/brand";
import { Restricted } from "@/components/round2/states";
import { PaperShell } from "@/components/round2/paper/paper-shell";
import { signOut } from "@/app/login/actions";
import { finalistAccess } from "@/lib/round2/access.server";
import { paperStatus } from "@/lib/round2/paper/service.server";

export const dynamic = "force-dynamic";
// GHOST RETURNS (paper edition). Server-rendered gate: the initial HTML carries only the chapter the server clock has open right now.
export default async function Round2Page() {
  const access = await finalistAccess();
  if (access.state === "anonymous") redirect("/login?next=/round2");
  const shell = (body: React.ReactNode) => <div className="site-shell r2-site"><header className="site-header"><Brand /><form action={signOut}><button className="button-primary">Log out</button></form></header><main className="dashboard-main">{body}</main></div>;
  if (access.state !== "active") return shell(<Restricted kind={access.state} />);
  return shell(<PaperShell teamName={access.teamName} initial={await paperStatus()} />);
}
