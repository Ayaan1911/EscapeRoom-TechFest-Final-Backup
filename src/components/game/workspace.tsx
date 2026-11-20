"use client";
/* Shared Round 1 workspace: investigation map, header, draft status, task panels, hints, relationship diagram. Presentation only; every number shown comes from server state. */
import { useEffect, useId, useState, type ReactNode } from "react";
import type { ChapterState, SubmitResult, TaskRow } from "./use-chapter";
import type { useDrafts } from "./use-drafts";
import { formatClock } from "@/components/ui/kit";

export const CHAPTER_META = [
  { n: 1, name: "Inbox", max: 15, href: "/play/inbox", unlocksNext: "Trail" },
  { n: 2, name: "Trail", max: 25, href: "/play/trail", unlocksNext: "Insider" },
  { n: 3, name: "Insider", max: 25, href: "/play/insider", unlocksNext: "Containment" },
  { n: 4, name: "Containment", max: 20, href: "/play/containment", unlocksNext: "Final Verdict" },
  { n: 5, name: "Final Verdict", max: 15, href: "/play/verdict", unlocksNext: "" },
] as const;
type Drafts = ReturnType<typeof useDrafts>;
export type ChapterIndex = 0 | 1 | 2 | 3 | 4;

export function chapterStatus(state: ChapterState, i: number) {
  if (!state.unlocked[i]) return "locked" as const;
  if (state.progress.chapters[i].completedAt !== null) return "complete" as const;
  return state.progress.chapters[i].score > 0 ? "progress" as const : "available" as const;
}
const STATUS_TEXT = { locked: "Locked", available: "Available", progress: "In progress", complete: "Complete" } as const;

/** Whether this chapter accepts new work: server says unlocked, round active, chapter not already completed. */
export const isEditable = (state: ChapterState, i: number) => state.status === "active" && state.unlocked[i] && state.progress.chapters[i].completedAt === null;

export function InvestigationMap({ state, chapter, beforeNavigate }: { state: ChapterState; chapter: number; beforeNavigate?: () => Promise<void> }) {
  const go = (href: string) => async (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0 || !beforeNavigate) return;
    event.preventDefault(); await beforeNavigate(); window.location.assign(href);
  };
  return <nav className="pg-map" aria-label="Investigation map">
    <ol>
      {CHAPTER_META.map((meta, i) => {
        const s = chapterStatus(state, i), raw = state.progress.chapters[i].score, need = state.unlockThresholds[i], here = i === chapter;
        const inner = <><span className="pg-map-n" aria-hidden="true">{s === "complete" ? "✓" : s === "locked" ? "🔒" : meta.n}</span>
          <span className="pg-map-name"><strong>{meta.name}</strong><small>{STATUS_TEXT[s]}{here ? " · viewing" : ""}</small></span>
          <span className="pg-map-pts"><b>{raw}</b>/{meta.max}</span></>;
        return <li key={meta.n} className={`is-${s} ${here ? "is-here" : ""}`}>
          {s === "locked" ? <span className="pg-map-link" aria-disabled="true">{inner}<span className="k-sr"> — locked until {state.unlockThresholds[i - 1]} points in {CHAPTER_META[i - 1].name}</span></span>
            : <a className="pg-map-link" href={meta.href} aria-current={here ? "page" : undefined} onClick={go(meta.href)}>{inner}</a>}
          {need !== undefined && <div className="pg-gate" title={`${need} raw points in ${meta.name} unlock ${meta.unlocksNext}`}>
            <span className="pg-gate-bar" role="img" aria-label={`${Math.min(raw, need)} of ${need} points toward unlocking ${meta.unlocksNext}`}><i style={{ width: `${Math.min(100, (raw / need) * 100)}%` }} /></span>
            <small>{raw >= need || state.unlocked[i + 1] ? `${meta.unlocksNext} unlocked` : `${raw}/${need} to unlock ${meta.unlocksNext}`}</small></div>}
        </li>;
      })}
    </ol>
  </nav>;
}

export function DraftBar({ drafts, state }: { drafts: Drafts; state: ChapterState }) {
  const label = { idle: "Draft: nothing to save", saving: "Saving draft…", saved: "Draft saved", unsaved: "Unsaved changes", offline: "Offline. Changes kept on screen, retrying", conflict: "Conflict: changed on another device", error: "Draft not saved", readonly: "Read-only" }[drafts.status];
  const icon = { idle: "○", saving: "◔", saved: "✓", unsaved: "●", offline: "⚠", conflict: "⚠", error: "✕", readonly: "🔒" }[drafts.status];
  const titles = new Map(state.tasks.flat().map(t => [t.id, t.title]));
  return <div className="pg-draft" data-status={drafts.status}>
    <p role="status" aria-live="polite" className="pg-draft-line"><span aria-hidden="true">{icon}</span> {label}{drafts.message ? ` — ${drafts.message}` : ""}</p>
    {drafts.conflicts.map(id => <div role="alert" className="pg-conflict" key={id}>
      <strong>“{titles.get(id) ?? id}” was changed on another device.</strong>
      <span>Your edits have not been saved yet. Choose which version to keep.</span>
      <div><button type="button" className="k-btn k-btn-sm" onClick={() => drafts.resolve(id, "theirs")}>Use the other device’s version</button><button type="button" className="k-btn k-btn-sm" onClick={() => drafts.resolve(id, "mine")}>Keep mine and overwrite</button></div></div>)}
  </div>;
}

