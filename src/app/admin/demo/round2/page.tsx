import "../../../round2.css";
import "../../../paper.css";
import { PaperShell } from "@/components/round2/paper/paper-shell";
import { OpenShell } from "@/components/round2/paper/open-shell";
import { CHAPTERS } from "@/lib/round2/paper/clock";
import { chapterContent } from "@/lib/round2/paper/content.server";
import { INJECT_CONTENT } from "@/lib/round2/paper/content-v2.server";
import { OPEN_PACE } from "@/lib/round2/paper/format";
import { requireDemoAdmin } from "@/lib/demo/demo.server";
import type { ChapterView, InjectView } from "@/lib/round2/paper/types";

/** Organizer preview of GHOST RETURNS: no clock, no enrollment, nothing recorded. ?format=open-60 shows the case document v2 injects
 *  (its terminal classifies through an organizer-only endpoint and keeps its history in this tab only). */
export default async function DemoRound2Page({ searchParams }: { searchParams: Promise<{ unit?: string; format?: string }> }) {
  await requireDemoAdmin();
  const q = await searchParams, n = Number(q.unit), start = n >= 1 && n <= 4 ? n : 1;
  const switcher = <nav className="ij-formats" aria-label="Round 2 format"><a href="/admin/demo/round2?unit=1" aria-current={q.format !== "open-60" ? "page" : undefined}>40-minute sequential (current default)</a><a href="/admin/demo/round2?format=open-60&unit=1" aria-current={q.format === "open-60" ? "page" : undefined}>60-minute open injects (case document v2)</a></nav>;
  if (q.format === "open-60") {
    const injects: InjectView[] = OPEN_PACE.map(p => ({ n: p.n, title: p.title, pace: { fromMin: p.fromMin, toMin: p.toMin }, content: INJECT_CONTENT[p.n] }));
    const initial = { format: "open-60" as const, serverNow: new Date(0).toISOString(), phase: "running" as const, startsAt: null, endsAt: null, injects };
    return <main className="dashboard-main">{switcher}<OpenShell teamName="Organizer preview" initial={initial} demo={{ injects, start }} /></main>;
  }
  const chapters: ChapterView[] = CHAPTERS.map(c => ({ n: c.n, title: c.title, endsAt: "", content: chapterContent(c.n) }));
  const initial = { serverNow: new Date(0).toISOString(), phase: "running" as const, endsAt: null, chapter: null, rail: [] };
  return <main className="dashboard-main">{switcher}<PaperShell teamName="Organizer preview" initial={initial} demo={{ chapters, start }} /></main>;
}
