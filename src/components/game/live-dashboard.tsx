"use client";
import { useEffect, useState } from "react";
import { titles, type Progress } from "@/lib/game/engine";
import { EvidencePanel } from "./evidence-panel";
import { CaseClosed } from "./case-closed";

type Snapshot = { id: string; name: string; variant: string; participants: string[]; progress: Progress; score: number; hints: number; current: number; status: string; serverNow: number; round: { deadline: string | null } };
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
        const left = snapshot.round.deadline && snapshot.status === "active" ? Math.max(0, Date.parse(snapshot.round.deadline) - snapshot.serverNow - (received - before)/2) : 0;
        if (timer) clearInterval(timer);
        const tick = () => setRemaining(Math.max(0, Math.ceil((left - (performance.now() - received))/1000)));
        tick(); timer = setInterval(tick, 1000);
      } catch (e) { if (alive) setError((e as Error).message); }
    }
    void refresh(); const poll = setInterval(refresh, 5000);
    return () => { alive = false; clearInterval(poll); if (timer) clearInterval(timer); };
  }, []);
  if (!data) return <p role="status">{error || "Loading saved investigation…"}</p>;
  return <><div className="dashboard-title"><div><span className="eyebrow">{data.name} / VARIANT {data.variant}</span><h1>Investigation dashboard</h1><p>{data.participants.join(" · ")}</p></div><div role="timer" aria-label="Round time remaining">{data.status === "active" ? `${Math.floor(remaining/60).toString().padStart(2,"0")}:${(remaining%60).toString().padStart(2,"0")}` : data.status.toUpperCase()}</div></div>{error && <p role="alert">{error} <a href="/login">Sign in</a></p>}{data.current === -1 && <CaseClosed teamId={data.id} teamName={data.name} progress={data.progress} />}<div className="dashboard-grid"><aside className="panel"><div className="panel-heading"><h2>Case progression</h2><span>{data.current === -1 ? 5 : data.current} / 5</span></div><nav aria-label="Investigation chapters">{titles.map((title,i) => <div className="chapter-row" key={title}><span className="chapter-number">0{i+1}</span><span className="chapter-name"><strong>{i <= 4 && data.status !== "waiting" && (i === 0 || data.progress.chapters[i - 1].completedAt !== null) ? <a href={i === 0 ? "/play/inbox" : i === 1 ? "/play/trail" : i === 2 ? "/play/insider" : i === 3 ? "/play/containment" : "/play/verdict"}>{title}</a> : title}</strong><small>{data.progress.chapters[i].completedAt !== null ? "Completed" : i === data.current && data.status !== "waiting" ? i <= 4 ? "Current · investigation open" : "Current · content pending" : "Locked"}</small></span></div>)}</nav></aside><EvidencePanel inboxOpen={data.status !== "waiting"} trailOpen={data.status !== "waiting" && data.progress.chapters[0].completedAt !== null} verdictOpen={data.status !== "waiting" && data.progress.chapters[3].completedAt !== null} containmentOpen={data.status !== "waiting" && data.progress.chapters[2].completedAt !== null} insiderOpen={data.status !== "waiting" && data.progress.chapters[1].completedAt !== null} /><aside className="panel briefing-panel"><h2>{titles[data.current] || "Investigation completed"}</h2><p>Saved score: {data.score} / 105<br />Hints used: {data.hints}</p><p>Submission status: {data.status === "waiting" ? "Awaiting organizer start" : data.current === -1 ? "Complete" : data.current === 0 ? "Investigate The Inbox" : data.current === 1 ? "Investigate Trail" : data.current === 2 ? "Investigate Insider" : data.current === 3 ? "Investigate Containment" : data.current === 4 ? "Review Final Verdict" : `${titles[data.current]} unlocked · content pending`}</p><p>All five Round 1 chapters are playable in sequence. Completion is saved; qualification requires organizer review after the round. Your session, timer and progress are saved on the server.</p></aside></div></>;
}