export function DeskFrame({ chapter, title, objective, caseId, state, remaining, drafts, banner, children }: { chapter: ChapterIndex; title: string; objective: string; caseId?: string; state: ChapterState; remaining: number; drafts: Drafts; banner?: ReactNode; children: ReactNode }) {
  const mine = state.progress.chapters[chapter], urgent = state.status === "active" && remaining <= 300;
  const raw = mine.score, max = CHAPTER_META[chapter].max, left = max - raw;
  return <div className="pg" data-chapter={chapter + 1}>
    <InvestigationMap state={state} chapter={chapter} beforeNavigate={drafts.flush} />
    <div className="pg-main">
      <header className="pg-head">
        <div className="pg-title"><span className="k-eyebrow">CHAPTER {String(chapter + 1).padStart(2, "0")}{caseId ? ` · ${caseId}` : ""}</span><h1>{title}</h1><p>{objective}</p></div>
        <dl className="pg-stats">
          <div><dt>Time left</dt><dd role="timer" aria-label="Round time remaining" className={urgent ? "is-urgent" : ""}>{state.status === "active" ? formatClock(remaining) : state.status.toUpperCase()}</dd></div>
          <div><dt>Total</dt><dd><b>{state.score}</b> / 105<span className="k-sr">Saved score: {state.score} / 105</span></dd></div>
          <div><dt>This chapter</dt><dd><b>{raw}</b> / {max} <small>({left} open)</small></dd></div>
          <div><dt>Hints</dt><dd>{mine.hints} / 2</dd></div>
        </dl>
      </header>
      {banner}
      <DraftBar drafts={drafts} state={state} />
      {children}
    </div>
  </div>;
}

export function ConnectionBanner({ text, next }: { text: string; next: string }) { return text ? <p className="k-banner k-banner-warn" role="alert">{text} <a href={`/login?next=${next}`}>Sign in</a></p> : null; }

export function StateBanner({ state, chapter }: { state: ChapterState; chapter: ChapterIndex }) {
  if (state.progress.chapters[chapter].completedAt !== null) {
    const next = CHAPTER_META[chapter + 1], open = next && state.unlocked[chapter + 1];
    return <div className="k-banner k-banner-ok" role="status"><div><strong>Chapter {chapter + 1} completed.{open ? ` Chapter ${chapter + 2} unlocked.` : ""}</strong><span>Saved. This chapter is now read-only.</span></div>{open && <a className="k-btn k-btn-primary" href={next.href}>Open Chapter {chapter + 2} →</a>}</div>;
  }
  if (state.status !== "active") return <p className="k-banner k-banner-warn" role="status">Round {state.status}. Evidence stays readable; submissions and hints are closed.</p>;
  return null;
}

/** One scored task: meter, status, fields, submit. A task is submitted and scored on its own. */
export function TaskPanel({ task, step, editable, busy, retrySeconds, result, ready, why, onSubmit, children, aside }: {
  task: TaskRow; step: number; editable: boolean; busy: boolean; retrySeconds: number; result: (SubmitResult & { at: number }) | null; ready: boolean; why?: string; onSubmit: () => void; children: ReactNode; aside?: ReactNode;
}) {
  const id = useId(), done = task.earned >= task.max, partial = task.earned > 0 && !done;
  // Desktop: every task open. Phones: only the first task starts open, to keep the page short.
  const [open, setOpen] = useState(true);
  useEffect(() => { // follows the viewport: collapse extra tasks on a phone, reopen them when the window widens
    const query = window.matchMedia("(max-width: 700px)"), sync = () => setOpen(!(step > 1 && query.matches));
    sync(); query.addEventListener("change", sync); return () => query.removeEventListener("change", sync);
  }, [step]);
  const mine = result?.task === task.id ? result : null;
  const state = done ? "Complete" : partial ? "Partial" : "Not scored";
  return <section className={`pg-task ${done ? "is-done" : partial ? "is-partial" : ""}`} aria-labelledby={`${id}-h`}>
    <header>
      <span className="pg-task-n" aria-hidden="true">{done ? "✓" : step}</span>
      <h3 id={`${id}-h`}>{task.title}</h3>
      <button type="button" className="pg-task-toggle k-btn k-btn-sm" aria-expanded={open} aria-controls={`${id}-b`} onClick={() => setOpen(o => !o)}>{open ? "Hide" : "Open"}<span className="k-sr"> {task.title}</span></button>
      <div className="pg-task-score"><span className="pg-meter" role="img" aria-label={`${task.earned} of ${task.max} points earned`}>{Array.from({ length: task.max }, (_, i) => <i key={i} className={i < task.earned ? "on" : ""} />)}</span><b>{task.earned}</b>/{task.max}<span className="pg-chip">{state}</span></div>
    </header>
    {aside}
    <div className="pg-task-body" id={`${id}-b`} hidden={!open}>{children}</div>
    <footer hidden={!open}>
      <button type="button" className="k-btn k-btn-primary" disabled={!editable || busy || retrySeconds > 0 || done || !ready} onClick={onSubmit}>{done ? "Task complete" : partial ? "Resubmit task" : "Submit task"}</button>
      <span className="pg-task-note" role="status">
        {mine ? mine.awarded > 0 ? `+${mine.awarded} points. Task ${mine.taskEarned}/${mine.taskMax}${(mine.taskEarned ?? 0) < (mine.taskMax ?? 0) ? ". Not fully supported yet; revise and resubmit." : "."}` : "No new points. Revise using the evidence and resubmit." : !ready && editable && !done ? why ?? "Complete the fields to submit." : retrySeconds > 0 && editable ? `Next submission in ${retrySeconds}s.` : ""}
      </span>
    </footer>
  </section>;
}

