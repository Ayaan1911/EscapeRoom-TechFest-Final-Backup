"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminGet, adminPost, ApiError } from "../api";
import { FORMAT_LABEL, OPEN_PACE, POINTS, RULES } from "@/lib/round2/paper/format";

// Organizer Round 2 control room and projector. ONE format: GHOST RETURNS Part A, 60 minutes, four open injects. No format choice.
type Timing = { retired?: boolean; serverNow: string; phase: "not_started" | "running" | "complete"; startsAt: string | null; schedule: { at: string; event: string }[] | null; taunt: string | null; chapter: number | null; chapterTitle: string | null; chapterEndsAt: string | null; endsAt: string | null };
type Ready = { ready: boolean; checks: { id: string; ok: boolean; blocking: boolean; message: string }[]; active: number; standby: number };
type Review = { keyReady: boolean; keyStatus: string | null; open: boolean; maxScore: number; teams: { teamId: string; name: string; attempts: { seq: number; ip: string; result: "caught" | "cleared"; at: string }[]; remaining: number; contained: number; lockReason: string; untouched: boolean; score: number | null }[] };
export const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const hms = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const errText = (e: unknown) => e instanceof ApiError ? (e.status === 401 ? "Organizer session expired. Sign in again." : e.message) : "Unexpected error";
const R2_NAMES = OPEN_PACE.map(p => p.title);

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

/** Kill Switch review for organizers and volunteers: each team's attempts, lock state and the portal-computed terminal score. */
function TerminalReview({ phase }: { phase?: string }) {
  const [r, setR] = useState<Review | null>(null), [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () => adminGet<Review>("terminal").then(x => { if (alive) { setR(x); setErr(""); } }).catch(e => { if (alive) setErr(errText(e)); });
    const first = setTimeout(load, 0), id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5000);
    return () => { alive = false; clearTimeout(first); clearInterval(id); };
  }, [phase]);
  return <section className="rc-card rc-term" aria-label="Kill Switch terminal review"><h2>Kill Switch · terminal review</h2>
    {err && <p className="rc-msg">{err}</p>}
    {!r ? <p>Loading…</p> : <>
      <p className="rc-note">{r.keyReady ? `Answer key installed (${r.keyStatus}).` : "Answer key NOT installed: the terminal is offline and no score can be computed."} Score 0–{r.maxScore}: +5 per attacker connection blocked, +5 if no legitimate connection blocked, −2 per legitimate block. Volunteers hand a correct-IP slip only after OUT OF ATTEMPTS; there is no reset.</p>
      <table className="rc-table"><thead><tr><th>Team</th><th>Attempts</th><th>Left</th><th>State</th><th>Score</th></tr></thead>
        <tbody>{r.teams.map(t => <tr key={t.teamId}><td><b>{t.teamId}</b><br /><small>{t.name}</small></td><td>{t.attempts.length ? t.attempts.map(a => <div key={a.seq} className={a.result === "caught" ? "ok" : "bad"}>{a.seq}. {a.ip} · {a.result === "caught" ? "attacker" : "legitimate"}</div>) : <i>none yet</i>}</td><td>{t.remaining}</td><td>{t.lockReason === "none" ? "open" : t.lockReason}</td><td><b>{t.score ?? "—"}</b>{t.untouched && t.score !== null ? <small> (untouched)</small> : null}</td></tr>)}</tbody></table></>}
  </section>;
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
    <header className="rc-head"><div><span className="k-eyebrow">GHOST RETURNS · ROUND 2</span><h1>Round 2 control room</h1><p>{FORMAT_LABEL}. Four injects open together; answers on paper; {POINTS.total} points (Kill Switch terminal scored by the portal, the rest by the jury).</p></div>
      <nav className="rc-links" aria-label="Round 2 tools"><a className="k-btn" href="/admin/round2/projector">Projector countdown</a><a className="k-btn" href="/admin/demo/round2?unit=1">Demo Mode</a><Link className="k-btn" href="/admin/round2/print">Printable materials</Link></nav></header>
    {(err || msg) && <p role="status" className="rc-msg">{msg || err}</p>}
    <section className="rc-clock" aria-label="Clock">
      {!t ? <p>Loading…</p> : t.retired ? <><h2>Historical session (retired 40-minute format)</h2><p>This database holds a session from the retired format. It is kept as history and cannot be restarted. Use a fresh event database for Round 2 (see the runbook).</p></>
        : t.phase === "not_started" ? <><h2>Not started</h2><p>Enroll the finalists, then start when the room is ready.</p></> : t.phase === "complete" ? <><h2>INVESTIGATION COMPLETE — PENS DOWN</h2><p>All injects are closed and every terminal is locked.</p></> :
        <><div><small>SUGGESTED NOW (ALL INJECTS OPEN)</small><h2>{t.chapter ? `${t.chapter} · ` : ""}{t.chapterTitle}</h2></div><div><small>SUGGESTED SLOT LEFT</small><b className="rc-big">{mmss(left)}</b></div><div><small>ROUND 2 LEFT</small><b className="rc-big">{mmss(total)}</b></div></>}
    </section>
    {t?.schedule && <section className="rc-card" aria-label="Schedule"><h2>Suggested pacing</h2><ol className="rc-sched">{t.schedule.map(s => { const past = Date.parse(s.at) <= nowMs; return <li key={s.at} className={past ? "is-past" : ""}><time>{hms(s.at)}</time> {s.event}{past ? " ✓" : ""}</li>; })}</ol><p className="rc-note">Pacing is advice only: every inject stays open until pens down at 60:00.</p></section>}
    {t?.phase === "not_started" && !t.retired && ready && <section className="rc-card" aria-label="Readiness"><h2>Readiness</h2><ul>{ready.checks.filter(c => c.id !== "content-complete").map(c => <li key={c.id} className={c.ok ? "ok" : c.blocking ? "bad" : "warn"}>{c.ok ? "✓" : c.blocking ? "✗" : "!"} {c.message}</li>)}</ul>
      <p>{ready.active} active finalists · {ready.standby} standby</p><ul className="rc-rules">{RULES.map(r => <li key={r}>{r}</li>)}</ul>
      <div className="rc-actions">
        {armed === "enroll" ? <><button className="k-btn k-btn-primary" disabled={busy} onClick={() => void act({ action: "enroll" }, "Finalists enrolled from the confirmed qualification.")}>Confirm enroll</button><button className="k-btn" onClick={() => setArmed("")}>Cancel</button></> : <button className="k-btn" disabled={busy} onClick={() => setArmed("enroll")}>Enroll finalists</button>}
        {armed === "start" ? <><button className="k-btn k-btn-danger" disabled={busy} onClick={() => void act({ action: "start" }, "Round 2 started: 60 minutes, all four injects open.")}>Yes, start the 60-minute investigation</button><button className="k-btn" onClick={() => setArmed("")}>Cancel</button></> : <button className="k-btn k-btn-primary" disabled={busy || !ready.ready} onClick={() => setArmed("start")}>Start Round 2</button>}
      </div></section>}
    {t?.phase === "running" && <section className="rc-card" aria-label="End now"><h2>End early</h2><p>Closes every inject immediately, locks every terminal and shows PENS DOWN. Cannot be undone.</p>
      <label>Reason (required)<input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label>
      {armed === "end" ? <><button className="k-btn k-btn-danger" disabled={busy || reason.trim().length < 5} onClick={() => void act({ action: "end", reason }, "Round 2 ended.")}>Yes, end now</button> <button className="k-btn" onClick={() => setArmed("")}>Cancel</button></> : <button className="k-btn k-btn-danger" onClick={() => setArmed("end")}>End Round 2 now</button>}</section>}
    {t && t.phase !== "not_started" && !t.retired && <TerminalReview phase={t.phase} />}
    {t?.taunt && <p className="rc-taunt" role="status">GHOST_404: “{t.taunt}”</p>}
  </div>;
}

