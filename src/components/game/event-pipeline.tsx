import Link from "next/link";

type Step = { id: string; label: string; status: string; href?: string; tone: "done" | "active" | "next" | "idle" };
/** Organizer-only status strip for the whole event: Round 1 -> qualification -> Round 2. Every value comes from server state already loaded by the page. */
export function EventPipeline({ round1, qualification, round2 }: { round1: "waiting" | "active" | "finished"; qualification: string; round2: { phase: "not_started" | "running" | "complete"; chapter: number | null; chapterTitle: string | null } }) {
  const confirmed = /ORGANIZER CONFIRMED/.test(qualification), r1done = round1 === "finished";
  const steps: Step[] = [
    { id: "r1", label: "Round 1", status: round1 === "waiting" ? "Waiting to start" : round1 === "active" ? "Running" : "Finished", href: "#round-control", tone: r1done ? "done" : round1 === "active" ? "active" : "next" },
    { id: "q", label: "Qualification", status: qualification.replace("FINAL / ", "").toLowerCase().replace(/^./, c => c.toUpperCase()), tone: confirmed ? "done" : r1done ? "next" : "idle" },
    { id: "r2", label: "Round 2 · paper", status: round2.phase === "running" ? `Chapter ${round2.chapter} · ${round2.chapterTitle}` : round2.phase === "complete" ? "Complete" : confirmed ? "Ready to enroll and start" : "Not started", href: "/admin/round2", tone: round2.phase === "complete" ? "done" : round2.phase === "running" ? "active" : confirmed ? "next" : "idle" },
  ];
  return <ol className="ev-pipe" aria-label="Event status">{steps.map((s, i) => <li key={s.id} className={`is-${s.tone}`}>
    <span className="ev-pipe-n" aria-hidden="true">{s.tone === "done" ? "✓" : i + 1}</span>
    <div><small>{s.label}</small><strong>{s.href ? <Link href={s.href}>{s.status}</Link> : s.status}</strong></div></li>)}</ol>;
}
