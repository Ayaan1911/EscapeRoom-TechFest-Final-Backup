"use client";
import { useEffect, useState } from "react";
import { titles, type Progress } from "@/lib/game/engine";
import { CaseClosed } from "./case-closed";
import { CHAPTERS, formatClock } from "@/components/ui/kit";
import { Meter, PulseState, ScoreRing, StatusPill } from "@/components/ui/design";

type Snapshot = { id: string; name: string; variant: string; participants: string[]; progress: Progress; score: number; hints: number; current: number; unlocked: boolean[]; unlockThresholds: number[]; tasks: { id: string; earned: number; max: number }[][]; status: string; serverNow: number; round: { deadline: string | null } };
const ROUTES = ["/play/inbox", "/play/trail", "/play/insider", "/play/containment", "/play/verdict"];
const FOCUS = ["Find the breach email and prove it", "Reconstruct the stolen session", "Unlock the Evidence Wall, name the insider", "Order the incident and plan the response", "Link the evidence and close the case"];

export function LiveDashboard() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    async function refresh() {
      try {
        const before = performance.now();
        const response = await fetch("/api/game", { cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 401 ? "Session expired. Sign in again." : "Connection interrupted. Reconnecting…");
        const snapshot: Snapshot = await response.json();
        if (!alive) return;
        setData(snapshot); setError("");
        const received = performance.now();
        const left = snapshot.round.deadline && snapshot.status === "active" ? Math.max(0, Date.parse(snapshot.round.deadline) - snapshot.serverNow - (received - before) / 2) : 0;
        if (timer) clearInterval(timer);
        const tick = () => setRemaining(Math.max(0, Math.ceil((left - (performance.now() - received)) / 1000)));
        tick(); timer = setInterval(tick, 1000);
      } catch (e) { if (alive) setError((e as Error).message); }
    }
    void refresh(); const poll = setInterval(refresh, 5000);
    return () => { alive = false; clearInterval(poll); if (timer) clearInterval(timer); };
  }, []);
  if (!data) return <div className="k-desk"><p role="status" className="k-banner k-banner-warn">{error || "Loading saved investigation…"}</p>{error && <a className="k-btn" href="/login">Sign in</a>}<div className="k-skeleton" aria-hidden="true" /></div>;

  const waiting = data.status === "waiting", closed = data.progress.completedAt !== null;
  const done = (i: number) => data.progress.chapters[i].completedAt !== null;
  const open = (i: number) => !waiting && data.unlocked[i];
  const urgent = data.status === "active" && remaining <= 300;
  const furthest = data.unlocked.reduce((n, u, i) => (u && data.progress.chapters[i].completedAt === null ? i : n), -1), here = furthest >= 0 ? furthest : Math.max(0, Math.min(4, data.current)), hereRaw = data.progress.chapters[here].score, hereNeed = data.unlockThresholds[here];
  const nextOpen = here < 4 && data.unlocked[here + 1];
  return <div className="k-desk">
    <header className="gd-head">
      <div><span className="k-eyebrow">OPERATION GHOST_404 · {data.name} · VARIANT {data.variant}</span><h1>Investigation dashboard</h1><p>{data.participants.join(" · ")}</p></div>
      <div className="gd-vitals">
        <div className="gd-clock"><small>Time left</small><b role="timer" aria-label="Round time remaining" className={urgent ? "is-urgent" : ""}>{data.status === "active" ? formatClock(remaining) : data.status.toUpperCase()}</b></div>
        <ScoreRing value={data.score} max={105} />
        <span className="k-sr">Saved score: {data.score} / 105</span>
      </div>
    </header>
    {error && <p role="alert" className="k-banner k-banner-warn">{error} <a href="/login">Sign in</a></p>}
    {closed && <CaseClosed teamId={data.id} teamName={data.name} progress={data.progress} />}
    {waiting && <PulseState eyebrow="ROUND 1 · STANDING BY" title="Awaiting organizer start"><p>Keep this page open. Chapters open the moment the round starts. Check your team name above and have your printed envelope ready for Chapter 3.</p></PulseState>}
    {!waiting && !closed && <section className="gd-next" aria-labelledby="next-h">
      <div><span className="k-eyebrow">Next action</span><h2 id="next-h">Chapter {here + 1} — {titles[here]}</h2>
        <p>{hereNeed !== undefined && !nextOpen ? `${hereRaw}/${hereNeed} points to unlock Chapter ${here + 2}.` : nextOpen ? `Chapter ${here + 2} is unlocked. Keep improving scores or move on.` : `${hereRaw}/${CHAPTERS[here].max} points saved.`}</p></div>
      <a className="k-btn k-btn-primary k-btn-lg" href={ROUTES[here]}>{hereRaw > 0 ? "Resume" : "Start"} Chapter {here + 1} →</a>
    </section>}

    <section aria-labelledby="map-heading">
      <div className="k-section-head"><h2 id="map-heading">Investigation map</h2><span className="gd-pts">{data.unlocked.filter(Boolean).length} / 5 open</span></div>
      <nav aria-label="Investigation chapters"><ol className="gd-map">{titles.map((title, i) => {
        const raw = data.progress.chapters[i].score, max = CHAPTERS[i].max, need = data.unlockThresholds[i], isOpen = open(i);
        const kind = done(i) ? "complete" : !isOpen ? "locked" : raw > 0 ? "progress" : "available";
        const label = { complete: "Complete", locked: waiting ? "Waiting" : "Locked", progress: "In progress", available: "Available" }[kind];
        const tasksDone = data.tasks[i].filter(t => t.earned >= t.max).length;
        return <li key={title} data-n={i + 1} className={`gd-stage ${isOpen || done(i) ? "is-open" : ""} ${done(i) ? "is-complete" : ""} ${i === here && !waiting && !closed ? "is-here" : ""}`} aria-current={i === here && !waiting && !closed ? "step" : undefined}>
          <span className="gd-node" aria-hidden="true">{done(i) ? "✓" : isOpen ? i + 1 : "🔒"}</span>
          <h3>{title}</h3><p className="gd-focus">{FOCUS[i]}</p>
          <StatusPill kind={kind}>{label}</StatusPill>
          <Meter value={raw} max={max} gate={need} label={`${raw} of ${max} points${need !== undefined ? `, unlock gate at ${need}` : ""}`} tone={done(i) ? "ok" : "accent"} />
          <span className="gd-pts"><b>{raw}</b> / {max} pts · {tasksDone}/{data.tasks[i].length} tasks</span>
          <span className="gd-gate">{i > 0 && !isOpen && !waiting ? `Needs ${data.unlockThresholds[i - 1]} pts in ${titles[i - 1]}` : need !== undefined && i < 4 ? (data.unlocked[i + 1] ? `${titles[i + 1]} unlocked` : `${Math.max(0, need - raw)} to unlock ${titles[i + 1]}`) : ""}</span>
          {isOpen && <a className={`k-btn ${i === here && !closed ? "k-btn-primary" : ""}`} href={ROUTES[i]}>Open Chapter {i + 1}</a>}
        </li>;
      })}</ol></nav>
    </section>
    <p className="k-note">Unlocked chapters stay open: improve any score until time runs out. Progress and drafts are saved on the server.</p>
  </div>;
}
