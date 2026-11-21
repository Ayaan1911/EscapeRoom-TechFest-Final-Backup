"use client";
import { useEffect, useMemo, useState } from "react";
import { UnitView } from "./unit-view";
import { CooldownProvider } from "./cooldown";
import { FinishedPanel, WaitingRoom } from "./states";
import { DraftProvider, NOTES, useDrafts } from "./use-draft-store";
import { useRound2 } from "./use-round2";
import { EVENT_TEXT, formatClock, msUntil } from "@/lib/round2/client-clock";
import { INCIDENT_RELEASE_MS } from "@/lib/round2/clock";
import { getAt, type Field } from "@/lib/round2/form-types";
import type { ServerDraft, StatusPayload, SubmitOutcome } from "./types";

type NavState = "not released" | "available" | "in progress" | "partially scored" | "completed" | "closed";
const NOTES_FIELDS: Field[] = [{ kind: "text", path: ["text"], label: "Team notes", max: 900, optional: true }];
const PHASE_TEXT = { not_started: "Waiting for start", part_a: "Part A · Live Response", part_b: "Part B · Digital Tribunal", finished: "Round complete" } as const;

function Notes({ editable }: { editable: boolean }) {
  const store = useDrafts(), e = store.entry(NOTES);
  return <details className="r2-notes"><summary>Team notes <span className="r2-chip">private · shared by teammates</span></summary>
    <label><span className="r2-sr">Notes</span><textarea rows={5} maxLength={900} disabled={!editable} value={(getAt(e.working, ["text"]) as string | undefined) ?? ""} onChange={ev => store.edit(NOTES, NOTES_FIELDS, ["text"], ev.target.value, editable)} /></label>
    <small className="r2-meta" role="status">{e.status === "saved" ? "Saved" : e.status === "conflict" ? "Conflict: a teammate edited these notes" : e.status === "idle" ? "" : e.status === "dirty" || e.status === "saving" ? "Saving…" : "Not saved"}</small></details>;
}

