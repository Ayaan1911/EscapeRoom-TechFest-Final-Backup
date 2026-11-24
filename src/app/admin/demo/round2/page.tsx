import "../../../round2.css";
import "../../../paper.css";
import { OpenShell } from "@/components/round2/paper/open-shell";
import { INJECT_CONTENT } from "@/lib/round2/paper/content-v2.server";
import { FORMAT, OPEN_PACE } from "@/lib/round2/paper/format";
import { requireDemoAdmin } from "@/lib/demo/demo.server";
import type { InjectView } from "@/lib/round2/paper/types";

/** Organizer preview of GHOST RETURNS (the only Round 2 format): all four injects, no clock, nothing recorded.
 *  The demo terminal classifies through an organizer-only endpoint and keeps its history in this browser tab only. */
export default async function DemoRound2Page({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  await requireDemoAdmin();
  const n = Number((await searchParams).unit), start = n >= 1 && n <= 4 ? n : 1;
  const injects: InjectView[] = OPEN_PACE.map(p => ({ n: p.n, title: p.title, pace: { fromMin: p.fromMin, toMin: p.toMin }, content: INJECT_CONTENT[p.n] }));
  const initial = { format: FORMAT, serverNow: new Date(0).toISOString(), phase: "running" as const, startsAt: null, endsAt: null, injects };
  return <main className="dashboard-main"><OpenShell teamName="Organizer preview" initial={initial} demo={{ injects, start }} /></main>;
}
