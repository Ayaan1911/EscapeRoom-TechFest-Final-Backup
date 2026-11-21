"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError, postSubmit } from "./api";
import { TaskFields } from "./fields";
import { useDrafts, type DraftStatus } from "./use-draft-store";
import { buildAnswer, missingFields } from "@/lib/round2/form-types";
import type { SubmitOutcome, TaskDef, TaskStatus } from "./types";

const DRAFT_TEXT: Record<DraftStatus, string> = { idle: "No draft yet", dirty: "Unsaved changes…", saving: "Saving…", saved: "Draft saved", error: "Save failed. Retrying on your next change", offline: "Offline. Changes are kept here and not yet saved", conflict: "Conflict: a teammate saved a newer draft", toolarge: "Draft too large to save (8 KB limit)", closed: "Read-only (phase closed)" };
export type Feedback = { tone: "ok" | "info" | "warn" | "error"; text: string };

/** Maps every documented backend outcome to honest participant-facing text. Nothing says "submitted" unless the server confirmed it. */
export function describeOutcome(o: SubmitOutcome): Feedback {
  const left = o.task.max - o.task.earned;
  if (o.duplicate) return { tone: "info", text: `You already sent this exact answer. No change: ${o.task.earned}/${o.task.max} points.` };
  if (o.awarded > 0) return { tone: "ok", text: `+${o.awarded} point${o.awarded === 1 ? "" : "s"}. Task ${o.task.earned}/${o.task.max}${left ? `, ${left} still available. Revise and resubmit.` : ". Complete."} Total ${o.score.total}/100.` };
  return { tone: "warn", text: `No new points. Task ${o.task.earned}/${o.task.max}. Re-read the evidence and revise.` };
}
export function describeError(e: unknown): Feedback {
  if (!(e instanceof ApiError)) return { tone: "error", text: "Unexpected error. Your answer was not confirmed; check your score and retry." };
  if (e.status === 0) return { tone: "error", text: "Connection lost. We could not confirm whether the server received this. Re-sending the same answer is safe: it never double-counts." };
  if (e.status === 429) return e.retryAfter ? { tone: "warn", text: `Slow down: next submission in ${e.retryAfter}s.` } : { tone: "error", text: e.message };
  if (e.status === 400) return { tone: "error", text: "The server rejected this answer's format. Review your selections." };
  if (e.status === 401) return { tone: "error", text: "Your session expired. Sign in again; your drafts are saved." };
  if (e.status === 403) return { tone: "error", text: `${e.message}.` };
  if (e.status === 409) return { tone: "info", text: e.message };
  return { tone: "error", text: "The server is unavailable. Nothing was confirmed; retry in a moment." };
}

export function TaskCard({ task, status, editable, closedReason, onScored, onNeedRefresh, index }: { task: TaskDef; status: TaskStatus; editable: boolean; closedReason: string; onScored: (taskId: string, o: SubmitOutcome) => void; onNeedRefresh: () => void; index: number }) {
  const store = useDrafts(), entry = store.entry(task.id), id = useId();
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState<Feedback | null>(null), [wait, setWait] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = status.earned >= status.max, partial = status.earned > 0 && !done;
  const missing = missingFields(task.fields, entry.working);
  const canSubmit = editable && !busy && wait === 0 && !done && missing.length === 0 && entry.status !== "conflict";
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  const cooldown = (s: number) => { setWait(s); if (timer.current) clearInterval(timer.current); timer.current = setInterval(() => setWait(w => { if (w <= 1) { if (timer.current) clearInterval(timer.current); return 0; } return w - 1; }), 1000); };

  async function submit() {
    setBusy(true); setFeedback(null);
    try {
      await store.flush(); // save the draft first; a failed draft save never blocks submitting
      const answer = buildAnswer(task.fields, store.entry(task.id).working);
      const outcome = await postSubmit(task.id, answer);
      onScored(task.id, outcome); setFeedback(describeOutcome(outcome)); cooldown(3);
    } catch (e) {
      setFeedback(describeError(e));
      if (e instanceof ApiError) { if (e.status === 429 && e.retryAfter) cooldown(e.retryAfter); if ([0, 403, 409, 503].includes(e.status)) onNeedRefresh(); }
    } finally { setBusy(false); }
  }
  const state = done ? "Complete" : partial ? "Partially scored" : editable ? "Not scored yet" : closedReason;
  return <section className={`r2-task ${done ? "is-done" : partial ? "is-partial" : ""}`} aria-labelledby={`${id}-h`} data-task={task.id}>
    <header><span className="r2-task-n" aria-hidden="true">{done ? "✓" : index}</span><h3 id={`${id}-h`}>{status.title}</h3>
      <div className="r2-task-score"><span className="r2-meter" role="img" aria-label={`${status.earned} of ${status.max} points earned`}>{Array.from({ length: status.max }, (_, i) => <i key={i} className={i < status.earned ? "on" : ""} />)}</span><b>{status.earned}</b>/{status.max}<span className="r2-chip">{state}</span></div></header>
    <p className="r2-prompt">{task.prompt}</p>
    <TaskFields fields={task.fields} working={entry.working} disabled={!editable || done} onChange={(f, v) => store.edit(task.id, task.fields, f.path, v, editable && !done)} />
    {entry.status === "conflict" && entry.remote && <div className="r2-conflict" role="alert"><p><b>A teammate saved a newer draft for this task.</b> Nothing was overwritten. Choose which copy to continue with:</p>
      <div className="r2-actions"><button type="button" className="k-btn" onClick={() => store.resolve(task.id, task.fields, "theirs")}>Use the teammate&apos;s copy (replaces what you see)</button><button type="button" className="k-btn k-btn-primary" onClick={() => store.resolve(task.id, task.fields, "mine")}>Keep mine (overwrites the newer copy)</button></div></div>}
    <footer>
      <button type="button" className="k-btn k-btn-primary" disabled={!canSubmit} onClick={() => void submit()}>{busy ? "Submitting…" : done ? "Task complete" : partial ? "Resubmit task" : "Submit task"}</button>
      <span className={`r2-draft is-${entry.status}`} role="status">{DRAFT_TEXT[editable ? entry.status : entry.status === "saved" || entry.status === "idle" ? entry.status : "closed"]}</span>
      <span className="r2-note" role="status" aria-live="polite">{wait > 0 ? `Next submission in ${wait}s.` : !editable && !done ? closedReason : missing.length && !done ? `Still needed: ${missing.join("; ")}.` : ""}</span>
    </footer>
    {feedback && <p className={`r2-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</p>}
  </section>;
}
