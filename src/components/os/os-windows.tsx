"use client";
/**
 * GHOST//OS window manager. Small on purpose: a reducer, floating windows (drag, resize, minimize, restore, focus, close, keyboard),
 * a dock, and a phone/tablet fallback where every window becomes a full-width sheet. Chapter desks register their evidence tools as
 * <ToolWindow>s; the window state is UI-only (geometry + open flags, kept in sessionStorage) and never touches game state or scoring.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minus, RotateCcw, X, type LucideIcon } from "lucide-react";

const BAR = 56, DOCK = 64, MIN_W = 360, MIN_H = 220, STEP = 16;
type Rect = { x: number; y: number; w: number; h: number };
type Win = Rect & { id: string; title: string; icon?: LucideIcon; open: boolean; min: boolean; z: number; home: Rect; side: Side; size?: Partial<Rect> };
type State = { wins: Record<string, Win>; order: string[]; z: number };
type View = { vw: number; vh: number };
type Side = "left" | "right";
type Action =
  | ({ t: "register"; id: string; title: string; icon?: LucideIcon; size?: Partial<Rect>; side?: Side; saved?: Partial<Win> } & View)
  | { t: "unregister"; id: string }
  | { t: "open" | "close" | "minimize" | "focus"; id: string }
  | ({ t: "rect"; id: string; rect: Partial<Rect> } & View)
  | ({ t: "reset" | "clamp" } & View);

/** Keeps a window fully inside the viewport, below the system bar and above the dock, so it can never be lost off-screen. */
export function clampRect(r: Rect, vw: number, vh: number): Rect {
  const w = Math.min(Math.max(r.w, MIN_W), Math.max(MIN_W, vw - 16)), h = Math.min(Math.max(r.h, MIN_H), Math.max(MIN_H, vh - BAR - DOCK - 16));
  return { w, h, x: Math.min(Math.max(r.x, 8), Math.max(8, vw - w - 8)), y: Math.min(Math.max(r.y, BAR + 8), Math.max(BAR + 8, vh - h - DOCK - 8)) };
}
const cascade = (i: number, size: Partial<Rect> | undefined, v: View, side: Side = "left"): Rect => { const w = size?.w ?? 780; return clampRect({ x: side === "right" ? v.vw - w - 24 : 24 + 36 * i, y: BAR + 24 + 30 * i, w, h: size?.h ?? 500 }, v.vw, v.vh); };

function reduce(s: State, a: Action): State {
  switch (a.t) {
    case "register": {
      if (s.wins[a.id]) return s;
      const home = cascade(s.order.length, a.size, a, a.side), rect = a.saved && typeof a.saved.x === "number" ? clampRect({ ...home, ...a.saved } as Rect, a.vw, a.vh) : home;
      const win: Win = { id: a.id, title: a.title, icon: a.icon, ...rect, home, side: a.side ?? "left", size: a.size, open: !!a.saved?.open, min: !!a.saved?.min, z: s.z + 1 };
      return { wins: { ...s.wins, [a.id]: win }, order: [...s.order, a.id], z: s.z + 1 };
    }
    case "unregister": { const { [a.id]: _gone, ...rest } = s.wins; void _gone; return { ...s, wins: rest, order: s.order.filter(x => x !== a.id) }; }
    case "open": case "focus": { const w = s.wins[a.id]; if (!w) return s; return { ...s, z: s.z + 1, wins: { ...s.wins, [a.id]: { ...w, open: true, min: false, z: s.z + 1 } } }; }
    case "close": { const w = s.wins[a.id]; return w ? { ...s, wins: { ...s.wins, [a.id]: { ...w, open: false, min: false } } } : s; }
    case "minimize": { const w = s.wins[a.id]; return w ? { ...s, wins: { ...s.wins, [a.id]: { ...w, min: true } } } : s; }
    case "rect": { const w = s.wins[a.id]; if (!w) return s; const r = clampRect({ x: w.x, y: w.y, w: w.w, h: w.h, ...a.rect }, a.vw, a.vh); return { ...s, wins: { ...s.wins, [a.id]: { ...w, ...r } } }; }
    case "clamp": return { ...s, wins: Object.fromEntries(Object.entries(s.wins).map(([k, w]) => [k, { ...w, ...clampRect(w, a.vw, a.vh) }])) };
    case "reset": return { ...s, wins: Object.fromEntries(s.order.map((id, i) => { const w = s.wins[id]; const home = cascade(i, w.size, a, w.side); return [id, { ...w, ...home, home, open: false, min: false }]; })) };
  }
}

