import "../../../round2.css";
import "../../../paper.css";
import { PaperShell } from "@/components/round2/paper/paper-shell";
import { CHAPTERS } from "@/lib/round2/paper/clock";
import { chapterContent } from "@/lib/round2/paper/content.server";
import { requireDemoAdmin } from "@/lib/demo/demo.server";
import type { ChapterView } from "@/lib/round2/paper/types";

/** Organizer preview of GHOST RETURNS: all four chapters open, no clock, no enrollment, no polling, no API calls, nothing recorded. */
export default async function DemoRound2Page({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  await requireDemoAdmin();
  const n = Number((await searchParams).unit), start = n >= 1 && n <= 4 ? n : 1;
  const chapters: ChapterView[] = CHAPTERS.map(c => ({ n: c.n, title: c.title, endsAt: "", content: chapterContent(c.n) }));
  const initial = { serverNow: new Date(0).toISOString(), phase: "running" as const, endsAt: null, chapter: null, rail: [] };
  return <main className="dashboard-main"><PaperShell teamName="Organizer preview" initial={initial} demo={{ chapters, start }} /></main>;
}
