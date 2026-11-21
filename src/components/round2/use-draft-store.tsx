"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { ApiError, putDraft } from "./api";
import { draftBytes, DRAFT_LIMIT_BYTES, draftOf, setAt, type Answer, type Field } from "@/lib/round2/form-types";
import type { ServerDraft } from "./types";

export type DraftStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "offline" | "conflict" | "toolarge" | "closed";
export type DraftEntry = { working: Answer; version: number; status: DraftStatus; savedAt: number | null; remote: { data: Answer; version: number } | null; payload: Answer | null };
const blank: DraftEntry = { working: {}, version: 0, status: "idle", savedAt: null, remote: null, payload: null };
type Action = { type: "patch"; id: string; patch: Partial<DraftEntry> } | { type: "init"; entries: Record<string, DraftEntry> };
const reducer = (s: Record<string, DraftEntry>, a: Action) => a.type === "init" ? { ...a.entries, ...s } : { ...s, [a.id]: { ...(s[a.id] ?? blank), ...a.patch } };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const SAVE_DELAY_MS = 900;
export const NOTES = "notes";

export type DraftStore = {
  entry: (taskId: string) => DraftEntry;
  /** Edit one value of a task's working answer. Marks it dirty and schedules a debounced save. */
  edit: (taskId: string, fields: Field[], path: string[], value: unknown, editable: boolean) => void;
  flush: () => Promise<boolean>;
  anyUnsaved: () => boolean;
  /** Resolve a 409: keep my version (overwrites the newer remote copy, explicitly) or take the remote copy. */
  resolve: (taskId: string, fields: Field[], choice: "mine" | "theirs") => void;
};
const Ctx = createContext<DraftStore | null>(null);
export const useDrafts = () => { const v = useContext(Ctx); if (!v) throw new Error("DraftProvider missing"); return v; };

/**
 * Per-task drafts with debounced autosave and optimistic concurrency (version = what this tab last saw).
 * A draft save never scores anything. "Saved" is only ever shown after the server confirmed the PUT. A 409 never overwrites silently:
 * the entry enters `conflict` with the remote copy so the participant chooses.
 */
export function DraftProvider({ initial, children }: { initial: ServerDraft[]; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => Object.fromEntries(initial.map(d => [d.taskId, { ...blank, working: d.data as Answer, version: d.version, status: "saved" as const, savedAt: null, payload: d.data as Answer }])));
  const ref = useRef(state); // kept current by patch(); never assigned during render
  const saveRef = useRef<(id: string) => Promise<void>>(async () => undefined);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inflight = useRef(new Map<string, Promise<void>>());
  const patch = useCallback((id: string, p: Partial<DraftEntry>) => { ref.current = { ...ref.current, [id]: { ...(ref.current[id] ?? blank), ...p } }; dispatch({ type: "patch", id, patch: p }); }, []);

  const save = useCallback(async (id: string): Promise<void> => {
    const running = inflight.current.get(id);
    if (running) { await running; }
    const e = ref.current[id] ?? blank;
    if (!e.payload || e.status === "saved" || e.status === "conflict" || e.status === "closed" || e.status === "toolarge") return;
    const body = e.payload, sentVersion = e.version;
    if (draftBytes(body) > DRAFT_LIMIT_BYTES) { patch(id, { status: "toolarge" }); return; }
    patch(id, { status: "saving" });
    const job = (async () => {
      try {
        const res = await putDraft(id, body, sentVersion);
        const latest = ref.current[id] ?? blank;
        patch(id, { version: res.version, savedAt: Date.now(), status: same(latest.payload, body) ? "saved" : "dirty" });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) { const cur = err.body?.current as { data: Answer; version: number } | null | undefined; patch(id, { status: "conflict", remote: cur ?? { data: {}, version: 0 } }); }
        else if (err instanceof ApiError && (err.status === 403 || err.status === 401)) patch(id, { status: "closed" });
        else patch(id, { status: err instanceof ApiError && err.status === 0 ? "offline" : "error" });
      }
    })();
    inflight.current.set(id, job);
    await job; inflight.current.delete(id);
    const after = ref.current[id];
    if (after?.status === "dirty") await saveRef.current(id); // edits made while the request was in flight
  }, [patch]);

  useEffect(() => { saveRef.current = save; }, [save]);
  const schedule = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => { timers.current.delete(id); void save(id); }, SAVE_DELAY_MS));
  }, [save]);

  const edit = useCallback((id: string, fields: Field[], path: string[], value: unknown, editable: boolean) => {
    if (!editable) return;
    const e = ref.current[id] ?? blank;
    const working = setAt(e.working, path, value), payload = draftOf(fields, working);
    patch(id, { working, payload, status: e.status === "conflict" ? "conflict" : "dirty" });
    if (e.status !== "conflict") schedule(id);
  }, [patch, schedule]);

  const flush = useCallback(async () => {
    for (const [id, t] of timers.current) { clearTimeout(t); timers.current.delete(id); }
    await Promise.all(Object.keys(ref.current).map(id => save(id)));
    return Object.values(ref.current).every(e => e.status === "saved" || e.status === "idle" || e.status === "closed");
  }, [save]);

  const resolve = useCallback((id: string, fields: Field[], choice: "mine" | "theirs") => {
    const e = ref.current[id]; if (!e?.remote) return;
    if (choice === "theirs") patch(id, { working: e.remote.data, payload: draftOf(fields, e.remote.data), version: e.remote.version, remote: null, status: "saved", savedAt: Date.now() });
    else { patch(id, { version: e.remote.version, remote: null, status: "dirty" }); void save(id); }
  }, [patch, save]);

  useEffect(() => () => { for (const t of timers.current.values()) clearTimeout(t); }, []);
  const store = useMemo<DraftStore>(() => ({ entry: id => state[id] ?? blank, edit, flush, resolve, anyUnsaved: () => Object.values(ref.current).some(e => e.status === "dirty" || e.status === "saving" || e.status === "error" || e.status === "offline" || e.status === "conflict") }), [state, edit, flush, resolve]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
