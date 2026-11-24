"use client";
import { useEffect, useRef, useState } from "react";
import type { Progress } from "@/lib/game/engine";
import { useDemo, DEMO_NOTE } from "@/components/demo/demo-context";

export type Attempts = { used: number; cap: number; remaining: number };
export type TaskRow = { id: string; title: string; earned: number; max: number; attempts?: Attempts | null };
export type ChapterState = {
  progress: Progress; score: number; current: number; status: string; chapterHints: string[][]; serverNow: number; round: { deadline: string | null };
  standby?: "reserve" | "replaced" | null; policy?: string; insiderUnlocked?: boolean; insiderPairs?: { A: boolean; B: boolean; C: boolean } | null; insiderGroup?: { group: "A" | "B" | "C"; solved: boolean } | null; unlocked: boolean[]; unlockThresholds: readonly number[]; tasks: TaskRow[][];
};
export type SubmitResult = { duplicate?: boolean; improved?: boolean; tasks?: TaskRow[]; task: string | null; awarded: number; taskEarned: number | null; taskMax: number | null; chapterRaw: number; chapterMax: number; accepted: boolean; unlocked: number[]; tamperAwarded: boolean; demo?: boolean };

/** Server-authoritative chapter state, polling, and the three mutations (task submit, hint, unlock). Nothing here computes a score. */
export function useChapter(chapter: 0 | 1 | 2 | 3 | 4, initialState: ChapterState) {
  const demo = useDemo();
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [result, setResult] = useState<(SubmitResult & { at: number }) | null>(null);
  const [connection, setConnection] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState({ now: 0, remaining: Math.max(0, Math.ceil((Date.parse(initialState.round.deadline ?? "") - initialState.serverNow) / 1000)) || 0 });
  const mutating = useRef(false);
  async function refresh() {
    const response = await fetch("/api/game", { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 ? "Session expired. Sign in again." : "Connection interrupted. Retrying; your saved progress is safe.");
    setState(await response.json()); setConnection("");
  }
  useEffect(() => {
    if (demo) return; // preview: no polling of the competition API
    let alive = true;
    const poll = setInterval(async () => {
      if (mutating.current) return;
      try {
        const response = await fetch("/api/game", { cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 401 ? "Session expired. Sign in again." : "Connection interrupted. Retrying; your saved progress is safe.");
        const snapshot: ChapterState = await response.json();
        if (alive && !mutating.current) { setState(snapshot); setConnection(""); }
      } catch (error) { if (alive) setConnection(error instanceof TypeError ? "Connection interrupted. Retrying; your saved progress is safe." : (error as Error).message); }
    }, 5000);
    return () => { alive = false; clearInterval(poll); };
  }, [demo]);
  useEffect(() => {
    if (demo) return;
    const received = performance.now();
    const timer = setInterval(() => setClock({ now: Date.now(), remaining: state.status === "active" && state.round.deadline ? Math.max(0, Math.ceil((Date.parse(state.round.deadline) - state.serverNow - (performance.now() - received)) / 1000)) : 0 }), 1000);
    return () => clearInterval(timer);
  }, [demo, state.serverNow, state.round.deadline, state.status]);

  /** One request to /api/game. `task` makes it a task-scoped submission graded by that task alone. */
  async function send(action: "hint" | "submit" | "unlock", answer?: unknown, task?: string) {
    if (busy) return false;
    if (demo) { // simulated locally: no request is made, nothing is scored, saved or counted
      if (action === "submit") setResult({ demo: true, task: task ?? null, awarded: 0, taskEarned: null, taskMax: null, chapterRaw: 0, chapterMax: 0, accepted: false, unlocked: [], tamperAwarded: false, at: Date.now() });
      setFeedback(action === "hint" ? "Demo only: no hint is consumed." : action === "unlock" ? "Demo: the dossier is already open." : `Demo selection recorded on this screen. ${DEMO_NOTE}`);
      return true;
    }
    setBusy(true); setFeedback(""); mutating.current = true;
    try {
      const response = await fetch("/api/game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, chapter, ...(task ? { task } : {}), ...(answer ? { answer } : {}) }) });
      const body = await response.json();
      if (action !== "hint") setRetryAt(Date.now() + (body.retryAfter ?? 3) * 1000);
      if (!response.ok) throw new Error(body.error ?? "Unable to save. Retry when the connection returns.");
      if (action === "unlock") setFeedback(body.pairMode ? (body.groupMode && body.matched ? (body.already ? `Group ${body.pair} was already matched. The dossier is open.` : `Match confirmed: Group ${body.pair} fragments fit. The dossier is open.`) : body.matched ? (body.unlocked ? "EVIDENCE SET RECONSTRUCTED — 3/3. The whole dossier is open." : body.already ? `Evidence ${body.pair} was already open.` : `Match confirmed: Evidence ${body.pair} is open.`) : "These two fragments do not fit together. Compare the identifiers on both again.") : body.unlocked ? "Dossier unlocked and saved." : "These fragments do not unlock this dossier. Check both printed pieces.");
      else if (action === "hint") setFeedback("Hint released and saved.");
      else {
        setResult({ ...body, at: Date.now() });
        const parts: string[] = [];
        if (body.awarded > 0) parts.push(`+${body.awarded} points`); else parts.push(task ? "No new points" : "No new points");
        if (body.tamperAwarded) parts.push("Tamper Alert +5");
        if (body.unlocked?.length) parts.push(`Chapter ${body.unlocked[0] + 1} unlocked`);
        if (body.accepted) parts.push("chapter complete");
        setFeedback(`Saved. ${parts.join(" · ")}.`);
      }
      await refresh();
      return true;
    } catch (error) {
      setFeedback(error instanceof TypeError ? "Unable to reach the server. Nothing was scored; your work is still on screen and saved as a draft when connected." : (error as Error).message);
      return false;
    } finally { mutating.current = false; setBusy(false); }
  }
  const submitTask = (task: string, answer: unknown) => send("submit", answer, task);
  return { state, busy, feedback, result, connection, send, submitTask, remaining: clock.remaining, retrySeconds: Math.max(0, Math.ceil((retryAt - clock.now) / 1000)) };
}
