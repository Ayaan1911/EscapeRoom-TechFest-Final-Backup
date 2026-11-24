"use client";
// Projector broadcast. Read-only, no controls: it polls the organizer-only endpoint and shows the scene the SERVER chose.
// The only clock logic is a countdown to a server deadline, offset by the server's own time. A lost connection hides the clock.
import { useCallback, useEffect, useRef, useState } from "react";
import type { BroadcastPayload } from "@/lib/game/broadcast.server";

const POLL_MS = 5_000, STALE_MS = 15_000, URGENT_MS = 5 * 60_000;
const R1 = ["Inbox", "Trail", "Insider", "Containment", "Final Verdict"];
const R2 = ["Alert at 2:14 AM", "Kill Switch", "Audit the AI", "The Three Calls"];
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const LABEL: Record<BroadcastPayload["scene"], string> = { standby: "STANDBY", "r1-running": "ROUND 1 · LIVE", "r1-complete": "ROUND 1 · CLOSED", intermission: "INTERMISSION", "r2-waiting": "ROUND 2 · STANDBY", "r2-running": "ROUND 2 · LIVE", "pens-down": "ROUND 2 · PENS DOWN", results: "RESULTS" };

function useBroadcast() {
  const [data, setData] = useState<BroadcastPayload | null>(null), [err, setErr] = useState(""), [now, setNow] = useState(0), [age, setAge] = useState(0), base = useRef({ server: 0, perf: 0 });
  const load = useCallback(async () => {
    try {
      const t0 = performance.now(), res = await fetch("/api/admin/projector", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 401 ? "Organizer session expired. Sign in again on this screen." : "Connection interrupted. Retrying.");
      const body: BroadcastPayload = await res.json();
      base.current = { server: body.serverNow + (performance.now() - t0) / 2, perf: performance.now() }; setData(body); setErr("");
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0), poll = setInterval(() => { if (document.visibilityState !== "hidden") void load(); }, POLL_MS);
    const tick = setInterval(() => { if (base.current.server) { const since = performance.now() - base.current.perf; setNow(base.current.server + since); setAge(since); } }, 250);
    return () => { clearTimeout(first); clearInterval(poll); clearInterval(tick); };
  }, [load]);
  return { data, err, now, stale: !!data && age > STALE_MS, age };
}

function Clock({ deadline, now, stale, label }: { deadline: string | null; now: number; stale: boolean; label: string }) {
  if (!deadline) return null;
  const left = Date.parse(deadline) - now, urgent = left < URGENT_MS, last = left < 60_000;
  return <div className={`bc-clock ${urgent ? "is-urgent" : ""} ${last ? "is-last" : ""}`}>
    <small>{stale ? "CLOCK PAUSED · RECONNECTING" : urgent ? "FINAL MINUTES" : "TIME REMAINING"}</small>
    <b role="timer" aria-label={label}>{stale ? "--:--" : mmss(left)}</b></div>;
}

function Standings({ rows, max, title }: { rows: { rank: number; tied: boolean; name: string; score: number; sub?: string }[]; max: number; title: string }) {
  const top = rows.slice(0, 3), rest = rows.slice(3, 12);
  return <section className="bc-board" aria-labelledby="bc-board-h"><h2 id="bc-board-h">{title}</h2>
    <ol className="bc-podium" aria-label="Top three">{top.map(r => <li key={r.name} className={`is-${r.rank}`}><span className="bc-rank">{r.tied ? "=" : ""}{r.rank}</span><b>{r.name}</b><em>{r.score}<small> / {max}</small></em></li>)}</ol>
    {rest.length > 0 && <ol className="bc-list" aria-label="Team standings">{rest.map(r => <li key={r.name}><span className="bc-rank">{r.tied ? "=" : ""}{r.rank}</span><b>{r.name}</b>{r.sub && <small>{r.sub}</small>}<em>{r.score}</em></li>)}</ol>}
    {rows.length > 12 && <p className="bc-more">+{rows.length - 12} more teams</p>}
  </section>;
}

