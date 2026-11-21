import { redirect } from "next/navigation";
import { Brand } from "@/components/ui/brand";
import { Restricted } from "@/components/round2/states";
import { Round2Shell } from "@/components/round2/shell";
import { signOut } from "@/app/login/actions";
import { finalistAccess } from "@/lib/round2/access.server";
import { listR2Drafts, r2Status } from "@/lib/round2/play.server";
import type { ServerDraft, StatusPayload } from "@/components/round2/types";

// Server-rendered gate. Only STATUS (clock, scores, task titles) is sent in the initial HTML: evidence is fetched client-side from
// /api/round2/evidence, which returns released units only, so nothing unreleased is ever in this page or its bundles.
export default async function Round2Page() {
  const access = await finalistAccess();
  if (access.state === "anonymous") redirect("/login?next=/round2");
  const shell = (body: React.ReactNode) => <div className="site-shell r2-site"><header className="site-header"><Brand /><form action={signOut}><button className="button-primary">Log out</button></form></header><main className="dashboard-main">{body}</main></div>;
  if (access.state !== "active") return shell(<Restricted kind={access.state} />);
  const [status, drafts] = await Promise.all([r2Status(access.teamId), listR2Drafts(access.teamId)]);
  return shell(<Round2Shell teamName={access.teamName} initialStatus={JSON.parse(JSON.stringify(status)) as StatusPayload} initialDrafts={drafts as ServerDraft[]} />);
}
