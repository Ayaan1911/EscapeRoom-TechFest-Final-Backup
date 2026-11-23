"use client";
/* Shared Round 1 workspace: investigation map, header, draft status, task panels, hints, relationship diagram. Presentation only; every number shown comes from server state. */
import { useEffect, useId, useState, type ReactNode } from "react";
import type { ChapterState, SubmitResult, TaskRow } from "./use-chapter";
import type { useDrafts } from "./use-drafts";
import { formatClock } from "@/components/ui/kit";
import { nextChapterView } from "@/lib/game/unlock-ui";
import { ChapterGlyph } from "@/components/ui/design";
import { useDemo, useHref, DEMO_NOTE } from "@/components/demo/demo-context";

export const CHAPTER_META = [
  { n: 1, name: "Inbox", max: 15, href: "/play/inbox", unlocksNext: "Trail", concept: "Digital forensics mail console" },
  { n: 2, name: "Trail", max: 25, href: "/play/trail", unlocksNext: "Insider", concept: "Event reconstruction lab" },
  { n: 3, name: "Insider", max: 25, href: "/play/insider", unlocksNext: "Containment", concept: "Evidence correlation board" },
  { n: 4, name: "Containment", max: 20, href: "/play/containment", unlocksNext: "Final Verdict", concept: "Incident response operations" },
  { n: 5, name: "Final Verdict", max: 15, href: "/play/verdict", unlocksNext: "", concept: "Case reconstruction chamber" },
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

/**
 * Draft-safe in-app navigation: flush drafts first; if anything is still unsaved (offline, conflict, error) do NOT leave silently:
 * show the honest warning and let the player stay or leave on purpose.
 */
export function useSafeNavigate(drafts: Drafts) {
  const [leaving, setLeaving] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const go = (href: string) => async (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault(); setBusy(true);
    try { await drafts.flush(); } finally { setBusy(false); }
    if (drafts.hasUnsaved()) { setLeaving(href); return; }
    window.location.assign(href);
  };
  const warning = leaving ? <div className="pg-leave" role="alert"><strong>Some edits are not saved yet.</strong><span>They are still on screen (offline, or changed on another device). Stay to fix them, or leave and lose them.</span>
    <div><button type="button" className="k-btn k-btn-sm k-btn-primary" onClick={() => setLeaving(null)}>Stay and keep my edits</button><button type="button" className="k-btn k-btn-sm" onClick={() => window.location.assign(leaving)}>Leave anyway</button></div></div> : null;
  return { go, busy, warning };
}
type Go = ReturnType<typeof useSafeNavigate>["go"];

export function InvestigationMap({ state, chapter, go }: { state: ChapterState; chapter: number; go: Go }) {
  const href = useHref();
  return <nav className="pg-map" aria-label="Investigation map">
    <ol>
      {CHAPTER_META.map((meta, i) => {
        const s = chapterStatus(state, i), raw = state.progress.chapters[i].score, need = state.unlockThresholds[i], here = i === chapter;
        const inner = <><span className="pg-map-n" aria-hidden="true">{s === "complete" ? "✓" : s === "locked" ? "🔒" : meta.n}</span>
          <span className="pg-map-name"><strong>{meta.name}</strong><small>{STATUS_TEXT[s]}{here ? " · viewing" : ""}</small></span>
          <span className="pg-map-pts"><b>{raw}</b>/{meta.max}</span></>;
        return <li key={meta.n} className={`is-${s} ${here ? "is-here" : ""}`}>
          {s === "locked" ? <span className="pg-map-link" aria-disabled="true">{inner}<span className="k-sr"> — locked until {state.unlockThresholds[i - 1]} points in {CHAPTER_META[i - 1].name}</span></span>
            : <a className="pg-map-link" href={href(meta.href)} aria-current={here ? "page" : undefined} onClick={go(href(meta.href))}>{inner}</a>}
          {need !== undefined && <div className="pg-gate" title={`${need} raw points in ${meta.name} unlock ${meta.unlocksNext}`}>
            <span className="pg-gate-bar" role="img" aria-label={`${Math.min(raw, need)} of ${need} points toward unlocking ${meta.unlocksNext}`}><i style={{ width: `${Math.min(100, (raw / need) * 100)}%` }} /></span>
            <small>{raw >= need || state.unlocked[i + 1] ? `${meta.unlocksNext} unlocked` : `${raw}/${need} to unlock ${meta.unlocksNext}`}</small></div>}
        </li>;
      })}
    </ol>
  </nav>;
}

export function DraftBar({ drafts, state }: { drafts: Drafts; state: ChapterState }) {
  if (useDemo()) return <div className="pg-draft" data-status="demo"><p className="pg-draft-line"><span aria-hidden="true">◇</span> Demo: edits stay on this screen</p></div>;
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

/** Server-confirmed unlock announcement. Not a modal: it never blocks the investigation, and "Keep investigating" simply hides it. */
export function UnlockNotice({ state, chapter, confirmed, go }: { state: ChapterState; chapter: number; confirmed: readonly number[]; go: Go }) {
  const [hidden, setHidden] = useState(false), v = nextChapterView(state, chapter, confirmed), demo = useDemo();
  if (demo || !v.hasNext || !v.unlocked || hidden || v.nextStarted || state.progress.chapters[chapter].completedAt !== null) return null; // a completed chapter already shows its own banner
  const meta = CHAPTER_META[v.next];
  return <section className="pg-unlock" role="status" aria-live="polite" aria-labelledby={`unlock-${chapter}`}>
    <span className="pg-unlock-icon" aria-hidden="true">✓</span>
    <div className="pg-unlock-copy"><h2 id={`unlock-${chapter}`}>Chapter {meta.n} Unlocked</h2>
      <p>{v.raw} points saved here · {v.need} required. You can keep improving this chapter or move on now.</p></div>
    <div className="pg-unlock-actions"><a className="k-btn k-btn-primary k-btn-lg" href={meta.href} onClick={go(meta.href)}>Continue to Chapter {meta.n} — {meta.name} →</a>
      <button type="button" className="k-btn" onClick={() => setHidden(true)}>Keep investigating</button>
      <a className="k-btn k-btn-ghost" href="/play" onClick={go("/play")}>Back to Investigation Dashboard</a></div>
  </section>;
}

/** Always present at the bottom of a chapter: what is next, how far away it is, and the way back. No scrolling to the top needed. */
export function NextChapterFooter({ state, chapter, confirmed, connection, go }: { state: ChapterState; chapter: number; confirmed: readonly number[]; connection: string; go: Go }) {
  const v = nextChapterView(state, chapter, confirmed), href = useHref();
  const back = <a className="k-btn k-btn-ghost" href={href("/play")} onClick={go(href("/play"))}>Back to Investigation Dashboard</a>;
  if (!v.hasNext) return <nav className="pg-foot" aria-label="Chapter navigation"><p>Final chapter. Your saved work is kept; the dashboard shows the case status.</p>{back}</nav>;
  const meta = CHAPTER_META[v.next];
  if (v.unlocked) return <nav className="pg-foot is-open" aria-label="Chapter navigation"><p><strong>Chapter {meta.n} — {meta.name} is unlocked.</strong> Work saved here stays saved.</p>
    <a className="k-btn k-btn-primary" href={href(meta.href)} onClick={go(href(meta.href))}>Continue to Chapter {meta.n} — {meta.name} →</a>{back}</nav>;
  return <nav className="pg-foot" aria-label="Chapter navigation"><p><strong>{v.remaining} more point{v.remaining === 1 ? "" : "s"}</strong> in this chapter unlock Chapter {meta.n} — {meta.name} ({v.raw}/{v.need}).
    {connection ? " Connection interrupted: the unlock will show here as soon as the server confirms it." : ""}</p>{back}</nav>;
}

export function DeskFrame({ chapter, title, objective, caseId, state, remaining, drafts, banner, result, connection = "", children }: { chapter: ChapterIndex; title: string; objective: string; caseId?: string; state: ChapterState; remaining: number; drafts: Drafts; banner?: ReactNode; result?: (SubmitResult & { at: number }) | null; connection?: string; children: ReactNode }) {
  const nav = useSafeNavigate(drafts), confirmed = result?.unlocked ?? [], demo = useDemo();
  const mine = state.progress.chapters[chapter], urgent = state.status === "active" && remaining <= 300;
  const raw = mine.score, max = CHAPTER_META[chapter].max, left = max - raw;
  return <div className="pg cn-scene cn-chapter" data-chapter={chapter + 1}>
    <InvestigationMap state={state} chapter={chapter} go={nav.go} />
    <div className="pg-main">
      <header className="pg-head">
        <span className="pg-glyph"><ChapterGlyph n={chapter + 1} /></span>
        <div className="pg-title"><span className="pg-concept"><i aria-hidden="true" />{CHAPTER_META[chapter].concept}</span><span className="k-eyebrow">CHAPTER {String(chapter + 1).padStart(2, "0")}{caseId ? ` · ${caseId}` : ""}</span><h1>{title}</h1><p>{objective}</p></div>
        <dl className="pg-stats">
          <div><dt>Time left</dt><dd><span role="timer" aria-label="Round time remaining" className={urgent ? "is-urgent" : ""}>{demo ? "DEMO" : state.status === "active" ? formatClock(remaining) : state.status.toUpperCase()}</span></dd></div>
          <div><dt>Total</dt><dd><b>{demo ? "—" : state.score}</b> / 105<span className="k-sr">Saved score: {state.score} / 105</span></dd></div>
          <div><dt>This chapter</dt><dd><b>{raw}</b> / {max} <small>({left} open)</small></dd></div>
          <div><dt>Hints</dt><dd>{mine.hints} / 2</dd></div>
        </dl>
      </header>
      {banner}
      {nav.warning}
      <UnlockNotice state={state} chapter={chapter} confirmed={confirmed} go={nav.go} />
      <DraftBar drafts={drafts} state={state} />
      {children}
      <NextChapterFooter state={state} chapter={chapter} confirmed={confirmed} connection={connection} go={nav.go} />
    </div>
  </div>;
}

export function ConnectionBanner({ text, next }: { text: string; next: string }) { return text ? <p className="k-banner k-banner-warn" role="alert">{text} <a href={`/login?next=${next}`}>Sign in</a></p> : null; }

export function StateBanner({ state, chapter }: { state: ChapterState; chapter: ChapterIndex }) {
  const href = useHref();
  if (state.progress.chapters[chapter].completedAt !== null) {
    const next = CHAPTER_META[chapter + 1], open = next && state.unlocked[chapter + 1];
    return <div className="k-banner k-banner-ok" role="status"><div><strong>Chapter {chapter + 1} completed.{open ? ` Chapter ${chapter + 2} unlocked.` : ""}</strong><span>Saved. This chapter is now read-only.</span></div>{open && <a className="k-btn k-btn-primary" href={href(next.href)}>Open Chapter {chapter + 2} →</a>}</div>;
  }
  if (state.status !== "active") return <p className="k-banner k-banner-warn" role="status">Round {state.status}. Evidence stays readable; submissions and hints are closed.</p>;
  return null;
}

/** One scored task: meter, status, fields, submit. A task is submitted and scored on its own. */
/** Participant-facing outcome text. best-v1 wording never implies that correct parts of different answers add up. */
export function taskNote(mine: SubmitResult & { at: number }, task: TaskRow) {
  if (mine.demo) return `Demo input recorded. ${DEMO_NOTE}`;
  const used = mine.tasks?.find(t => t.id === task.id)?.attempts ?? task.attempts;
  if (!used) return mine.awarded > 0 ? `+${mine.awarded} points. Task ${mine.taskEarned}/${mine.taskMax}${(mine.taskEarned ?? 0) < (mine.taskMax ?? 0) ? ". Not fully supported yet; revise and resubmit." : "."}` : "No new points. Revise using the evidence and resubmit.";
  const out = used.remaining === 0 && (mine.taskEarned ?? 0) < (mine.taskMax ?? 0) ? " No attempts remaining. Your highest score has been saved." : "";
  if (mine.duplicate) return `Already submitted: no change and no attempt used. Your highest-scoring submission counts.${out}`;
  if (mine.awarded > 0) return `New personal best: +${mine.awarded} points. Task ${mine.taskEarned}/${mine.taskMax}.${out}`;
  return ((mine.taskEarned ?? 0) > 0 ? "No improvement. Your previous best score has been retained." : "No points yet. Your highest-scoring submission counts.") + out;
}
export function TaskPanel({ phoneCollapsed = false, task, step, editable, busy, retrySeconds, result, ready, why, onSubmit, children, aside }: {
  phoneCollapsed?: boolean; task: TaskRow; step: number; editable: boolean; busy: boolean; retrySeconds: number; result: (SubmitResult & { at: number }) | null; ready: boolean; why?: string; onSubmit: () => void; children: ReactNode; aside?: ReactNode;
}) {
  const id = useId(), done = task.earned >= task.max, partial = task.earned > 0 && !done;
  // Desktop: every task open. Phones: only the first task starts open, to keep the page short.
  const [open, setOpen] = useState(true);
  useEffect(() => { // follows the viewport: collapse extra tasks on a phone, reopen them when the window widens
    const query = window.matchMedia("(max-width: 700px)"), sync = () => setOpen(!((step > 1 || phoneCollapsed) && query.matches));
    sync(); query.addEventListener("change", sync); return () => query.removeEventListener("change", sync);
  }, [step, phoneCollapsed]);
  useEffect(() => { // task navigator: jump links open the target task, then scroll to it
    const onOpen = (e: Event) => { if ((e as CustomEvent<number>).detail === step) setOpen(true); };
    window.addEventListener("task-open", onOpen); return () => window.removeEventListener("task-open", onOpen);
  }, [step]);
  const mine = result?.task === task.id ? result : null;
  const state = done ? "Complete" : partial ? "Partial" : "Not scored";
  return <section id={`task-${step}`} className={`pg-task ${done ? "is-done" : partial ? "is-partial" : ""}`} aria-labelledby={`${id}-h`}>
    <header>
      <span className="pg-task-n" aria-hidden="true">{done ? "✓" : step}</span>
      <h3 id={`${id}-h`}>{task.title}</h3>
      <button type="button" className="pg-task-toggle k-btn k-btn-sm" aria-expanded={open} aria-controls={`${id}-b`} onClick={() => setOpen(o => !o)}>{open ? "Hide" : "Open"}<span className="k-sr"> {task.title}</span></button>
      <div className="pg-task-score"><span className="pg-meter" role="img" aria-label={`${task.earned} of ${task.max} points earned`}>{Array.from({ length: task.max }, (_, i) => <i key={i} className={i < task.earned ? "on" : ""} />)}</span><b>{task.earned}</b>/{task.max}<span className="pg-chip">{state}</span>{task.attempts && <span className="pg-chip" aria-label={`${task.attempts.used} of ${task.attempts.cap} attempts used, ${task.attempts.remaining} remaining`}>Attempts {task.attempts.used}/{task.attempts.cap}</span>}</div>
    </header>
    {task.attempts && !done && <p className="pg-task-rule" role="note">Your highest-scoring submission counts. {task.attempts.remaining > 0 ? `${task.attempts.remaining} attempt${task.attempts.remaining === 1 ? "" : "s"} remaining.` : "No attempts remaining. Your highest score has been saved."}</p>}
    {aside}
    <div className="pg-task-body" id={`${id}-b`} hidden={!open}>{children}</div>
    <footer hidden={!open}>
      <button type="button" className="k-btn k-btn-primary" disabled={!editable || busy || retrySeconds > 0 || done || !ready || task.attempts?.remaining === 0} onClick={onSubmit}>{done ? "Task complete" : task.attempts?.remaining === 0 ? "No attempts remaining" : partial ? "Resubmit task" : "Submit task"}</button>
      <span className="pg-task-note" role="status">
        {mine ? taskNote(mine, task) : !ready && editable && !done ? why ?? "Complete the fields to submit." : retrySeconds > 0 && editable ? `Next submission in ${retrySeconds}s.` : ""}
      </span>
    </footer>
  </section>;
}

/** Compact jump links to every task of a chapter (phones; hidden on wide screens where all tasks are open). */
export function TaskNav({ tasks }: { tasks: TaskRow[] }) {
  return <nav className="pg-tasknav" aria-label="Task navigation"><ol>{tasks.map((t, i) => <li key={t.id}>
    <a href={`#task-${i + 1}`} onClick={() => window.dispatchEvent(new CustomEvent("task-open", { detail: i + 1 }))} aria-label={`Task ${i + 1}: ${t.title}, ${t.earned} of ${t.max} points`}><b>{t.earned >= t.max ? "✓" : i + 1}</b><span>{t.earned}/{t.max}</span></a></li>)}</ol></nav>;
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
  return <ol className="pg-chain" aria-label={label} tabIndex={0}>
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
  if (result.demo) return <div className="pg-result is-demo" role="status"><strong>Demo submission</strong><span>{DEMO_NOTE}</span></div>;
  const opened = result.unlocked.map(i => CHAPTER_META[i]);
  return <div className="pg-result" role="status">
    <strong>{result.duplicate ? "Already submitted" : result.awarded > 0 ? (result.tasks?.some(t => t.attempts) ? `New personal best: +${result.awarded} points` : `+${result.awarded} points`) : (result.tasks?.some(t => t.attempts) ? "No improvement" : "No new points")}</strong>
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
