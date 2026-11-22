"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminGet, adminPost, ApiError } from "../api";

type Timing = { serverNow: string; phase: "not_started" | "running" | "complete"; startsAt: string | null; schedule: { at: string; event: string }[] | null; taunt: string | null; chapter: number | null; chapterTitle: string | null; chapterEndsAt: string | null; endsAt: string | null };
type Ready = { ready: boolean; checks: { id: string; ok: boolean; blocking: boolean; message: string }[]; active: number; standby: number };
export const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const hms = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const errText = (e: unknown) => e instanceof ApiError ? (e.status === 401 ? "Organizer session expired. Sign in again." : e.message) : "Unexpected error";

/** Polls organizer timing; the displayed countdown is server time + a measured offset (the device clock is never trusted). */
export function useTiming(everyMs = 2000) {
  const [t, setT] = useState<Timing | null>(null), [nowMs, setNow] = useState(0), [err, setErr] = useState(""), base = useRef({ server: 0, perf: 0 });
  const load = useCallback(async () => {
    try { const x = await adminGet<Timing>("timing"); base.current = { server: Date.parse(x.serverNow), perf: performance.now() }; setT(x); setNow(base.current.server); setErr(""); } catch (e) { setErr(errText(e)); }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0), poll = setInterval(() => { if (document.visibilityState === "visible") void load(); }, everyMs), tick = setInterval(() => { if (base.current.server) setNow(base.current.server + performance.now() - base.current.perf); }, 250);
    return () => { clearTimeout(first); clearInterval(poll); clearInterval(tick); };
  }, [load, everyMs]);
  return { t, nowMs, err, reload: load };
}