export function Broadcast() {
  const { data, err, now, stale, age } = useBroadcast();
  const scene = data?.scene;
  const standings = data?.standings?.map(t => ({ rank: t.rank, tied: t.tied, name: t.name, score: t.score, sub: `${t.chaptersDone}/5 chapters` })) ?? null;
  return <div className={`bc bc-${scene ?? "connecting"}`}>
    <div className="bc-grid" aria-hidden="true" />
    <header className="bc-top"><span className="bc-brand">OPERATION GHOST_404<small>NEXUS INCIDENT RESPONSE</small></span><span className="bc-scene-label">{scene ? LABEL[scene] : "CONNECTING"}</span></header>
    {(err || stale) && <p className="bc-warn" role="alert">{err || `No update for ${Math.round(age / 1000)} s · reconnecting`}</p>}
    <div className="bc-stage" key={scene ?? "none"}>
      {!data ? <section className="bc-center"><h1>CONNECTING…</h1><p>Waiting for the event server.</p></section>
      : scene === "standby" ? <section className="bc-center"><span className="bc-kicker">STAND BY</span><h1>OPERATION GHOST_404</h1><p>The investigation begins when the organizers start Round 1.</p><ol className="bc-path" aria-label="Round 1 chapters">{R1.map((c, i) => <li key={c}><span>{i + 1}</span>{c}</li>)}</ol></section>
      : scene === "r1-running" ? <section className={`bc-split ${standings ? "" : "is-solo"}`}><div className="bc-lead"><span className="bc-kicker">ROUND 1 · INVESTIGATION LIVE</span><h1>Find the insider.</h1><Clock deadline={data.r1.deadline} now={now} stale={stale} label="Round 1 time remaining" />
          <ol className="bc-path" aria-label="Round 1 chapters">{R1.map((c, i) => <li key={c}><span>{i + 1}</span>{c}</li>)}</ol></div>
          {standings && <Standings rows={standings} max={105} title="Live leaderboard" />}</section>
      : scene === "r1-complete" ? <section className={`bc-split ${standings ? "" : "is-solo"}`}><div className="bc-lead"><span className="bc-kicker">ROUND 1 · TIME IS UP</span><h1>Round 1 complete</h1><p>Investigations are closed. Results are under organizer review.</p></div>{standings && <Standings rows={standings} max={105} title="Round 1 standings" />}</section>
      : scene === "intermission" ? <section className="bc-center"><span className="bc-kicker">INTERMISSION</span><h1>The ghost is not finished.</h1><p>Qualification is confirmed. The organizers will announce the finalists shortly.</p></section>
      : scene === "r2-waiting" ? <section className="bc-center"><span className="bc-kicker">ROUND 2 · WAITING FOR THE ORGANIZER START</span><h1>GHOST RETURNS</h1><p>Four injects. One shared 60-minute clock. Answers on paper.</p>
          <ol className="bc-injects" aria-label="Injects">{R2.map((c, i) => <li key={c}><span>{i + 1}</span>{c}</li>)}</ol>
          {data.finalists && <div className="bc-finalists"><h2>Finalists</h2><ol>{data.finalists.map(n => <li key={n}>{n}</li>)}</ol></div>}</section>
      : scene === "r2-running" ? <section className="bc-center bc-live"><span className="bc-kicker">GHOST RETURNS — PART A</span><h1 className="sr-only">Round 2 running</h1>
          <Clock deadline={data.r2.endsAt} now={now} stale={stale} label="Round 2 time remaining" />
          {data.r2.endsAt && !stale && <div className="bc-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, (Date.parse(data.r2.endsAt) - now) / 3_600_000)) * 100}%` }} /></div>}
          <ol className="bc-injects is-open" aria-label="Injects">{R2.map((c, i) => <li key={c}><span>{i + 1}</span>{c}<em>OPEN</em></li>)}</ol>
          <p>All four injects are open · answers on paper · only Kill Switch takes typed commands · pens down at 60:00</p></section>
      : scene === "pens-down" ? <section className="bc-center bc-pens"><span className="bc-kicker">GHOST RETURNS · 60:00</span><h1>PENS DOWN</h1><p>Investigation complete. Put your pens down. The jury takes it from here.</p></section>
      : <section className="bc-center bc-results"><span className="bc-kicker">GHOST RETURNS · FINAL STANDINGS</span><h1>Results</h1>
          {data.results && <Standings rows={data.results.map(r => ({ rank: r.rank, tied: r.tied, name: r.name, score: r.total }))} max={60} title="Round 2 · published by the organizers" />}</section>}
    </div>
    {data?.r2.taunt && (scene === "r2-running" || scene === "pens-down") && <p className="bc-taunt" role="status">“{data.r2.taunt}” <i>— GHOST_404</i></p>}
  </div>;
}
