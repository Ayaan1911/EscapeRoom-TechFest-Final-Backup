"use client";
// Read-only projector view. Polls the organizer-only endpoint every 12 s while the tab is visible; nothing here can change game state.
import { useEffect, useState } from "react";
import { formatClock } from "@/components/ui/kit";
import type { ProjectorPayload } from "@/lib/game/projector.server";

const POLL_MS = 12_000, ROW = 64, MAX_ROWS = 24;
export function ProjectorBoard() {
  const [data, setData] = useState<ProjectorPayload | null>(null), [error, setError] = useState(""), [left, setLeft] = useState(0);
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setInterval> | undefined;
    async function load() {
      try {
        const t0 = performance.now(), res = await fetch("/api/admin/projector", { cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 401 ? "Organizer session expired. Sign in again." : "Connection interrupted. Retrying.");
        const body: ProjectorPayload = await res.json(); if (!alive) return;
        setData(body); setError("");
        const base = body.deadline && body.status === "active" ? Date.parse(body.deadline) - body.serverNow - (performance.now() - t0) / 2 : 0, got = performance.now();
        if (timer) clearInterval(timer);
        const tick = () => setLeft(Math.max(0, Math.ceil((base - (performance.now() - got)) / 1000))); tick(); timer = setInterval(tick, 1000);
      } catch (e) { if (alive) setError((e as Error).message); }
    }
    void load(); const poll = setInterval(() => { if (document.visibilityState !== "hidden") void load(); }, POLL_MS);
    return () => { alive = false; clearInterval(poll); if (timer) clearInterval(timer); };
  }, []);
  const shown = (data?.teams ?? []).slice(0, MAX_ROWS), more = (data?.teams.length ?? 0) - shown.length;
  return <div className="pj-wrap">
    <header className="pj-head"><div><span className="k-eyebrow">OPERATION GHOST_404 · ROUND 1</span><h1>Live leaderboard</h1></div>
      <div className="pj-clock" role="timer" aria-label="Round time remaining">{data?.status === "active" ? formatClock(left) : (data?.status ?? "…").toUpperCase()}</div></header>
    {error && <p role="alert" className="k-banner k-banner-warn">{error} <a href="/organizer/login">Organizer sign in</a></p>}
    {data && data.status === "waiting" && <p className="pj-note">Round 1 has not started.</p>}
    {data && data.teams.length === 0 && <p className="pj-note">No teams registered.</p>}
    <ol className="pj-list" style={{ height: shown.length * ROW }} aria-label="Team standings">
      {shown.map((t, i) => <li key={t.id} className={`pj-row ${t.rank <= 3 ? `is-top${t.rank}` : ""}`} style={{ top: i * ROW, height: ROW - 8 }}>
        <span className="pj-rank">{t.tied ? "=" : ""}{t.rank}</span><span className="pj-name">{t.name}</span>
        <span className="pj-prog" role="img" aria-label={`${t.chaptersDone} of 5 chapters complete`}>{Array.from({ length: 5 }, (_, k) => <i key={k} className={k < t.chaptersDone ? "on" : ""} />)}</span>
        <span className="pj-score"><b>{t.score}</b><small>/ 105</small></span></li>)}
    </ol>
    {more > 0 && <p className="pj-note">+ {more} more teams</p>}
    <footer className="pj-foot"><span>Saved scores only · refreshes every {POLL_MS / 1000} s</span><a className="k-btn k-btn-ghost" href="/admin">Back to organizer dashboard</a></footer>
  </div>;
}
