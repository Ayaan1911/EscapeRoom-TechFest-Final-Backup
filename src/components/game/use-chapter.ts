"use client";
import { useEffect, useState } from "react";
import type { Progress } from "@/lib/game/engine";

export type ChapterState = { progress: Progress; score: number; current: number; status: string; chapterHints: string[][]; serverNow: number; round: { deadline: string | null }; insiderUnlocked?: boolean };

export function useChapter(chapter: 0 | 1 | 2 | 3 | 4, initialState: ChapterState) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [connection, setConnection] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState({ now: 0, remaining: Math.max(0, Math.ceil((Date.parse(initialState.round.deadline ?? "") - initialState.serverNow) / 1000)) || 0 });
  async function refresh() {
    const response = await fetch("/api/game", { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 ? "Session expired. Sign in again." : "Connection interrupted. Retrying; your saved progress is safe.");
    setState(await response.json()); setConnection("");
  }
  useEffect(() => {
    let alive = true;
    const poll = setInterval(async () => {
      try {
        const response = await fetch("/api/game", { cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 401 ? "Session expired. Sign in again." : "Connection interrupted. Retrying; your saved progress is safe.");
        const snapshot: ChapterState = await response.json();
        if (alive) { setState(snapshot); setConnection(""); }
      } catch (error) { if (alive) setConnection(error instanceof TypeError ? "Connection interrupted. Retrying; your saved progress is safe." : (error as Error).message); }
    }, 5000);
    return () => { alive = false; clearInterval(poll); };
  }, []);
  useEffect(() => {
    const received = performance.now();
    const timer = setInterval(() => setClock({ now: Date.now(), remaining: state.status === "active" && state.round.deadline ? Math.max(0, Math.ceil((Date.parse(state.round.deadline) - state.serverNow - (performance.now() - received)) / 1000)) : 0 }), 1000);
    return () => clearInterval(timer);
  }, [state.serverNow, state.round.deadline, state.status]);
  async function send(action: "hint" | "submit" | "unlock", answer?: unknown) {
    if (busy) return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, chapter, ...(answer ? { answer } : {}) }) });
      const result = await response.json();
      if (action !== "hint") setRetryAt(Date.now() + (result.retryAfter ?? 3) * 1000);
      if (!response.ok) throw new Error(result.error ?? "Unable to save. Retry when the connection returns.");
      setFeedback(action === "unlock" ? result.unlocked ? "Dossier unlocked and saved." : "These fragments do not unlock this dossier. Check both printed pieces." : result.hint ? "Hint released and saved." : result.accepted ? chapter === 4 ? "Verdict accepted. Investigation complete." : `Conclusion accepted. Chapter ${chapter + 2} unlocked.` : result.tamperAwarded ? "Tamper Alert recorded. One-time +5 bonus awarded; the chapter is still open." : "Evidence does not support this submission. Recheck the complete chain.");
      await refresh();
    } catch (error) { setFeedback(error instanceof TypeError ? action === "unlock" ? "Unable to confirm unlock. Saved progress will refresh when connected; re-enter the printed pieces if still sealed." : "Unable to confirm save. Your form remains here; saved progress will refresh when connected." : (error as Error).message); }
    finally { setBusy(false); }
  }
  return { state, busy, feedback, connection, send, remaining: clock.remaining, retrySeconds: Math.max(0, Math.ceil((retryAt - clock.now) / 1000)) };
}
