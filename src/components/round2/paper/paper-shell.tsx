"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertDesk, AuditDesk, CallsDesk, NetworkMonitor } from "./chapters";
import type { ChapterView, PaperStatus } from "@/lib/round2/paper/types";

const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

function ChapterBody({ ch }: { ch: ChapterView }) {
  const c = ch.content;
  return c.kind === "alert" ? <AlertDesk c={c} /> : c.kind === "network" ? <NetworkMonitor c={c} /> : c.kind === "audit" ? <AuditDesk c={c} /> : <CallsDesk c={c} />;
}
const GOAL: Record<number, string> = { 1: "Decide the response. Find the evidence.", 2: "Find the two attacker connections.", 3: "Audit the AI's five claims.", 4: "Take three calls. Draft the statement." };

/** Server-clock driven participant shell. `demo` (organizer preview only) shows any chapter with no timers and no polling. */
export function PaperShell({ initial, teamName, demo }: { initial: PaperStatus; teamName: string; demo?: { chapters: ChapterView[]; start: number } }) {
  const [status, setStatus] = useState(initial), [demoN, setDemoN] = useState(demo?.start ?? 1), [offline, setOffline] = useState(false), [nowMs, setNowMs] = useState(() => Date.parse(initial.serverNow));
  const base = useRef({ server: Date.parse(initial.serverNow), perf: 0 }), latest = useRef(initial);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/round2/status", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const next = (await r.json()) as PaperStatus; base.current = { server: Date.parse(next.serverNow), perf: performance.now() }; latest.current = next; setStatus(next); setNowMs(base.current.server); setOffline(false);
    } catch { setOffline(true); }
  }, []);
  useEffect(() => {
    if (demo) return;
    base.current = { server: Date.parse(initial.serverNow), perf: performance.now() }; // server time is the only clock: the device clock is never read
    let n = 0;
    const id = setInterval(() => {
      const est = base.current.server + (performance.now() - base.current.perf); setNowMs(est); n++;
      const cur = latest.current, end = cur.chapter ? Date.parse(cur.chapter.endsAt) : null, boundary = end !== null && est >= end - 1500; // refetch every second around a chapter boundary
      if (document.visibilityState === "visible" && (boundary || n % (cur.phase === "complete" ? 30 : 8) === 0)) void refresh();
    }, 500);
    return () => clearInterval(id);
  }, [demo, refresh, initial.serverNow]);
  const chapterEnd = status.chapter ? Date.parse(status.chapter.endsAt) : null, expired = !demo && chapterEnd !== null && nowMs >= chapterEnd;

  if (demo) {
    const ch = demo.chapters.find(c => c.n === demoN)!;
    return <div className="rp-wrap" data-chapter={ch.n}><TopBar team="Organizer preview" right={<span className="rp-demo">DEMO · NO TIMERS · NOTHING IS RECORDED</span>} />
      <nav className="rp-rail" aria-label="Chapters">{demo.chapters.map(c => <button key={c.n} aria-current={c.n === demoN ? "step" : undefined} className={c.n === demoN ? "is-active" : "is-open"} onClick={() => setDemoN(c.n)}><b>{c.n}</b><span>{c.title}</span></button>)}</nav>
      <ChapterHead n={ch.n} title={ch.title} /><ChapterBody ch={ch} /></div>;
  }
  if (status.phase === "complete") return <div className="rp-wrap"><TopBar team={teamName} /><section className="rp-done" role="status"><h1>INVESTIGATION COMPLETE — PENS DOWN</h1><p>Put your pen down and hand your answer sheet to a volunteer. Wait for the jury.</p></section></div>;
  if (status.phase === "not_started" || !status.chapter) return <div className="rp-wrap"><TopBar team={teamName} /><section className="rp-wait" role="status"><h1>Stand by</h1><p>The investigation starts when the organizer says so. Keep this page open; it will begin by itself.</p></section>{offline && <p className="rp-offline" role="alert">Connection lost. Retrying…</p>}</div>;
  const ch = status.chapter, left = chapterEnd! - nowMs, total = Date.parse(status.endsAt!) - nowMs;
  return <div className="rp-wrap" data-chapter={ch.n}>
    <TopBar team={teamName} right={<div className="rp-clocks"><div><small>THIS CHAPTER</small><b role="timer" aria-label="Chapter time remaining" className={left < 60_000 ? "is-urgent" : ""}>{mmss(left)}</b></div><div><small>INVESTIGATION</small><b role="timer" aria-label="Investigation time remaining">{mmss(total)}</b></div></div>} />
    <nav className="rp-rail" aria-label="Chapters">{status.rail.map(r => <span key={r.n} aria-current={r.state === "active" ? "step" : undefined} className={`is-${r.state}`}><b>{r.state === "done" ? "✓" : r.state === "locked" ? "🔒" : r.n}</b><span>{r.state === "locked" ? `Chapter ${r.n}` : r.title}</span></span>)}</nav>
    {offline && <p className="rp-offline" role="alert">Connection lost. The clock keeps running. Retrying…</p>}
    {expired ? <section className="rp-wait" role="status"><h1>Chapter {ch.n} closed</h1><p>Loading the next step…</p></section> : <><ChapterHead n={ch.n} title={ch.title} /><ChapterBody ch={ch} /></>}
  </div>;
}
function TopBar({ team, right }: { team: string; right?: React.ReactNode }) { return <header className="rp-top"><div><small>GHOST RETURNS</small><b>OPERATION GHOST_404</b></div><div className="rp-team"><small>TEAM</small><b>{team}</b></div>{right}</header>; }
function ChapterHead({ n, title }: { n: number; title: string }) { return <div className="rp-head"><span className="rp-chnum">CHAPTER {n} OF 4</span><h1>{title}</h1><p>{GOAL[n]}</p><p className="rp-paper"><span aria-hidden="true">✎</span> Write every answer on your paper answer sheet. Nothing is typed or sent from this screen.</p></div>; }