/** Compact hint control; text of released hints stays visible. Costs shown up front. */
export function HintBox({ chapter, state, editable, busy, onHint }: { chapter: ChapterIndex; state: ChapterState; editable: boolean; busy: boolean; onHint: () => void }) {
  const used = state.progress.chapters[chapter].hints;
  return <details className="pg-hints" open={used > 0}>
    <summary>Hints <span className="pg-chip">{used}/2 used</span></summary>
    <ol>{state.chapterHints[chapter].map((hint, i) => <li key={hint}><b>Hint {i + 1}</b> {hint}</li>)}</ol>
    <button type="button" className="k-btn k-btn-sm" disabled={!editable || busy || used >= 2} onClick={onHint}>{used >= 2 ? "No hints left" : `Reveal hint ${used + 1} (−${used === 0 ? 3 : 6} pts)`}</button>
    <small>Hints cost points but never reduce unlock progress.</small>
  </details>;
}

export type ChainNode = { id: string; label: string; value?: string; note?: string };
/** Relationship diagram: nodes in order, connectors between them. Text list underneath semantics; works without colour or pointer. */
export function ChainDiagram({ nodes, label }: { nodes: ChainNode[]; label: string }) {
  return <ol className="pg-chain" aria-label={label}>
    {nodes.map((n, i) => <li key={n.id} className={n.value ? "is-set" : ""}>
      <span className="pg-chain-label">{n.label}</span>
      <span className="pg-chain-value k-mono">{n.value || "not selected"}</span>
      {n.note && <small>{n.note}</small>}
      {i < nodes.length - 1 && <span className="pg-chain-link" aria-hidden="true">→</span>}
    </li>)}
  </ol>;
}

export function ResultStrip({ result }: { result: (SubmitResult & { at: number }) | null }) {
  if (!result) return null;
  const opened = result.unlocked.map(i => CHAPTER_META[i]);
  return <div className="pg-result" role="status">
    <strong>{result.awarded > 0 ? `+${result.awarded} points` : "No new points"}</strong>
    <span>Chapter {result.chapterRaw}/{result.chapterMax}{result.accepted ? " · complete" : ""}</span>
    {result.tamperAwarded && <span>Tamper Alert +5</span>}
    {opened.map(m => <a key={m.n} className="k-btn k-btn-sm k-btn-primary" href={m.href}>{m.name} unlocked → Open</a>)}
  </div>;
}

/** Typed accessors over a chapter's drafts so desks read/write task fields without knowing about versions or saving. */
export function fieldApi(drafts: Drafts) {
  const raw = (t: string, k: string) => drafts.get(t)[k];
  return {
    str: (t: string, k: string) => { const v = raw(t, k); return typeof v === "string" ? v : ""; },
    arr: (t: string, k: string) => { const v = raw(t, k); return Array.isArray(v) ? v.map(String) : []; },
    set: (t: string, k: string, v: string | string[]) => drafts.update(t, { [k]: v }),
    toggle: (t: string, k: string, id: string, max = 99) => { const v = raw(t, k), cur = Array.isArray(v) ? v.map(String) : []; drafts.update(t, { [k]: cur.includes(id) ? cur.filter(x => x !== id) : cur.length < max ? [...cur, id] : cur }); },
  };
}
export const taskOf = (state: ChapterState, chapter: number, id: string): TaskRow => state.tasks[chapter].find(t => t.id === id)!;
