"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { adminGet, adminPost, ApiError } from "./api";
import { formatClock } from "@/lib/round2/client-clock";

type Qual = { digest: string; confirmedAt: string; top10: { id: string; name?: string }[]; standby: { id: string; name?: string }[]; enrolled: { teamId: string; status: string; seed: number; snapshotDigest: string }[] };
type Ready = { ready: boolean; checks: { id: string; ok: boolean; blocking: boolean; message: string }[]; active: number; standby: number; withdrawn: number; phase: string };
type Timing = { phase: string; serverNow: string; startsAt: string | null; endedAt: string | null; elapsedMs: number; schedule: { incidentReleases: { incident: number; at: string }[]; partAClosesAt: string; partBOpensAt: string; endsAt: string } | null; nextEvent: { event: string; at: string; inMs: number } | null; resultsPublishedAt: string | null };
type Score = { teamId: string; name: string; status: string; partA: number; partB: number; total: number; tasks: { id: string; earned: number }[]; submissions: number; lastSubmissionAt: string | null };
type Audit = { events: { id: string; actor: string; action: string; detail: string; createdAt: string }[]; submissions: { id: string; teamId: string; taskId: string; awarded: number; taskEarned: number; createdAt: string }[] };
type Results = { max: { total: number }; rules: string; ranked: { teamId: string; name: string; rank: number; tie: boolean; partA: number; partB: number; total: number; partAMs: number | null }[]; withdrawn: { teamId: string; name: string; partA: number; partB: number }[]; tiesNeedAdjudication: boolean; published: boolean; publishedAt: string | null };
type Solution = { id: string; part: string; title: string; explanation: string | null };
type Msg = { tone: "ok" | "error"; text: string } | null;
const utc = (s: string | null) => s ? new Date(s).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—";
const errText = (e: unknown) => e instanceof ApiError ? (e.status === 401 ? "Organizer session expired. Sign in again." : e.message) : "Unexpected error";

/** High-impact action behind a native <dialog>. Nothing is sent until the operator confirms; the real server response is shown. */
function ConfirmButton({ label, title, children, word, danger, disabled, onConfirm }: { label: string; title: string; children: ReactNode; word?: string; danger?: boolean; disabled?: boolean; onConfirm: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null), [typed, setTyped] = useState(""), [busy, setBusy] = useState(false);
  const ok = !word || typed.trim() === word;
  return <>
    <button type="button" className={`k-btn ${danger ? "k-btn-danger" : "k-btn-primary"}`} disabled={disabled} onClick={() => { setTyped(""); ref.current?.showModal(); }}>{label}</button>
    <dialog ref={ref} className={`r2a-dialog ${danger ? "is-danger" : ""}`} aria-labelledby="r2a-t"><h2 id="r2a-t">{title}</h2><div>{children}</div>
      {word && <label className="r2a-form">Type <b className="r2-mono">{word}</b> to confirm<input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" spellCheck={false} /></label>}
      <div className="r2-actions" style={{ marginTop: 16 }}><button type="button" className="k-btn" autoFocus onClick={() => ref.current?.close()}>Cancel</button>
        <button type="button" className={`k-btn ${danger ? "k-btn-danger" : "k-btn-primary"}`} disabled={!ok || busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); ref.current?.close(); } }}>{busy ? "Working…" : label}</button></div></dialog></>;
}

