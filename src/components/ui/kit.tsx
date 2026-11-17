"use client";
/* Ghost_404 design kit: small, reusable building blocks shared by every chapter. Presentation only. */
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { ChapterState } from "@/components/game/use-chapter";

export const CHAPTERS = [
  { n: 1, name: "Inbox", max: 15 }, { n: 2, name: "Trail", max: 25 }, { n: 3, name: "Insider", max: 25 },
  { n: 4, name: "Containment", max: 20 }, { n: 5, name: "Final Verdict", max: 15 },
] as const;

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "amber" | "alert" | "ok" | "info"; children: ReactNode }) {
  return <span className={`k-badge k-badge-${tone}`}>{children}</span>;
}

export function Card({ title, eyebrow, aside, children, className = "", id }: { title?: ReactNode; eyebrow?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return <section className={`k-card ${className}`} aria-labelledby={title && id ? `${id}-h` : undefined}>
    {(title || eyebrow || aside) && <header className="k-card-head"><div>{eyebrow && <span className="k-eyebrow">{eyebrow}</span>}{title && <h2 id={id ? `${id}-h` : undefined}>{title}</h2>}</div>{aside}</header>}
    <div className="k-card-body">{children}</div>
  </section>;
}

export type TabDef = { id: string; label: ReactNode; count?: number };
/** WAI-ARIA tabs (automatic activation): arrows / Home / End move between tabs. */
export function Tabs({ label, tabs, value, onChange, children }: { label: string; tabs: TabDef[]; value: string; onChange: (id: string) => void; children: ReactNode }) {
  const base = useId(), list = useRef<HTMLDivElement>(null);
  function key(event: KeyboardEvent) {
    const i = tabs.findIndex(t => t.id === value);
    const next = event.key === "ArrowRight" ? (i + 1) % tabs.length : event.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); onChange(tabs[next].id);
    list.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }
  return <div className="k-tabs">
    <div role="tablist" aria-label={label} className="k-tablist" ref={list} onKeyDown={key}>
      {tabs.map(tab => <button key={tab.id} role="tab" type="button" id={`${base}-t-${tab.id}`} aria-selected={value === tab.id} aria-controls={`${base}-p`} tabIndex={value === tab.id ? 0 : -1} onClick={() => onChange(tab.id)}>{tab.label}{tab.count !== undefined && <span className="k-count">{tab.count}</span>}</button>)}
    </div>
    <div role="tabpanel" id={`${base}-p`} aria-labelledby={`${base}-t-${value}`} tabIndex={0} className="k-tabpanel">{children}</div>
  </div>;
}

export function feedbackTone(text: string): "ok" | "warn" {
  return /^(Conclusion accepted|Verdict accepted|Tamper Alert recorded|Hint released|Dossier unlocked)/.test(text) ? "ok" : "warn";
}
/** Submission/status line. Always rendered (live region) so assistive tech announces changes. */
export function Feedback({ busy, text, extra }: { busy: boolean; text: string; extra?: string }) {
  const message = busy ? "Saving evidence…" : text;
  return <p role="status" className={`k-feedback ${message ? `k-feedback-${busy ? "busy" : feedbackTone(text)}` : ""}`}>{message}{extra ? ` ${extra}` : ""}</p>;
}

export function formatClock(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`; }

/** Persistent mission bar: chapter stepper, objective, clock, score and hint status. */
export function MissionBar({ chapter, title, objective, state, remaining, caseId }: { chapter: 0 | 1 | 2 | 3 | 4; title: string; objective: string; state: ChapterState; remaining: number; caseId?: string }) {
  const mine = state.progress.chapters[chapter], urgent = state.status === "active" && remaining <= 300;
  return <header className="k-mission">
    <ol className="k-stepper" aria-label="Investigation progress">
      {CHAPTERS.map((c, i) => { const done = state.progress.chapters[i].completedAt !== null, here = i === chapter; return <li key={c.n} className={done ? "is-done" : here ? "is-here" : "is-locked"} aria-current={here ? "step" : undefined}><span className="k-step-dot" aria-hidden="true">{done ? "✓" : c.n}</span><span className="k-step-name">{c.name}<span className="k-sr"> — {done ? "complete" : here ? "current" : "locked"}</span></span></li>; })}
    </ol>
    <div className="k-mission-main">
      <div><span className="k-eyebrow">CHAPTER {String(chapter + 1).padStart(2, "0")}{caseId ? ` / ${caseId}` : ""}</span><h1>{title}</h1><p className="k-objective"><strong>Objective</strong> {objective}</p></div>
      <dl className="k-stats">
        <div><dt>Time left</dt><dd role="timer" aria-label="Round time remaining" className={urgent ? "is-urgent" : ""}>{state.status === "active" ? formatClock(remaining) : state.status.toUpperCase()}</dd></div>
        <div><dt>Total</dt><dd><strong>Saved score: {state.score} / 105</strong></dd></div>
        <div><dt>This chapter</dt><dd>Chapter: {mine.score} / {CHAPTERS[chapter].max} · Hints: {mine.hints} / 2</dd></div>
      </dl>
    </div>
  </header>;
}
