"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type DraftValue = string | number | boolean | null | (string | number | boolean | null)[];
export type DraftData = Record<string, DraftValue>;
export type ServerDraft = { chapter: number; taskId: string; data: DraftData; version: number };
export type DraftStatus = "idle" | "saving" | "saved" | "unsaved" | "offline" | "conflict" | "error" | "readonly";
type Entry = { data: DraftData; version: number; dirty: boolean; inflight: boolean; conflict: { data: DraftData; version: number } | null; error: string };

const DEBOUNCE_MS = 700, SYNC_MS = 12_000, MAX_BACKOFF_MS = 30_000;

/**
 * Server-backed autosave for one chapter. Each task has its own draft (flat map, see /api/game/drafts).
 * - saves are debounced and use the optimistic version, so a stale device gets a conflict instead of overwriting;
 * - failures stay "unsaved/offline" and retry with backoff; nothing is reported saved unless the server confirmed it;
 * - `flush()` is awaited before in-app navigation, and a keepalive request is attempted on page hide.
 */
export function useDrafts(chapter: number, initial: ServerDraft[], writable: boolean) {
  const [entries] = useState(() => new Map<string, Entry>(initial.map(d => [d.taskId, { data: d.data, version: d.version, dirty: false, inflight: false, conflict: null, error: "" } as Entry])));
  const saveRef = useRef<(taskId: string) => Promise<void>>(async () => {});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const failures = useRef(0);
  const [, render] = useState(0);
  const [status, setStatus] = useState<DraftStatus>(writable ? "idle" : "readonly");
  const [message, setMessage] = useState("");
  const [savedAt, setSavedAt] = useState(0);
  const tick = () => render(n => n + 1);

  const recompute = useCallback(() => {
    const all = [...entries.values()];
    if (!writable) setStatus("readonly");
    else if (all.some(e => e.conflict)) setStatus("conflict");
    else if (all.some(e => e.error)) setStatus("error");
    else if (all.some(e => e.inflight)) setStatus("saving");
    else if (all.some(e => e.dirty)) setStatus(failures.current > 0 ? "offline" : "unsaved");
    else setStatus(all.length ? "saved" : "idle");
    tick();
  }, [entries, writable]);

  const save = useCallback(async (taskId: string, keepalive = false): Promise<void> => {
    const entry = entries.get(taskId);
    if (!entry || !entry.dirty || entry.inflight || entry.conflict || !writable) return;
    entry.inflight = true; const sent = JSON.stringify(entry.data), sentData = entry.data; recompute();
    try {
      const response = await fetch("/api/game/drafts", { method: "PUT", keepalive, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapter, taskId, data: sentData, baseVersion: entry.version }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        failures.current = 0; entry.version = body.version; entry.error = "";
        entry.dirty = JSON.stringify(entry.data) !== sent; // edited while the request was in flight: save again
        if (!entry.dirty) { setSavedAt(Date.now()); setMessage(""); }
      } else if (response.status === 409) {
        entry.conflict = body.current ?? { data: {}, version: entry.version + 1 };
        setMessage("This draft was changed on another device.");
      } else if (response.status === 401) { entry.error = "Session expired. Sign in again; your draft is still on screen."; }
      else if (response.status === 403) { entry.error = body.error === "Round is not active" ? "The round is not active, so drafts can no longer be saved." : "This chapter is not open for editing."; entry.dirty = false; }
      else { entry.error = response.status === 413 ? "Draft too large to save." : "Draft could not be saved."; }
    } catch { failures.current++; entry.error = ""; }
    entry.inflight = false; recompute();
    if (entry.dirty && !entry.conflict && !entry.error) {
      const wait = failures.current ? Math.min(MAX_BACKOFF_MS, 1500 * 2 ** failures.current) : DEBOUNCE_MS;
      clearTimeout(timers.current.get(taskId)); timers.current.set(taskId, setTimeout(() => void saveRef.current(taskId), wait));
    }
  }, [chapter, entries, recompute, writable]);

  useEffect(() => { saveRef.current = save; }, [entries, save]);

  /** Merge `patch` into the task's draft and schedule a save. */
  const update = useCallback((taskId: string, patch: DraftData) => {
    if (!writable) return;
    const entry = entries.get(taskId) ?? { data: {}, version: 0, dirty: false, inflight: false, conflict: null, error: "" };
    entry.data = { ...entry.data, ...patch }; entry.dirty = true; entry.error = "";
    entries.set(taskId, entry);
    clearTimeout(timers.current.get(taskId)); timers.current.set(taskId, setTimeout(() => void save(taskId), DEBOUNCE_MS));
    recompute();
  }, [entries, recompute, save, writable]);

  const flush = useCallback(async () => {
    for (const [taskId, timer] of timers.current) { clearTimeout(timer); timers.current.delete(taskId); }
    for (let round = 0; round < 3; round++) {
      await Promise.all([...entries.keys()].map(id => save(id)));
      if (![...entries.values()].some(e => e.dirty && !e.conflict && !e.error)) break;
    }
  }, [entries, save]);

  /** Resolve a conflict: take the other device's copy, or keep this device's edits on top of it. */
  const resolve = useCallback((taskId: string, choice: "theirs" | "mine") => {
    const entry = entries.get(taskId); if (!entry?.conflict) return;
    const theirs = entry.conflict; entry.conflict = null; entry.version = theirs.version;
    if (choice === "theirs") { entry.data = theirs.data; entry.dirty = false; setMessage(""); } else { entry.dirty = true; void save(taskId); }
    recompute();
  }, [entries, recompute, save]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") for (const id of entries.keys()) { clearTimeout(timers.current.get(id)); void save(id, true); } };
    const warn = (event: BeforeUnloadEvent) => { if ([...entries.values()].some(e => e.dirty && (failures.current > 0 || e.conflict || e.error))) event.preventDefault(); };
    const online = () => { failures.current = 0; void flush(); };
    document.addEventListener("visibilitychange", hide); window.addEventListener("beforeunload", warn); window.addEventListener("online", online);
    const sync = setInterval(async () => { // adopt newer drafts from other devices when this one has nothing unsaved
      try {
        const response = await fetch(`/api/game/drafts?chapter=${chapter}`, { cache: "no-store" }); if (!response.ok) return;
        const { drafts } = await response.json() as { drafts: ServerDraft[] };
        for (const d of drafts) { const e = entries.get(d.taskId); if (!e) entries.set(d.taskId, { data: d.data, version: d.version, dirty: false, inflight: false, conflict: null, error: "" }); else if (!e.dirty && !e.inflight && d.version > e.version) { e.data = d.data; e.version = d.version; } }
        recompute();
      } catch { /* offline: the next poll retries */ }
    }, SYNC_MS);
    const pending = timers.current;
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("beforeunload", warn); window.removeEventListener("online", online); clearInterval(sync); for (const t of pending.values()) clearTimeout(t); };
  }, [chapter, entries, flush, recompute, save]);

  const get = (taskId: string): DraftData => entries.get(taskId)?.data ?? {};
  const conflicts = [...entries.entries()].filter(([, e]) => e.conflict).map(([id]) => id);
  const errors = [...entries.values()].map(e => e.error).filter(Boolean);
  const hasUnsaved = () => [...entries.values()].some(e => e.dirty || e.conflict);
  return { hasUnsaved, status, message: errors[0] || message, savedAt, get, update, flush, resolve, conflicts, conflictOf: (taskId: string) => entries.get(taskId)?.conflict ?? null };
}
