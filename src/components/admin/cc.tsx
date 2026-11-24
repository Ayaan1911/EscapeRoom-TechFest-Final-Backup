import Link from "next/link";
import type { ReactNode } from "react";
import { STATE_WORD, type Stage } from "@/lib/game/stages";

// GHOST//OS event control: shared organizer primitives. Server-safe (no state). Colour always comes with a word.
export type Tone = "ok" | "live" | "warn" | "alert" | "idle";
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`cc-pill is-${tone}`}><i aria-hidden="true" />{children}</span>;
}
export function Panel({ id, eyebrow, title, aside, children, className = "" }: { id: string; eyebrow?: ReactNode; title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section id={id} className={`cc-panel ${className}`} aria-labelledby={`${id}-h`}>
    <header className="cc-panel-head"><div>{eyebrow && <span className="cc-eyebrow">{eyebrow}</span>}<h2 id={`${id}-h`}>{title}</h2></div>{aside}</header>
    {children}
  </section>;
}
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className="cc-stat"><dt>{label}</dt><dd>{value}{sub && <small>{sub}</small>}</dd></div>;
}

const NAV: [string, string][] = [["/admin", "Command center"], ["/admin/round2", "Round 2 control"], ["/admin/leaderboard", "Leaderboard"], ["/admin/projector", "Projector"], ["/admin/demo", "Demo mode"]];
export function CcNav({ current }: { current: string }) {
  return <nav className="cc-nav" aria-label="Event control">{NAV.map(([href, label]) => <Link key={href} href={href} aria-current={href === current ? "page" : undefined}>{label}</Link>)}</nav>;
}

/** Seven-stage event pipeline. Each stage is a link to the view where its work happens. */
export function StagePipeline({ stages }: { stages: Stage[] }) {
  return <ol className="cc-pipe" aria-label="Event status">{stages.map((s, i) => <li key={s.id} className={`is-${s.state}`}>
    <Link href={s.href}><span className="cc-pipe-n" aria-hidden="true">{s.state === "done" ? "✓" : s.state === "blocked" ? "!" : i + 1}</span>
      <span className="cc-pipe-t"><small>{s.label}</small><b>{s.status}</b><em>{STATE_WORD[s.state]}</em></span></Link></li>)}</ol>;
}
