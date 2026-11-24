"use client";
// Projector broadcast. Read-only, no controls: it polls the organizer-only endpoint and shows the scene the SERVER chose.
// The only clock logic is a countdown to a server deadline, offset by the server's own time. A lost connection hides the clock.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BroadcastPayload } from "@/lib/game/broadcast.server";
import { selectBoard, type BoardView } from "@/lib/game/projector-board";

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
    } catch (e) { setErr(e instanceof TypeError ? "Connection interrupted. Retrying." : (e as Error).message); } // a dropped network surfaces as a TypeError ("Failed to fetch")
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

/** Rows glide to their new place instead of jumping (first paint and reduced-motion users get no movement). */
function useFlip(order: string) {
  const ref = useRef<HTMLOListElement>(null), prev = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const list = ref.current; if (!list) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches, next = new Map<string, DOMRect>();
    list.querySelectorAll<HTMLElement>("[data-key]").forEach(el => {
      const k = el.dataset.key ?? "", r = el.getBoundingClientRect(), was = prev.current.get(k); next.set(k, r);
      if (!reduce && was && (Math.abs(was.top - r.top) > 1 || Math.abs(was.left - r.left) > 1)) el.animate([{ transform: `translate(${was.left - r.left}px, ${was.top - r.top}px)` }, { transform: "none" }], { duration: 600, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    prev.current = next;
  }, [order]);
  return ref;
}

const HEADING: Record<BoardView["kind"], (scene: BroadcastPayload["scene"]) => string> = {
  r1: scene => scene === "r1-running" ? "Live leaderboard" : "Round 1 standings", finalists: () => "Finalists", results: () => "Results",
};

/** The main region: up to twelve real rows from the server, two columns of six at projector size. Nothing is padded to reach twelve. */
function Board({ view, scene, stale }: { view: BoardView; scene: BroadcastPayload["scene"]; stale: boolean }) {
  const ref = useFlip(view.rows.map(r => r.key).join("|"));
  return <section className={`bc-lb is-${view.kind}${stale ? " is-stale" : ""}`} aria-labelledby="bc-lb-h">
    <header className="bc-lb-head"><h2 id="bc-lb-h">{HEADING[view.kind](scene)}</h2><span className="bc-badge">{view.badge}</span></header>
    <ol className={`bc-lb-list${view.rows.length <= 6 ? " is-one" : ""}`} ref={ref} aria-label={`${HEADING[view.kind](scene)}, ${view.rows.length} team${view.rows.length === 1 ? "" : "s"}`}>
      {view.rows.map((r, i) => <li key={r.key} data-key={r.key} className={`bc-lb-row${r.rank !== null && r.rank <= 3 ? ` is-top is-${r.rank}` : ""}`} style={{ animationDelay: `${i * 40}ms` }}>
        <span className="bc-rank" aria-label={r.rank === null ? "qualified" : `rank ${r.rank}${r.tied ? ", tied" : ""}`}>{r.rank === null ? "◆" : <>{r.tied ? "=" : ""}{r.rank}</>}</span>
        <b>{r.name}</b>
        {r.sub && <small>{r.sub}</small>}
        {r.score === null ? <em className="bc-q">QUALIFIED</em> : <em key={r.score}>{r.score}{view.max ? <small> / {view.max}</small> : null}</em>}
      </li>)}
    </ol>
    <footer className="bc-lb-foot"><span>{view.note}</span>{view.extra > 0 && <span>+{view.extra} more team{view.extra === 1 ? "" : "s"}</span>}{view.extraNote && <span>{view.extraNote}</span>}</footer>
  </section>;
}

/** Scenes with no organizer-approved ranking (or no ranking at all): a calm status screen. It never shows scores. */
function Status({ data }: { data: BroadcastPayload }) {
  const scene = data.scene;
  if (scene === "standby") return <section className="bc-center bc-status"><span className="bc-kicker">STAND BY</span><h1>OPERATION GHOST_404</h1><p>The investigation begins when the organizers start Round 1.</p><ol className="bc-path" aria-label="Round 1 chapters">{R1.map((c, i) => <li key={c}><span>{i + 1}</span>{c}</li>)}</ol></section>;
  if (scene === "r1-running") return <section className="bc-center bc-status"><span className="bc-kicker">ROUND 1 · INVESTIGATION LIVE</span><h1>Find the insider.</h1><p>Live standings are not being shown. Keep investigating.</p><ol className="bc-path" aria-label="Round 1 chapters">{R1.map((c, i) => <li key={c}><span>{i + 1}</span>{c}</li>)}</ol></section>;
  if (scene === "r1-complete") return <section className="bc-center bc-status"><span className="bc-kicker">ROUND 1 · TIME IS UP</span><h1>Round 1 complete</h1><p>Investigations are closed. Results are under organizer review.</p></section>;
  if (scene === "intermission") return <section className="bc-center bc-status"><span className="bc-kicker">INTERMISSION</span><h1>The ghost is not finished.</h1><p>Qualification is confirmed. The organizers will announce the finalists shortly.</p></section>;
  if (scene === "r2-waiting") return <section className="bc-center bc-status"><span className="bc-kicker">ROUND 2 · WAITING FOR THE ORGANIZER START</span><h1>GHOST RETURNS</h1><p>Four injects. One shared 60-minute clock. Answers on paper.</p><ol className="bc-injects" aria-label="Injects">{R2.map((c, i) => <li key={c}><span>{i + 1}</span>{c}</li>)}</ol></section>;
  if (scene === "r2-running") return <section className="bc-center bc-status"><span className="bc-kicker">GHOST RETURNS — PART A</span><h1 className="sr-only">Round 2 running</h1><ol className="bc-injects is-open" aria-label="Injects">{R2.map((c, i) => <li key={c}><span>{i + 1}</span>{c}<em>OPEN</em></li>)}</ol><p>All four injects are open · answers on paper · only Kill Switch takes typed commands · pens down at 60:00</p></section>;
  if (scene === "pens-down") return <section className="bc-center bc-pens"><span className="bc-kicker">GHOST RETURNS · 60:00</span><h1>PENS DOWN</h1><p>Investigation complete. Put your pens down. The jury takes it from here.</p></section>;
  return <section className="bc-center bc-status"><span className="bc-kicker">GHOST RETURNS · FINAL STANDINGS</span><h1>Results</h1><p>The official results will appear here once the organizers publish them.</p></section>;
}

export function Broadcast() {
  const { data, err, now, stale, age } = useBroadcast();
  const scene = data?.scene;
  // pens-down is a full-screen moment of its own; every other scene shows an organizer-approved board when there is one.
  const view = data && scene !== "pens-down" ? selectBoard({ scene: data.scene, standings: data.standings, finalists: data.finalists, results: data.results }) : null;
  const deadline = !data ? null : scene === "r1-running" ? data.r1.deadline : scene === "r2-running" ? data.r2.endsAt : null;
  return <div className={`bc bc-${scene ?? "connecting"}${view ? " has-board" : ""}`}>
    <div className="bc-grid" aria-hidden="true" />
    <header className="bc-top">
      <span className="bc-brand">OPERATION GHOST_404<small>NEXUS INCIDENT RESPONSE</small></span>
      <span className="bc-scene-label">{scene ? LABEL[scene] : "CONNECTING"}</span>
      {data && <Clock deadline={deadline} now={now} stale={stale} label={scene === "r2-running" ? "Round 2 time remaining" : "Round 1 time remaining"} />}
    </header>
    {data && scene === "r2-running" && data.r2.endsAt && !stale && <div className="bc-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, (Date.parse(data.r2.endsAt) - now) / 3_600_000)) * 100}%` }} /></div>}
    {(err || stale) && <p className="bc-warn" role="alert">{err || `No update for ${Math.round(age / 1000)} s · reconnecting`}</p>}
    <div className="bc-stage" key={scene ?? "none"}>
      {!data ? <section className="bc-center"><h1>CONNECTING…</h1><p>Waiting for the event server.</p></section> : view ? <Board view={view} scene={data.scene} stale={stale} /> : <Status data={data} />}
    </div>
    {data?.r2.taunt && (scene === "r2-running" || scene === "pens-down") && <p className="bc-taunt" role="status">“{data.r2.taunt}” <i>— GHOST_404</i></p>}
  </div>;
}