/** Full-screen projector: the 60-minute countdown, the suggested inject, and GHOST_404's taunt at each transition. No team data. */
export function PaperProjector() {
  const { t, nowMs, err } = useTiming(1500);
  const total = t?.endsAt && t.phase === "running" ? Date.parse(t.endsAt) - nowMs : 0, frac = Math.max(0, Math.min(1, total / (60 * 60_000)));
  return <div className="rpj"><div className="rpj-radar" aria-hidden="true"><i /><i /><i /><b /></div><small>OPERATION GHOST_404 · GHOST RETURNS</small>
    {!t ? <h1>{err || "Connecting…"}</h1> : t.phase === "not_started" ? <><h1>STAND BY</h1><p className="rpj-sub">Awaiting the organizer. Pens down until the clock starts.</p></> : t.phase === "complete" ? <><h1 className="rpj-done">INVESTIGATION COMPLETE — PENS DOWN</h1><p className="rpj-sub">The jury will take it from here.</p></> :
      <><h2>ALL FOUR INJECTS OPEN · SUGGESTED NOW: {t.chapterTitle?.toUpperCase()}</h2><b className={`rpj-time ${total < 5 * 60_000 ? "is-urgent" : ""}`} role="timer" aria-label="Round 2 time remaining">{mmss(total)}</b>
        <div className="rpj-bar" aria-hidden="true"><i style={{ width: `${frac * 100}%` }} /></div><p>Pens down at 60:00 · only Kill Switch takes typed commands</p>
        <ol className="rpj-rail" aria-label="Injects">{[1, 2, 3, 4].map(n => <li key={n} className={n === t.chapter ? "is-on" : ""}><span>{n}</span><em>{R2_NAMES[n - 1]}</em></li>)}</ol></>}
    {t?.taunt && <p className="rpj-taunt" role="status">“{t.taunt}” <i>GHOST_404</i></p>}
  </div>;
}
