"use client";
import { useEffect, useState } from "react";
import { titles, type Progress } from "@/lib/game/engine";
import { CaseClosed } from "./case-closed";
import { Badge, CHAPTERS, formatClock } from "@/components/ui/kit";

type Snapshot = { id: string; name: string; variant: string; participants: string[]; progress: Progress; score: number; hints: number; current: number; unlocked: boolean[]; unlockThresholds: number[]; tasks: { id: string; earned: number; max: number }[][]; status: string; serverNow: number; round: { deadline: string | null } };
const ROUTES = ["/play/inbox", "/play/trail", "/play/insider", "/play/containment", "/play/verdict"];
const FOCUS = ["Find the breach email and prove it", "Reconstruct the stolen session", "Unlock the Evidence Wall, name the insider", "Order the incident and plan the response", "Link the evidence and close the case"];
const BLURB = ["Six recovered messages. One initial compromise. Correlate the emails, QR capture and records.", "Follow the identity-provider events from session issuance to the unauthorized export.", "Collect your envelope and wall fragments, then find who deliberately weakened the controls.", "Reconstruct the incident, preserve evidence and build a scoped simulated response plan.", "Synthesize all four investigations, test competing explanations and close the case."];

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
  return <div className="k-desk">
    <header className="k-mission">
      <div className="k-mission-main">
        <div><span className="k-eyebrow">{data.name} / VARIANT {data.variant}</span><h1>Investigation dashboard</h1><p className="k-objective">{data.participants.join(" · ")}</p></div>
        <dl className="k-stats">
          <div><dt>Time left</dt><dd role="timer" aria-label="Round time remaining" className={urgent ? "is-urgent" : ""}>{data.status === "active" ? formatClock(remaining) : data.status.toUpperCase()}</dd></div>
          <div><dt>Total</dt><dd><strong>Saved score: {data.score} / 105</strong></dd></div>
          <div><dt>Hints used</dt><dd>{data.hints}</dd></div>
        </dl>
      </div>
    </header>
    {error && <p role="alert" className="k-banner k-banner-warn">{error} <a href="/login">Sign in</a></p>}
    {closed && <CaseClosed teamId={data.id} teamName={data.name} progress={data.progress} />}
    {waiting && <section className="k-banner k-banner-warn k-waiting" aria-labelledby="waiting-heading"><div><span className="k-eyebrow">ROUND 1</span><h2 id="waiting-heading">Awaiting organizer start</h2><p>The clock has not started. Keep this page open; chapters unlock the moment your organizer begins the round.</p></div><ul><li>All three teammates can sign in on separate devices.</li><li>Check you can see your team name and members above.</li><li>Have your printed envelope ready for Chapter 3.</li></ul></section>}

    <section aria-labelledby="map-heading">
      <div className="k-section-head"><h2 id="map-heading">Case progression</h2><Badge tone={closed ? "ok" : "neutral"}>{data.unlocked.filter(Boolean).length} / 5 open</Badge></div>
      <nav aria-label="Investigation chapters"><ol className="k-map">{titles.map((title, i) => {
        const pts = data.progress.chapters[i].score, state = done(i) ? "done" : open(i) ? "current" : "locked", tasksDone = data.tasks[i].filter(t => t.earned >= t.max).length;
        return <li key={title} className={`k-map-card is-${state}`} aria-current={state === "current" ? "step" : undefined}>
          <div className="k-map-top"><span className="k-map-n k-mono">0{i + 1}</span><Badge tone={state === "done" ? "ok" : state === "current" ? "amber" : "neutral"}>{state === "done" ? "Completed" : state === "current" ? (pts > 0 ? "In progress" : "Available") : waiting ? "Waiting" : "Locked"}</Badge></div>
          <h3>{title}</h3><p className="k-map-focus">{FOCUS[i]}</p>
          <p className="k-map-blurb">{state === "locked" ? (waiting ? "Opens when the round starts." : `Earn ${data.unlockThresholds[i - 1]} points in ${titles[i - 1]} to unlock.`) : BLURB[i]}</p>
          <div className="k-map-foot"><span className="k-mono">{pts} / {CHAPTERS[i].max} pts · {tasksDone}/{data.tasks[i].length} tasks</span>{open(i) && <a className={`k-btn ${state === "current" ? "k-btn-primary" : ""}`} href={ROUTES[i]}>Open Chapter {i + 1}</a>}</div>
        </li>;
      })}</ol></nav>
    </section>
    <p className="k-note">Unlocked chapters stay open: improve any score until time runs out. Progress, drafts and the timer are saved on the server.</p>
  </div>;
}