function Inner({ teamName, initial }: { teamName: string; initial: StatusPayload }) {
  const { status, bundle, connection, now, tick, refresh, applyScore, announce, clearAnnounce } = useRound2(initial);
  const store = useDrafts();
  const clock = status.clock, nowMs = now();
  const [picked, setPicked] = useState<string | null>(null);
  void tick;
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (store.anyUnsaved()) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [store]);

  const startMs = clock.startsAt ? Date.parse(clock.startsAt) : null;
  const releaseAt = (part: "A" | "B", unit: number) => startMs === null ? null : new Date(startMs + (part === "A" ? INCIDENT_RELEASE_MS[unit - 1] : 25 * 60_000)).toISOString();
  const navItems = useMemo(() => (["A", "B"] as const).flatMap(part => status.units[part].map(u => {
    const key = `${part}${u.unit}`, tasks = status.tasks.filter(t => t.part === part && t.unit === u.unit), earned = tasks.reduce((n, t) => n + t.earned, 0);
    const closed = part === "A" ? clock.phase === "part_b" || clock.phase === "finished" : clock.phase === "finished";
    const touched = tasks.some(t => Object.keys(store.entry(t.id).working).length > 0);
    const st: NavState = !u.released ? "not released" : earned >= u.max ? "completed" : closed ? "closed" : earned > 0 ? "partially scored" : touched ? "in progress" : "available";
    return { key, part, unit: u.unit, title: u.title, earned, max: u.max, state: st };
  })), [status, clock.phase, store]);
  const current = picked && navItems.find(n => n.key === picked) ? picked : navItems.filter(n => n.state !== "not released" && (clock.phase === "part_b" ? n.part === "B" : n.part === "A")).slice(-1)[0]?.key ?? "A1";
  const item = navItems.find(n => n.key === current)!, unit = bundle?.units.find(u => `${u.part}${u.unit}` === current);
  async function choose(key: string) { await store.flush(); setPicked(key); }

  const next = clock.nextEvent, toNext = next ? msUntil(next.at, nowMs) : null;
  const clockLabel = clock.phase === "part_a" ? "Part A closes in" : clock.phase === "part_b" ? "Round ends in" : "";
  const target = clock.phase === "part_a" ? msUntil(clock.partAClosesAt, nowMs) : clock.phase === "part_b" ? msUntil(clock.endsAt, nowMs) : null;
  const locked = (clock.phase === "part_a" && target !== null && target <= 0);

  if (clock.phase === "not_started") return <div className="r2-wrap"><TopBar teamName={teamName} status={status} label="" value="" connection={connection} /><WaitingRoom teamName={teamName} /></div>;
  return <div className="r2-wrap">
    <TopBar teamName={teamName} status={status} label={clockLabel} value={formatClock(target)} connection={connection} />
    <p className="r2-sr" role="status" aria-live="polite">{announce}</p>
    {announce && <p className="r2-banner" role="presentation">{announce} <button type="button" className="k-btn k-btn-sm" onClick={clearAnnounce}>Dismiss</button></p>}
    {connection === "offline" && <p className="r2-banner is-warn" role="alert">Connection to the server lost. Times shown are estimates; nothing is submitted or saved until the connection returns. Retrying automatically.</p>}
    {connection === "unauthorized" && <p className="r2-banner is-error" role="alert">Your session ended. <a href="/login?next=/round2">Sign in again</a>: your saved drafts are kept on the server.</p>}
    <div className="r2-layout">
      <nav className="r2-nav" aria-label="Incidents and challenges">
        {(["A", "B"] as const).map(part => <div key={part}><h2>{part === "A" ? "PART A · LIVE RESPONSE" : "PART B · DIGITAL TRIBUNAL"}</h2>
          <ol>{navItems.filter(n => n.part === part).map(n => { const at = releaseAt(n.part, n.unit), eta = n.state === "not released" ? msUntil(at, nowMs) : null;
            return <li key={n.key} className={`is-${n.state.replace(" ", "-")} ${n.key === current ? "is-here" : ""}`}>
              <button type="button" className="r2-navbtn" aria-current={n.key === current ? "page" : undefined} disabled={n.state === "not released"} onClick={() => void choose(n.key)}>
                <span className="r2-navn" aria-hidden="true">{n.state === "completed" ? "✓" : n.state === "not released" ? "🔒" : n.unit}</span>
                <span className="r2-navt"><strong>{part === "A" ? `Incident ${n.unit}` : `Challenge ${n.unit}`} · {n.title}</strong><small>{n.state === "not released" ? `Releases ${eta !== null ? `in ${formatClock(eta)}` : "after start"}` : n.state}</small></span>
                <span className="r2-navp"><b>{n.earned}</b>/{n.max}</span></button></li>; })}</ol></div>)}
        <div className="r2-schedule"><h2>NEXT</h2><p>{next ? <>{EVENT_TEXT[next.event] ?? next.event} in <b className="r2-mono">{formatClock(toNext)}</b></> : "No further scheduled events."}</p></div>
        <Notes editable={clock.phase === "part_a" || clock.phase === "part_b"} />
      </nav>
      <main className="r2-main" id="main">
        {clock.phase === "finished" && <FinishedPanel status={status} teamName={teamName} />}
        {locked && <p className="r2-banner is-warn" role="status">Part A is closing. Submissions are disabled; the server makes the final call.</p>}
        {item.state === "not released" ? <section className="r2-state"><h2>{item.title}</h2><p>Not released yet.</p></section>
          : unit && bundle ? <UnitView key={current} unit={unit} bundle={bundle} status={status} clock={clock} now={nowMs} onScored={(id: string, o: SubmitOutcome) => { applyScore(id, o.task.earned, o.score); void refresh(); }} onNeedRefresh={() => void refresh()} />
          : <section className="r2-state" role="status"><p>Loading released evidence…</p></section>}
      </main>
    </div></div>;
}
function TopBar({ teamName, status, label, value, connection }: { teamName: string; status: StatusPayload; label: string; value: string; connection: string }) {
  const s = status.score, c = status.clock;
  return <header className="r2-top"><div className="r2-brand"><span className="r2-eyebrow">OPERATION GHOST_404</span><strong>GHOST RETURNS</strong></div>
    <div className="r2-team"><span className="r2-meta">Team</span><b>{teamName}</b></div>
    <div className="r2-phase"><span className={`r2-chip is-${c.phase}`}>{PHASE_TEXT[c.phase]}</span>{connection === "offline" && <span className="r2-chip is-warn">offline</span>}</div>
    {label && <div className="r2-timer" role="timer" aria-label={`${label} ${value}`}><span className="r2-meta">{label}</span><b className="r2-mono">{value}</b></div>}
    <div className="r2-score" aria-label={`Score ${s.total} of ${s.max}`}><b>{s.total}</b><span>/{s.max}</span><small>A {s.partA}/{s.partAMax} · B {s.partB}/{s.partBMax}</small></div></header>;
}

export function Round2Shell({ teamName, initialStatus, initialDrafts }: { teamName: string; initialStatus: StatusPayload; initialDrafts: ServerDraft[] }) {
  return <CooldownProvider><DraftProvider initial={initialDrafts}><Inner teamName={teamName} initial={initialStatus} /></DraftProvider></CooldownProvider>;
}
