"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Inject1, Inject3, Inject4 } from "./injects";
import { Inject2 } from "./kill-switch";
import type { InjectView, OpenStatus } from "@/lib/round2/paper/types";

const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const ROLE: Record<number, string> = { 1: "Incident triage", 2: "Network defense terminal", 3: "AI verification", 4: "Executive decisions" };

function Body({ v, demo }: { v: InjectView; demo?: boolean }) {
  const c = v.content;
  return c.kind === "i1" ? <Inject1 c={c} /> : c.kind === "i2" ? <Inject2 c={c} demo={demo} /> : c.kind === "i3" ? <Inject3 c={c} /> : <Inject4 c={c} />;
}

/** open-60 participant shell: one 60-minute server clock, all four injects open, suggested pacing only. `demo` = organizer preview without a clock. */
export function OpenShell({ initial, teamName, demo }: { initial: OpenStatus; teamName: string; demo?: { injects: InjectView[]; start: number } }) {
  const [status, setStatus] = useState(initial), [offline, setOffline] = useState(false), [nowMs, setNowMs] = useState(() => Date.parse(initial.serverNow));
  const [active, setActive] = useState(demo?.start ?? 1);
  const base = useRef({ server: Date.parse(initial.serverNow), perf: 0 });
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/round2/status", { cache: "no-store" }); if (!r.ok) throw new Error(String(r.status));
      const next = (await r.json()) as OpenStatus; base.current = { server: Date.parse(next.serverNow), perf: performance.now() }; setStatus(next); setNowMs(base.current.server); setOffline(false);
    } catch { setOffline(true); }
  }, []);
  useEffect(() => {
    if (demo) return;
    base.current = { server: Date.parse(initial.serverNow), perf: performance.now() }; // the server clock is the only clock
    let n = 0;
    const id = setInterval(() => {
      const est = base.current.server + (performance.now() - base.current.perf); setNowMs(est); n++;
      const end = status.endsAt ? Date.parse(status.endsAt) : null, near = end !== null && est >= end - 1500;
      if (document.visibilityState === "visible" && (near || n % 16 === 0)) void refresh();
    }, 500);
    return () => clearInterval(id);
  }, [demo, refresh, initial.serverNow, status.endsAt]);
  useEffect(() => { try { const s = Number(sessionStorage.getItem("ghost.r2.open.tab")); if (s >= 1 && s <= 4 && !demo) setTimeout(() => setActive(s), 0); } catch { /* storage unavailable */ } }, [demo]);
  const pick = (n: number) => { setActive(n); try { sessionStorage.setItem("ghost.r2.open.tab", String(n)); } catch { /* ignore */ } window.scrollTo({ top: 0, behavior: "smooth" }); };

  const injects = demo ? demo.injects : status.injects;
  const end = status.endsAt ? Date.parse(status.endsAt) : null, expired = !demo && end !== null && nowMs >= end;
  const start = status.startsAt ? Date.parse(status.startsAt) : null, elapsedMin = start ? (nowMs - start) / 60_000 : 0;
  const suggested = injects?.find(v => elapsedMin >= v.pace.fromMin && elapsedMin < v.pace.toMin)?.n ?? null;
  const top = (right?: React.ReactNode) => <header className="rp-top"><div><small>GHOST RETURNS · PART A</small><b>OPERATION GHOST_404</b></div><div className="rp-team"><small>TEAM</small><b>{teamName}</b></div>{right}</header>;

  if (!demo && (status.phase === "complete" || expired)) return <div className="rp-wrap cn-scene cn-r2s ij-shell">{top()}<section className="rp-done" role="status">{status.retired ? <><h1>Round 2 is closed</h1><p>There is no Round 2 running on this server. Wait for the organizer.</p></> : <><h1>PENS DOWN</h1><p>The 60 minutes are over. The terminal is locked. Hand your answer sheet to a volunteer and wait for the jury.</p></>}</section></div>;
  if (!demo && (status.phase === "not_started" || !injects)) return <div className="rp-wrap cn-scene cn-r2s ij-shell">{top()}<section className="rp-wait" role="status"><h1>Stand by</h1><p>GHOST RETURNS starts when the organizer says so: 60 minutes, four injects, all open from the start. No AI tools. Keep this page open.</p></section>{offline && <p className="rp-offline" role="alert">Connection lost. Retrying…</p>}</div>;
  const v = injects!.find(x => x.n === active) ?? injects![0];
  return <div className="rp-wrap cn-scene cn-r2s ij-shell" data-chapter={v.n}>
    {top(demo ? <span className="rp-demo">DEMO · CASE v2 · NO CLOCK · NOTHING IS RECORDED</span> : <div className="rp-clocks"><div><small>PART A ENDS IN</small><b role="timer" aria-label="Time remaining" className={end! - nowMs < 5 * 60_000 ? "is-urgent" : ""}>{mmss(end! - nowMs)}</b></div><div><small>SUGGESTED NOW</small><b>{suggested ? `Inject ${suggested}` : "Buffer"}</b></div></div>)}
    <nav className="ij-rail" aria-label="Injects">{injects!.map(x => <button key={x.n} type="button" aria-current={x.n === v.n ? "page" : undefined} className={`${x.n === v.n ? "is-active" : ""} ${x.n === suggested ? "is-suggested" : ""}`} onClick={() => pick(x.n)}>
      <b>{x.n}</b><span><strong>{x.title}</strong><small>{ROLE[x.n]} · suggested {x.pace.fromMin}–{x.pace.toMin} min</small></span></button>)}</nav>
    {offline && <p className="rp-offline" role="alert">Connection lost. The clock keeps running on the server. Retrying…</p>}
    <div className="rp-head"><span className="rp-chnum">INJECT {v.n} OF 4 · {ROLE[v.n].toUpperCase()}</span><h1>{v.title}</h1></div>
    <p className="ij-rule"><span aria-hidden="true">✎</span> Every answer is written on paper. All four injects stay open until pens down. <b>Only Inject 2 accepts typed commands.</b></p>
    <Body v={v} demo={!!demo} />
  </div>;
}