export function Round2Admin() {
  const [qual, setQual] = useState<Qual | null>(null), [qualErr, setQualErr] = useState(""), [ready, setReady] = useState<Ready | null>(null), [timing, setTiming] = useState<Timing | null>(null);
  const [scores, setScores] = useState<Score[]>([]), [audit, setAudit] = useState<Audit | null>(null), [results, setResults] = useState<Results | null>(null), [resultsErr, setResultsErr] = useState("");
  const [solutions, setSolutions] = useState<Solution[] | null>(null), [msg, setMsg] = useState<Msg>(null), [auto, setAuto] = useState(true), [offset, setOffset] = useState(0), [wall, setWall] = useState(() => Date.now());
  const [standby, setStandby] = useState(""), [replaces, setReplaces] = useState(""), [reason, setReason] = useState(""), [endReason, setEndReason] = useState("");

  // READ-ONLY refresh: only GETs. No administrative mutation can ever be triggered from here.
  const load = useCallback(async (full: boolean) => {
    const t0 = Date.now();
    const [r, t, s] = await Promise.allSettled([adminGet<Ready>("readiness"), adminGet<Timing>("timing"), adminGet<Score[]>("scores")]);
    if (r.status === "fulfilled") setReady(r.value); if (s.status === "fulfilled") setScores(s.value);
    if (t.status === "fulfilled") { setTiming(t.value); setOffset(Date.parse(t.value.serverNow) - Math.round((t0 + Date.now()) / 2)); }
    const failed = [r, t, s].find(x => x.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) setMsg({ tone: "error", text: errText(failed.reason) });
    if (full) {
      adminGet<Qual>("qualification").then(q => { setQual(q); setQualErr(""); }).catch(e => setQualErr(errText(e)));
      adminGet<Audit>("audit").then(setAudit).catch(() => undefined);
      adminGet<Results>("results").then(x => { setResults(x); setResultsErr(""); }).catch(e => { setResults(null); setResultsErr(errText(e)); });
    }
  }, []);
  useEffect(() => { const id = setTimeout(() => void load(true), 0); return () => clearTimeout(id); }, [load]);
  useEffect(() => { const id = setInterval(() => setWall(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!auto) return; const id = setInterval(() => { if (document.visibilityState === "visible") void load(false); }, 15_000); return () => clearInterval(id); }, [auto, load]);

  async function act(body: Record<string, unknown>, okText: (r: Record<string, unknown>) => string) {
    try { const r = await adminPost<Record<string, unknown>>(body); setMsg({ tone: "ok", text: okText(r) }); }
    catch (e) { setMsg({ tone: "error", text: errText(e) }); }
    await load(true);
  }
  const nowMs = wall + offset, running = timing?.phase === "part_a" || timing?.phase === "part_b", finished = timing?.phase === "finished";
  const active = qual?.enrolled.filter(e => e.status === "active") ?? [], standbys = qual?.enrolled.filter(e => e.status === "standby") ?? [];
  const nameOf = (id: string) => qual?.top10.concat(qual.standby).find(t => t.id === id)?.name ?? id;
  const remaining = timing?.schedule ? Date.parse(timing.endedAt ?? timing.schedule.endsAt) - nowMs : null;

  return <div className="k-desk r2a">
    <header className="k-mission"><div className="k-mission-main"><div><span className="k-eyebrow">ORGANIZER · ROUND 2</span><h1>GHOST RETURNS control room</h1><p className="k-objective">Nothing here runs by itself: every start, end, enrollment, promotion and publication needs your explicit confirmation.</p></div></div></header>
    {msg && <p className={`r2a-msg is-${msg.tone}`} role={msg.tone === "error" ? "alert" : "status"}>{msg.text} <button type="button" className="k-btn k-btn-sm" onClick={() => setMsg(null)}>Dismiss</button></p>}
    <div className="r2-actions"><button type="button" className="k-btn" onClick={() => void load(true)}>Refresh now</button><label className="r2-check"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Auto-refresh scores and clock every 15 s (read-only)</label><a className="k-btn" href="/admin">Back to Round 1 operations</a></div>

    <div className="r2a-grid">
      <section className="r2a-card" aria-labelledby="q-h"><h2 id="q-h">A · Confirmed qualification</h2>
        {qualErr ? <p className="r2a-msg is-error" role="alert">{qualErr}</p> : !qual ? <p>Loading…</p> : <>
          <p className="r2-meta">Snapshot <b className="r2-mono">{qual.digest.slice(0, 16)}</b> confirmed {utc(qual.confirmedAt)}. The finalist list comes only from this record.</p>
          <h3>Top ten</h3><ol className="r2a-list">{qual.top10.map(t => <li key={t.id}><b className="r2-mono">{t.id}</b> {t.name}</li>)}</ol>
          <h3>Standby</h3><ol className="r2a-list">{qual.standby.map(t => <li key={t.id}><b className="r2-mono">{t.id}</b> {t.name}</li>)}{!qual.standby.length && <li className="r2-faint">none</li>}</ol></>}</section>

      <section className="r2a-card" aria-labelledby="e-h"><h2 id="e-h">B · Enrollment</h2>
        <p>{qual ? `${active.length} active, ${standbys.length} standby enrolled.` : "—"}</p>
        <ConfirmButton label="Enroll finalists" title="Enroll finalists from the confirmed snapshot?" disabled={!qual || !!timing?.startsAt || (qual?.enrolled.length ?? 0) > 0} onConfirm={() => act({ action: "enroll" }, r => `Enrolled ${String(r.enrolled)} teams${r.unchanged ? " (unchanged)" : ""}.`)}>
          <p>This creates the Round 2 roster (up to 10 active, 2 standby) from the confirmed Round 1 snapshot. It does not change Round 1 data or carry over scores.</p></ConfirmButton>
        <form className="r2a-form" onSubmit={e => e.preventDefault()} aria-label="Promote a standby team"><h3>Promote a standby team</h3>
          <label>Standby team<select value={standby} onChange={e => setStandby(e.target.value)}><option value="">Choose…</option>{standbys.map(s => <option key={s.teamId} value={s.teamId}>{s.teamId} · {nameOf(s.teamId)}</option>)}</select></label>
          <label>Replaces (required while 10 are active)<select value={replaces} onChange={e => setReplaces(e.target.value)}><option value="">No replacement</option>{active.map(s => <option key={s.teamId} value={s.teamId}>{s.teamId} · {nameOf(s.teamId)}</option>)}</select></label>
          <label>Reason (5–500 characters, audited)<textarea rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
          <ConfirmButton label="Promote standby" title="Promote this standby team?" disabled={!standby || reason.trim().length < 5} onConfirm={() => act({ action: "promote", standbyTeamId: standby, ...(replaces ? { replacesTeamId: replaces } : {}), reason: reason.trim() }, r => `Promoted ${String(r.promoted)}${r.replaced ? `, replaced ${String(r.replaced)}` : ""}.`)}>
            <p>Promoting {standby || "…"}{replaces ? ` and withdrawing ${replaces}` : ""}. After the round starts, only a team with no submissions can be replaced. Reason: <i>{reason}</i></p></ConfirmButton></form></section>

      <section className="r2a-card" aria-labelledby="r-h"><h2 id="r-h">C · Readiness</h2>
        {ready ? <><p className={ready.ready ? "r2a-ok" : "r2a-bad"}><b>{ready.ready ? "Ready to start" : "Not ready: blockers below"}</b></p>
          <ul className="r2a-list">{ready.checks.map(c => <li key={c.id}><span className={c.ok ? "r2a-ok" : c.blocking ? "r2a-bad" : "r2a-warn"} aria-hidden="true">{c.ok ? "✓" : c.blocking ? "✕" : "!"}</span><span><span className="r2-sr">{c.ok ? "Pass" : c.blocking ? "Blocker" : "Warning"}: </span>{c.message}</span></li>)}</ul></> : <p>Loading…</p>}</section>

      <section className="r2a-card" aria-labelledby="l-h"><h2 id="l-h">D · Live round control</h2>
        <p>Phase <b className="r2-chip">{timing?.phase ?? "…"}</b> {timing?.startsAt && <>started {utc(timing.startsAt)}</>}</p>
        {running && remaining !== null && <p>Remaining <b className="r2-mono">{formatClock(remaining)}</b>{timing?.nextEvent && <> · next: <span className="r2-mono">{timing.nextEvent.event}</span> in {formatClock(Date.parse(timing.nextEvent.at) - nowMs)}</>}</p>}
        {timing?.schedule && <table className="r2-table"><caption className="r2-sr">Schedule</caption><thead><tr><th scope="col">Event</th><th scope="col">Time</th><th scope="col">State</th></tr></thead><tbody>
          {timing.schedule.incidentReleases.map(i => <tr key={i.incident}><th scope="row">Incident {i.incident} release</th><td className="r2-mono">{utc(i.at)}</td><td>{Date.parse(i.at) <= nowMs ? "released" : "pending"}</td></tr>)}
          <tr><th scope="row">Part A closes / Part B opens</th><td className="r2-mono">{utc(timing.schedule.partAClosesAt)}</td><td>{Date.parse(timing.schedule.partAClosesAt) <= nowMs ? "done" : "pending"}</td></tr>
          <tr><th scope="row">Round ends</th><td className="r2-mono">{utc(timing.endedAt ?? timing.schedule.endsAt)}</td><td>{finished ? "ended" : "pending"}</td></tr></tbody></table>}
        <div className="r2-actions"><ConfirmButton label="Start Round 2" title="Start the real 50-minute clock?" disabled={!ready?.ready} onConfirm={() => act({ action: "start" }, r => `Round 2 started at ${utc(String(r.startsAt))}.`)}>
          <p><b>This starts the real clock for every active finalist right now.</b> Incident 1 is released immediately, the others at 06:00, 12:00 and 18:00, Part B at 25:00, and the round ends at 50:00. It cannot be restarted or paused.</p></ConfirmButton>
          <label className="r2a-form"><span className="r2-sr">Reason for ending</span><input placeholder="Reason for emergency end" maxLength={500} value={endReason} onChange={e => setEndReason(e.target.value)} /></label>
          <ConfirmButton label="Emergency end" danger word="END" title="End Round 2 now?" disabled={!running || endReason.trim().length < 5} onConfirm={() => act({ action: "end", reason: endReason.trim() }, () => "Round 2 ended.")}><p>All submissions close immediately for every team. This cannot be undone. Reason: <i>{endReason}</i></p></ConfirmButton></div></section>

      <section className="r2a-card is-wide" aria-labelledby="s-h"><h2 id="s-h">E · Score review <span className="r2-count">private · {scores.length} teams</span></h2>
        <div className="r2-tablewrap"><table className="r2-table"><thead><tr><th scope="col">Team</th><th scope="col">Status</th><th scope="col">Part A</th><th scope="col">Part B</th><th scope="col">Total</th><th scope="col">Submissions</th><th scope="col">Last</th><th scope="col">Tasks earned</th></tr></thead>
          <tbody>{scores.map(s => <tr key={s.teamId}><th scope="row">{s.name} <small className="r2-mono">{s.teamId}</small></th><td>{s.status}</td><td>{s.partA}/60</td><td>{s.partB}/40</td><td><b>{s.total}</b></td><td>{s.submissions}</td><td className="r2-mono">{utc(s.lastSubmissionAt)}</td>
            <td><details><summary>{s.tasks.filter(t => t.earned > 0).length}/26 tasks</summary><p className="r2-mono">{s.tasks.map(t => `${t.id}:${t.earned}`).join("  ")}</p></details></td></tr>)}</tbody></table></div></section>

      <section className="r2a-card is-wide" aria-labelledby="res-h"><h2 id="res-h">G · Results review</h2>
        {results ? <>
          <p className="r2-meta">{results.rules}</p>
          {results.tiesNeedAdjudication && <p className="r2a-msg is-error" role="alert">Unresolved ties: ranks marked TIE are equal on every rule. No winner is declared for tied teams; adjudicate manually.</p>}
          <div className="r2-tablewrap"><table className="r2-table"><thead><tr><th scope="col">Rank</th><th scope="col">Team</th><th scope="col">Part A</th><th scope="col">Part B</th><th scope="col">Total</th><th scope="col">Part A completion</th></tr></thead>
            <tbody>{results.ranked.map(r => <tr key={r.teamId}><td>{r.rank}{r.tie && <b className="r2a-bad"> TIE</b>}</td><th scope="row">{r.name}</th><td>{r.partA}</td><td>{r.partB}</td><td><b>{r.total}</b>/{results.max.total}</td><td className="r2-mono">{r.partAMs === null ? "no Part A points" : formatClock(r.partAMs)}</td></tr>)}</tbody></table></div>
          {!!results.withdrawn.length && <p className="r2-meta">Withdrawn (not ranked): {results.withdrawn.map(w => `${w.name} ${w.partA + w.partB}`).join(", ")}</p>}
          <div className="r2-actions"><a className="k-btn" href="/api/round2/admin?view=results-csv">Export CSV</a>
            {results.published ? <span className="r2a-ok">Published {utc(results.publishedAt)}</span> : <ConfirmButton label="Publish results" danger word="PUBLISH" title="Publish Round 2 results to all finalists?" onConfirm={() => act({ action: "publish" }, () => "Results published.")}>
              <p><b>Publication is irreversible.</b> Every finalist will see the full ranking (rank, team, Part A, Part B, total). Tied teams are shown as tied. Confirm that ties and scores have been reviewed.</p></ConfirmButton>}</div></>
          : <p className={resultsErr ? "r2-meta" : ""}>{resultsErr || "Loading…"} Results can be reviewed once the round has finished. Nothing is visible to teams until you publish.</p>}</section>

      <section className="r2a-card is-wide" aria-labelledby="a-h"><h2 id="a-h">F · Audit trail</h2>
        {audit ? <><div className="r2-tablewrap"><table className="r2-table"><thead><tr><th scope="col">Time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Detail</th></tr></thead><tbody>{audit.events.map(e => <tr key={e.id}><td className="r2-mono">{utc(e.createdAt)}</td><td>{e.actor}</td><td>{e.action}</td><td className="r2-mono" style={{ overflowWrap: "anywhere" }}>{e.detail}</td></tr>)}{!audit.events.length && <tr><td colSpan={4}>No organizer actions yet.</td></tr>}</tbody></table></div>
          <details><summary>Recent scored submissions ({audit.submissions.length})</summary><p className="r2-mono">{audit.submissions.map(s => `${utc(s.createdAt).slice(11, 19)} ${s.teamId} ${s.taskId} +${s.awarded} (${s.taskEarned})`).join("\n")}</p></details></> : <p>Loading…</p>}</section>

      <section className="r2a-card is-wide"><h2>Organizer solutions</h2><p className="r2-meta">Answer-key explanations. Load only on a private screen; never shown to teams.</p>
        {solutions ? <ul className="r2a-list">{solutions.map(s => <li key={s.id}><b className="r2-mono">{s.id}</b> {s.explanation}</li>)}</ul> : <button type="button" className="k-btn" onClick={() => adminGet<Solution[]>("solutions").then(setSolutions).catch(e => setMsg({ tone: "error", text: errText(e) }))}>Load solutions</button>}</section>
    </div></div>;
}