export function PaperControl() {
  const { t, nowMs, err, reload } = useTiming(), [ready, setReady] = useState<Ready | null>(null), [msg, setMsg] = useState(""), [armed, setArmed] = useState<"" | "start" | "end" | "enroll">(""), [reason, setReason] = useState(""), [busy, setBusy] = useState(false);
  const loadReady = useCallback(() => { adminGet<Ready>("readiness").then(setReady).catch(e => setMsg(errText(e))); }, []);
  useEffect(() => { const id = setTimeout(loadReady, 0); return () => clearTimeout(id); }, [loadReady, t?.phase]);
  async function act(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg("");
    try { await adminPost(body); setMsg(ok); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); setArmed(""); await reload(); loadReady(); }
  }
  const left = t?.chapterEndsAt ? Date.parse(t.chapterEndsAt) - nowMs : 0, total = t?.endsAt && t.phase === "running" ? Date.parse(t.endsAt) - nowMs : 0;
  return <div className="rc-wrap">
    <header className="rc-head"><div><span className="k-eyebrow">GHOST RETURNS · ROUND 2</span><h1>Round 2 control room</h1><p>Paper format: 4 timed chapters, 40 minutes. Teams read on screen and write on paper. Nothing is scored online.</p></div>
      <nav className="rc-links" aria-label="Round 2 tools"><a className="k-btn" href="/admin/round2/projector">Projector countdown</a><a className="k-btn" href="/admin/demo/round2?unit=1">Demo Mode</a><Link className="k-btn" href="/admin/round2/print">Printable jury materials</Link></nav></header>
    {(err || msg) && <p role="status" className="rc-msg">{msg || err}</p>}
    <section className="rc-clock" aria-label="Clock">
      {!t ? <p>Loading…</p> : t.phase === "not_started" ? <><h2>Not started</h2><p>Enroll the finalists, then start when the room is ready.</p></> : t.phase === "complete" ? <><h2>INVESTIGATION COMPLETE — PENS DOWN</h2><p>All chapters are closed for every team.</p></> :
        <><div><small>CURRENT CHAPTER</small><h2>{t.chapter} · {t.chapterTitle}</h2></div><div><small>CHAPTER TIME LEFT</small><b className="rc-big">{mmss(left)}</b></div><div><small>INVESTIGATION LEFT</small><b className="rc-big">{mmss(total)}</b></div></>}
    </section>
    {t?.schedule && <section className="rc-card" aria-label="Schedule"><h2>Scheduled transitions</h2><ol className="rc-sched">{t.schedule.map(s => { const past = Date.parse(s.at) <= nowMs; return <li key={s.at} className={past ? "is-past" : ""}><time>{hms(s.at)}</time> {s.event}{past ? " ✓" : ""}</li>; })}</ol><p className="rc-note">Chapters switch by themselves on the server clock. No organizer action is needed between chapters.</p></section>}
    {t?.phase === "not_started" && ready && <section className="rc-card" aria-label="Readiness"><h2>Readiness</h2><ul>{ready.checks.filter(c => c.id !== "content-complete").map(c => <li key={c.id} className={c.ok ? "ok" : c.blocking ? "bad" : "warn"}>{c.ok ? "✓" : c.blocking ? "✗" : "!"} {c.message}</li>)}</ul>
      <p>{ready.active} active finalists · {ready.standby} standby</p>
      <div className="rc-actions">
        {armed === "enroll" ? <><button className="k-btn k-btn-primary" disabled={busy} onClick={() => void act({ action: "enroll" }, "Finalists enrolled from the confirmed qualification.")}>Confirm enroll</button><button className="k-btn" onClick={() => setArmed("")}>Cancel</button></> : <button className="k-btn" disabled={busy} onClick={() => setArmed("enroll")}>Enroll finalists</button>}
        {armed === "start" ? <><button className="k-btn k-btn-danger" disabled={busy} onClick={() => void act({ action: "start" }, "Investigation started. Chapter 1 is open.")}>Yes, start the 40-minute investigation</button><button className="k-btn" onClick={() => setArmed("")}>Cancel</button></> : <button className="k-btn k-btn-primary" disabled={busy || !ready.ready} onClick={() => setArmed("start")}>Start investigation</button>}
      </div></section>}
    {t?.phase === "running" && <section className="rc-card" aria-label="End now"><h2>End early</h2><p>Closes every chapter immediately and shows PENS DOWN. Cannot be undone.</p>
      <label>Reason (required)<input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label>
      {armed === "end" ? <><button className="k-btn k-btn-danger" disabled={busy || reason.trim().length < 5} onClick={() => void act({ action: "end", reason }, "Investigation ended.")}>Yes, end now</button> <button className="k-btn" onClick={() => setArmed("")}>Cancel</button></> : <button className="k-btn k-btn-danger" onClick={() => setArmed("end")}>End investigation now</button>}</section>}
    {t?.taunt && <p className="rc-taunt" role="status">GHOST_404: “{t.taunt}”</p>}
  </div>;
}

/** Full-screen projector countdown with the GHOST_404 taunt at each transition. */
export function PaperProjector() {
  const { t, nowMs, err } = useTiming(1500);
  const left = t?.chapterEndsAt ? Date.parse(t.chapterEndsAt) - nowMs : 0, total = t?.endsAt && t.phase === "running" ? Date.parse(t.endsAt) - nowMs : 0;
  return <div className="rpj"><small>OPERATION GHOST_404 · GHOST RETURNS</small>
    {!t ? <h1>{err || "Connecting…"}</h1> : t.phase === "not_started" ? <h1>STAND BY</h1> : t.phase === "complete" ? <h1 className="rpj-done">INVESTIGATION COMPLETE — PENS DOWN</h1> :
      <><h2>CHAPTER {t.chapter} OF 4 · {t.chapterTitle?.toUpperCase()}</h2><b className={`rpj-time ${left < 60_000 ? "is-urgent" : ""}`} role="timer" aria-label="Chapter time remaining">{mmss(left)}</b><p>Investigation ends in <b>{mmss(total)}</b></p>
        <ol className="rpj-rail" aria-label="Chapters">{[1, 2, 3, 4].map(n => <li key={n} className={n === t.chapter ? "is-on" : n < (t.chapter ?? 0) ? "is-done" : ""}>{n}</li>)}</ol></>}
    {t?.taunt && <p className="rpj-taunt" role="status">“{t.taunt}” <i>GHOST_404</i></p>}
  </div>;
}