type Ctx = { state: State; wide: boolean; scope: string; dispatch: (a: Action) => void };
const OsCtx = createContext<Ctx | null>(null);
const view = (): View => ({ vw: window.innerWidth, vh: window.innerHeight });
const subscribeWide = (cb: () => void) => { const m = window.matchMedia("(min-width: 1100px)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
const storageKey = (scope: string) => `ghostos.windows.${scope}`;

export function OsDesktop({ scope, children }: { scope: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, { wins: {}, order: [], z: 10 });
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia("(min-width: 1100px)").matches, () => false);
  useEffect(() => { // geometry and open flags only (no game data): lets a refresh restore the layout the player had
    if (Object.keys(state.wins).length === 0) return; // never overwrite a saved layout with the not-yet-registered (empty) state
    try { sessionStorage.setItem(storageKey(scope), JSON.stringify(Object.fromEntries(Object.values(state.wins).map(w => [w.id, { x: w.x, y: w.y, w: w.w, h: w.h, open: w.open, min: w.min }])))); } catch { /* storage unavailable: the layout simply is not remembered */ }
  }, [state.wins, scope]);
  useEffect(() => { const on = () => dispatch({ t: "clamp", ...view() }); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  const ctx = useMemo<Ctx>(() => ({ state, wide, scope, dispatch }), [state, wide, scope]);
  return <OsCtx.Provider value={ctx}>{children}<OsDock /></OsCtx.Provider>;
}

export function useOs() {
  const c = useContext(OsCtx); if (!c) throw new Error("useOs must be used inside <OsDesktop>");
  const { state, dispatch, wide } = c;
  return useMemo(() => ({
    wide, wins: state.order.map(id => state.wins[id]),
    isOpen: (id: string) => !!state.wins[id]?.open && !state.wins[id]?.min,
    open: (id: string) => dispatch({ t: "open", id }), close: (id: string) => dispatch({ t: "close", id }), minimize: (id: string) => dispatch({ t: "minimize", id }),
    reset: () => dispatch({ t: "reset", ...view() }),
  }), [state, dispatch, wide]);
}

/** A tool of the current chapter, shown as a window. Closed windows render nothing; minimized ones stay mounted (scroll position and inner state are kept). */
export function ToolWindow({ id, title, icon, size, side, children }: { id: string; title: string; icon?: LucideIcon; size?: Partial<Rect>; side?: Side; children: ReactNode }) {
  const c = useContext(OsCtx); if (!c) throw new Error("ToolWindow must be inside <OsDesktop>");
  const { dispatch, scope, state, wide } = c, sizeKey = `${size?.w ?? ""}x${size?.h ?? ""}${side ?? ""}`;
  useEffect(() => {
    let saved: Partial<Win> | undefined; try { saved = JSON.parse(sessionStorage.getItem(storageKey(scope)) ?? "{}")[id]; } catch { saved = undefined; }
    dispatch({ t: "register", id, title, icon, size, side, saved, ...view() });
    return () => dispatch({ t: "unregister", id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registration identity is the id; title/icon/size are static per tool
  }, [id, scope, sizeKey]);
  const w = state.wins[id]; if (!w || !w.open || typeof document === "undefined") return null;
  return createPortal(<OsWindow win={w} wide={wide} dispatch={dispatch}>{children}</OsWindow>, document.body);
}

function OsWindow({ win, wide, dispatch, children }: { win: Win; wide: boolean; dispatch: (a: Action) => void; children: ReactNode }) {
  const drag = useRef<{ px: number; py: number; r: Rect; mode: "move" | "size" } | null>(null), Icon = win.icon, helpId = `os-help-${win.id}`;
  const set = (rect: Partial<Rect>) => dispatch({ t: "rect", id: win.id, rect, ...view() });
  const start = (e: PointerEvent, mode: "move" | "size") => { if (!wide || e.button !== 0) return; if (mode === "move" && (e.target as HTMLElement).closest("button")) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, r: { x: win.x, y: win.y, w: win.w, h: win.h }, mode }; dispatch({ t: "focus", id: win.id }); };
  const moveDrag = (e: PointerEvent) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.px, dy = e.clientY - d.py; set(d.mode === "move" ? { x: d.r.x + dx, y: d.r.y + dy } : { w: d.r.w + dx, h: d.r.h + dy }); };
  const endDrag = (e: PointerEvent) => { drag.current = null; try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ } };
  const key = (e: KeyboardEvent) => { // keyboard: arrows move, Shift+arrows resize, Escape closes
    if (e.key === "Escape") { e.stopPropagation(); dispatch({ t: "close", id: win.id }); return; }
    const d = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[e.key as "ArrowLeft"]; if (!d || e.target !== e.currentTarget || !wide) return;
    e.preventDefault(); set(e.shiftKey ? { w: win.w + d[0], h: win.h + d[1] } : { x: win.x + d[0], y: win.y + d[1] });
  };
  return <section className={`os-win ${wide ? "" : "is-sheet"}`} role="dialog" aria-label={win.title} hidden={win.min} data-window={win.id}
    style={wide ? { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: 1000 + win.z } : { zIndex: 1000 + win.z }} onPointerDown={() => dispatch({ t: "focus", id: win.id })} onKeyDown={e => { if (e.key === "Escape") key(e); }}>
    <header className="os-win-bar" onPointerDown={e => start(e, "move")} onPointerMove={moveDrag} onPointerUp={endDrag}>
      <div className="os-win-title" tabIndex={0} role="group" aria-label={`${win.title} window controls`} aria-describedby={helpId} onKeyDown={key}>{Icon && <Icon size={15} aria-hidden="true" />}<span>{win.title}</span></div>
      <span id={helpId} className="k-sr">{wide ? "Arrow keys move the window, Shift plus arrow keys resize it, Escape closes it." : "Escape closes it."}</span>
      <button type="button" className="os-win-btn" aria-label={`Minimize ${win.title}`} onClick={() => dispatch({ t: "minimize", id: win.id })}><Minus size={15} aria-hidden="true" /></button>
      <button type="button" className="os-win-btn is-close" aria-label={`Close ${win.title}`} onClick={() => dispatch({ t: "close", id: win.id })}><X size={15} aria-hidden="true" /></button>
    </header>
    <div className="os-win-body">{children}</div>
    {wide && <div className="os-win-grip" aria-hidden="true" onPointerDown={e => start(e, "size")} onPointerMove={moveDrag} onPointerUp={endDrag} />}
  </section>;
}

/** Dock: one button per tool of this chapter. Click opens, restores, focuses or minimizes. State is shown by icon + text + dot, never by colour alone. */
function OsDock() {
  const c = useContext(OsCtx); const reset = useCallback(() => c?.dispatch({ t: "reset", ...view() }), [c]);
  if (!c || c.state.order.length === 0 || typeof document === "undefined") return null;
  const { state, dispatch } = c, top = Math.max(0, ...state.order.map(id => state.wins[id].z));
  return createPortal(<nav className="os-dock" aria-label="GHOST//OS applications">
    {state.order.map(id => { const w = state.wins[id], Icon = w.icon, shown = w.open && !w.min, front = shown && w.z === top;
      return <button key={id} type="button" className={`os-dock-btn ${shown ? "is-open" : ""} ${w.open && w.min ? "is-min" : ""}`} aria-pressed={shown} data-app={id}
        onClick={() => dispatch({ t: !w.open || w.min || !front ? "open" : "minimize", id })}>{Icon && <Icon size={18} aria-hidden="true" />}<span>{w.title}</span>{w.open && <i aria-hidden="true" />}<span className="k-sr">{w.open ? (w.min ? ", minimized" : ", open") : ", closed"}</span></button>; })}
    <button type="button" className="os-dock-btn is-reset" onClick={reset} aria-label="Reset window layout"><RotateCcw size={16} aria-hidden="true" /><span>Reset</span></button>
  </nav>, document.body);
}
