import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoProvider } from "@/components/demo/demo-context";
import { InboxDesk } from "@/components/game/inbox-desk";
import { TrailDesk } from "@/components/game/trail-desk";
import { InsiderDesk } from "@/components/game/insider-desk";
import { ContainmentDesk } from "@/components/game/containment-desk";
import { VerdictDesk } from "@/components/game/verdict-desk";
import { DEMO_CHAPTERS, demoChapterState, pickVariant, requireDemoAdmin } from "@/lib/demo/demo.server";
import { inboxEvidence } from "@/lib/game/inbox.server";
import { trailEvidence } from "@/lib/game/trail.server";
import { insiderDossier } from "@/lib/game/insider.server";
import { containmentCctv, containmentEvidence } from "@/lib/game/containment.server";
import { verdictEvidence } from "@/lib/game/verdict.server";

/** Organizer preview of a Round 1 chapter. The desks are the real participant components; the state is a blank in-memory object and the DemoProvider cuts every network write. */
export default async function DemoChapter({ params, searchParams }: { params: Promise<{ chapter: string }>; searchParams: Promise<{ v?: string }> }) {
  await requireDemoAdmin();
  const { chapter } = await params;
  if (!(DEMO_CHAPTERS as readonly string[]).includes(chapter)) notFound();
  const v = pickVariant((await searchParams).v), state = demoChapterState();
  const inbox = chapter === "inbox" ? inboxEvidence(v) : null;
  return <main className={`dashboard-main ${chapter}-main`}><DemoProvider>
    <Link className="back-link" href="/admin/demo/round1">← Mission dashboard</Link>
    {chapter === "inbox" && inbox && <InboxDesk evidence={{ caseId: inbox.caseId, recipient: inbox.recipient, emails: inbox.emails, artifacts: inbox.artifacts }} initialState={state} initialDrafts={[]} />}
    {chapter === "trail" && <TrailDesk evidence={trailEvidence(v)} initialState={state} initialDrafts={[]} />}
    {chapter === "insider" && <InsiderDesk initialDossier={insiderDossier(v)} initialState={state} initialDrafts={[]} />}
    {chapter === "containment" && <ContainmentDesk evidence={containmentEvidence(v)} cctv={containmentCctv(v)} initialState={state} initialDrafts={[]} />}
    {chapter === "verdict" && <VerdictDesk evidence={verdictEvidence(v)} team={{ id: "DEMO", name: "Demonstration team" }} initialState={state} initialDrafts={[]} />}
  </DemoProvider></main>;
}
