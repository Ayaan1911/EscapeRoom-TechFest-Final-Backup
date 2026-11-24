"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminGet, adminPost, ApiError } from "../api";
import { FORMAT_LABEL, OPEN_BUFFER, OPEN_PACE, POINTS, RULES } from "@/lib/round2/paper/format";

// Organizer Round 2 control room. ONE format: GHOST RETURNS Part A, 60 minutes, four open injects. No format choice.
type Timing = { retired?: boolean; serverNow: string; phase: "not_started" | "running" | "complete"; startsAt: string | null; schedule: { at: string; event: string }[] | null; taunt: string | null; chapter: number | null; chapterTitle: string | null; chapterEndsAt: string | null; endsAt: string | null };
type Ready = { ready: boolean; checks: { id: string; ok: boolean; blocking: boolean; message: string }[]; active: number; standby: number; confirmed: boolean; expected: number };
type Review = { keyReady: boolean; keyStatus: string | null; open: boolean; maxScore: number; teams: { teamId: string; name: string; attempts: { seq: number; ip: string; result: "caught" | "cleared"; at: string }[]; remaining: number; contained: number; lockReason: string; untouched: boolean; score: number | null }[] };
type Cell = { score: number; marker: string; at: string } | null;
type MarkRow = { teamId: string; name: string; seed: number; i1: Cell; i3: Cell; i4: Cell; terminal: { score: number | null; final: boolean; untouched: boolean; attempts: number }; total: number | null; pending: string[]; rank: number | null; tied: boolean };
type Marking = { phase: string; started: boolean; keyReady: boolean; publishedAt: string | null; rows: MarkRow[]; complete: number; canPublish: boolean };

export const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const hms = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const errText = (e: unknown) => e instanceof ApiError ? (e.status === 401 ? "Organizer session expired. Sign in again." : e.message) : "Unexpected error";
const LOCK: Record<string, string> = { none: "Open", contained: "Locked · both threats contained", exhausted: "Locked · out of attempts", closed: "Locked · pens down", "no-key": "Offline · key missing" };
const STALE_MS = 15_000;

/** Polls organizer timing; the displayed countdown is server time + a measured offset (the device clock is never trusted).
 *  `staleFor` reports how long since the last successful answer, so a dead connection is never shown as a live clock. */
export function useTiming(everyMs = 2000) {
  const [t, setT] = useState<Timing | null>(null), [nowMs, setNow] = useState(0), [err, setErr] = useState(""), [staleFor, setStale] = useState(0), base = useRef({ server: 0, perf: 0 });
  const load = useCallback(async () => {
    try { const x = await adminGet<Timing>("timing"); base.current = { server: Date.parse(x.serverNow), perf: performance.now() }; setT(x); setNow(base.current.server); setErr(""); } catch (e) { setErr(errText(e)); }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0), poll = setInterval(() => { if (document.visibilityState === "visible") void load(); }, everyMs);
    const tick = setInterval(() => { if (base.current.server) { const since = performance.now() - base.current.perf; setNow(base.current.server + since); setStale(since); } }, 250);
    return () => { clearTimeout(first); clearInterval(poll); clearInterval(tick); };
  }, [load, everyMs]);
  return { t, nowMs, err, reload: load, stale: staleFor > STALE_MS, staleFor };
}

function usePoll<T>(view: string, everyMs: number, dep: unknown) {
  const [data, setData] = useState<T | null>(null), [err, setErr] = useState("");
  const load = useCallback(() => adminGet<T>(view).then(x => { setData(x); setErr(""); }).catch(e => setErr(errText(e))), [view]);
  useEffect(() => { const first = setTimeout(load, 0), id = setInterval(() => { if (document.visibilityState === "visible") void load(); }, everyMs); return () => { clearTimeout(first); clearInterval(id); }; }, [load, everyMs, dep]);
  return { data, err, load };
}

/** Kill Switch review: each team's attempts, lock state and the server-computed terminal score. Read-only: there is no reset. */
function TerminalReview({ phase }: { phase?: string }) {
  const { data: r, err } = usePoll<Review>("terminal", 5000, phase);
  const n = (f: (t: Review["teams"][number]) => boolean) => r?.teams.filter(f).length ?? 0;
  return <section className="cc-panel" aria-label="Kill Switch terminal review">
    <header className="cc-panel-head"><div><span className="cc-eyebrow">INJECT 2 · SERVER-SCORED</span><h2>Kill Switch · terminal review</h2></div>
      {r && <span className={`cc-pill ${r.keyReady ? "is-ok" : "is-alert"}`}><i />{r.keyReady ? `Answer key installed (${r.keyStatus})` : "Answer key NOT installed"}</span>}</header>
    {err && <p className="cc-alert">{err}</p>}
    {!r ? <p className="cc-dim">Loading…</p> : <>
      <dl className="rc2-sum"><div><dt>Teams</dt><dd>{r.teams.length}</dd></div><div><dt>Both threats contained</dt><dd>{n(t => t.lockReason === "contained")}</dd></div><div><dt>Out of attempts</dt><dd>{n(t => t.lockReason === "exhausted")}</dd></div><div><dt>No attempt yet</dt><dd>{n(t => t.untouched)}</dd></div></dl>
      {!r.keyReady && <p className="cc-alert">The terminal is offline and no score can be computed until the private key file is installed on the event server (see the runbook).</p>}
      <table className="cc-table rc2-term"><thead><tr><th>Team</th><th>Blocks used <span className="cc-legend-inline"><i className="is-done" />attacker <i className="rc2-bad" />legitimate</span></th><th>Left</th><th>Terminal</th><th>Score / {r.maxScore}</th></tr></thead>
        <tbody>{r.teams.map(t => <tr key={t.teamId}><td><b>{t.name}</b><small>{t.teamId}</small></td>
          <td>{t.attempts.length ? <ol className="rc2-chips">{t.attempts.map(a => <li key={a.seq} className={a.result === "caught" ? "is-ok" : "is-bad"} title={hms(a.at)}><b>{a.seq}</b>{a.ip}<em>{a.result === "caught" ? "attacker" : "legitimate"}</em></li>)}</ol> : <span className="cc-dim">No attempts</span>}</td>
          <td className="cc-num">{t.remaining} / 4</td><td>{LOCK[t.lockReason] ?? t.lockReason}</td>
          <td className="cc-num"><b>{t.score ?? "—"}</b>{t.untouched && t.score !== null ? <small>no attempts · literal rule (owner decision)</small> : null}</td></tr>)}</tbody></table>
      <p className="cc-note">Score: +5 per attacker connection blocked, +5 if no legitimate connection was blocked, −2 per legitimate block, 0 to {r.maxScore}. Volunteers hand a correct-IP slip only after OUT OF ATTEMPTS. There is no attempt reset.</p></>}
  </section>;
}

/** Jury marking for Injects 1, 3 and 4 (paper). Inject 2 is shown read-only from the terminal. Missing marks stay pending, never zero. */
function MarkingPanel({ phase }: { phase?: string }) {
  const { data: m, err, load } = usePoll<Marking>("marking", 10_000, phase);
  const [marker, setMarker] = useState(""), [edit, setEdit] = useState<Record<string, string>>({}), [msg, setMsg] = useState(""), [busy, setBusy] = useState(""), [reason, setReason] = useState(""), [armed, setArmed] = useState(false);
  useEffect(() => { const id = setTimeout(() => setMarker(localStorage.getItem("ghost-marker") ?? ""), 0); return () => clearTimeout(id); }, []);
  const locked = !!m?.publishedAt;
  const key = (teamId: string, i: number) => `${teamId}:${i}`;
  const val = (r: MarkRow, i: 1 | 3 | 4) => edit[key(r.teamId, i)] ?? (r[`i${i}`]?.score.toString() ?? "");
  const changed = (r: MarkRow) => ([1, 3, 4] as const).filter(i => edit[key(r.teamId, i)] !== undefined && edit[key(r.teamId, i)] !== (r[`i${i}`]?.score.toString() ?? ""));
  const bad = (v: string) => v !== "" && !/^(?:[0-9]|1[0-5])$/.test(v);
  async function save(r: MarkRow) {
    setBusy(r.teamId); setMsg(""); localStorage.setItem("ghost-marker", marker.trim());
    try {
      for (const i of changed(r)) { const v = edit[key(r.teamId, i)]; await adminPost({ action: "mark", teamId: r.teamId, inject: i, score: v === "" ? null : Number(v), marker: marker.trim() }); }
      setEdit(e => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`${r.teamId}:`)))); setMsg(`Saved marks for ${r.teamId}.`);
    } catch (e) { setMsg(errText(e)); } finally { setBusy(""); await load(); }
  }
  async function publish() {
    setBusy("publish"); setMsg("");
    try { await adminPost({ action: "publish", reason }); setMsg("Round 2 results published. Marks are now locked."); } catch (e) { setMsg(errText(e)); } finally { setBusy(""); setArmed(false); await load(); }
  }
  return <section id="marking" className="cc-panel" aria-labelledby="marking-h">
    <header className="cc-panel-head"><div><span className="cc-eyebrow">JURY · PAPER INJECTS 1, 3, 4 · 15 POINTS EACH</span><h2 id="marking-h">Round 2 marking</h2></div>
      {m && <span className={`cc-pill ${locked ? "is-ok" : m.complete === m.rows.length && m.rows.length ? "is-live" : "is-warn"}`}><i />{locked ? "Published · locked" : `${m.complete} of ${m.rows.length} teams complete`}</span>}</header>
    {err && <p className="cc-alert">{err}</p>}
    {!m ? <p className="cc-dim">Loading…</p> : !m.started ? <p className="cc-dim">Marking opens once Round 2 has started. Nothing is scored before then.</p> : <>
      <div className="cc-toolbar"><label>Marking as (name or initials, written to the audit log)<input value={marker} onChange={e => setMarker(e.target.value)} maxLength={40} disabled={locked} /></label>
        <p className="cc-dim rc2-hint">Enter whole numbers 0–15. Empty means pending. Inject 2 is the terminal&apos;s score and cannot be typed here. A total appears only when all four parts exist after pens down.</p></div>
      <table className="cc-table rc2-mark" aria-label="Round 2 marking sheet"><thead><tr><th>Team</th><th>Inject 1</th><th>Inject 2 · terminal</th><th>Inject 3</th><th>Inject 4</th><th>Total / {POINTS.total}</th><th><span className="sr-only">Save</span></th></tr></thead>
        <tbody>{[...m.rows].sort((x, y) => x.seed - y.seed).map(r => { const c = changed(r), invalid = ([1, 3, 4] as const).some(i => bad(val(r, i)));
          return <tr key={r.teamId} className={c.length ? "is-dirty" : ""}><td><b>{r.name}</b><small>{r.teamId}</small></td>
            {([1, 2, 3, 4] as const).map(i => i === 2 ? <td key={i} className="cc-num rc2-term-cell"><b>{r.terminal.score ?? "—"}</b><small>{r.terminal.score === null ? "key missing" : r.terminal.final ? (r.terminal.untouched ? "final · no attempts" : "final") : "live · may change"}</small></td>
              : <td key={i}><input className={`rc2-in ${bad(val(r, i)) ? "is-bad" : ""}`} inputMode="numeric" aria-label={`${r.teamId} Inject ${i} mark`} value={val(r, i)} disabled={locked} onChange={e => setEdit(x => ({ ...x, [key(r.teamId, i)]: e.target.value.trim() }))} />
                {r[`i${i}`] && <small title={hms(r[`i${i}`]!.at)}>{r[`i${i}`]!.marker}</small>}</td>)}
            <td className="cc-num">{r.total !== null ? <b className="rc2-total">{r.total}</b> : <span className="rc2-pending">Pending: {r.pending.join(", ")}</span>}</td>
            <td><button type="button" className="cc-btn cc-btn-sm cc-btn-primary" disabled={locked || !c.length || invalid || marker.trim().length < 2 || busy === r.teamId} onClick={() => void save(r)}>{busy === r.teamId ? "Saving…" : "Save"}<span className="sr-only"> marks for {r.teamId}</span></button></td></tr>; })}</tbody></table>
      {msg && <p role="status" className="rc2-msg">{msg}</p>}
      <div className="rc2-publish"><div><h3>Publish Round 2 results</h3><p>{locked ? `Published ${hms(m.publishedAt!)}. The projector shows the ranking; marks are locked.` : m.phase !== "complete" ? "Available after pens down, once every finalist is fully marked." : m.canPublish ? "Every finalist is fully marked. Publishing locks all marks and puts the ranking on the projector. Equal totals share a rank (no tie-break is approved)." : `${m.rows.length - m.complete} finalist(s) still pending.`}</p></div>
        {!locked && <div className="cc-form-row"><label>Reason (required)<input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} disabled={!m.canPublish} /></label>
          {armed ? <><button type="button" className="k-btn k-btn-danger" disabled={busy === "publish" || reason.trim().length < 5} onClick={() => void publish()}>Yes, publish and lock marks</button><button type="button" className="k-btn" onClick={() => setArmed(false)}>Cancel</button></>
            : <button type="button" className="k-btn k-btn-primary" disabled={!m.canPublish} onClick={() => setArmed(true)}>Publish results</button>}</div>}</div>
    </>}
  </section>;
}

export function PaperControl() {
  const { t, nowMs, err, reload, stale, staleFor } = useTiming(), [ready, setReady] = useState<Ready | null>(null), [msg, setMsg] = useState(""), [armed, setArmed] = useState<"" | "start" | "end" | "enroll">(""), [reason, setReason] = useState(""), [busy, setBusy] = useState(false);
  const loadReady = useCallback(() => { adminGet<Ready>("readiness").then(setReady).catch(e => setMsg(errText(e))); }, []);
  useEffect(() => { const id = setTimeout(loadReady, 0); return () => clearTimeout(id); }, [loadReady, t?.phase]);
  async function act(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg("");
    try { await adminPost(body); setMsg(ok); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); setArmed(""); await reload(); loadReady(); }
  }
  const running = t?.phase === "running" && !t.retired, total = t?.endsAt && running ? Date.parse(t.endsAt) - nowMs : 0, left = t?.chapterEndsAt ? Date.parse(t.chapterEndsAt) - nowMs : 0;
  const elapsed = t?.startsAt && running ? (nowMs - Date.parse(t.startsAt)) / 60_000 : null;
  const word = !t ? "Connecting" : t.retired ? "Historical session" : t.phase === "not_started" ? "Not started" : t.phase === "running" ? (total < 5 * 60_000 ? "Final minutes" : "Running") : "Pens down";
  return <div className="cc-main rc2">
    <header className="cc-hero rc2-hero">
      <div className="cc-hero-id"><span className="cc-eyebrow">GHOST RETURNS · ROUND 2 · ONE FORMAT</span><h1>Round 2 control room</h1>
        <p>{FORMAT_LABEL}. Four injects open together; answers on paper; {POINTS.total} points (Kill Switch scored by the terminal, the other three by the jury).</p>
        <nav className="cc-actions" aria-label="Round 2 tools"><Link className="k-btn" href="/admin/projector">Projector broadcast</Link><Link className="k-btn" href="/admin/round2/print">Printable materials</Link><a className="k-btn" href="/admin/demo/round2?unit=1">Demo Mode</a></nav></div>
      <div className="cc-hero-clock"><small>{running ? "ROUND 2 LEFT" : "STATUS"}</small>
        {running ? <b className={`cc-clock ${total < 5 * 60_000 ? "is-urgent" : ""}`} role="timer" aria-label="Round 2 time remaining">{stale ? "--:--" : mmss(total)}</b> : <span className={`cc-pill ${t?.phase === "complete" ? "is-ok" : "is-warn"}`}><i />{word}</span>}
        {running && <span className={`cc-pill ${total < 5 * 60_000 ? "is-warn" : "is-live"}`}><i />{word}</span>}
        {stale && <p className="cc-alert" role="alert">No answer from the server for {Math.round(staleFor / 1000)} s. The clock is hidden until the connection returns.</p>}</div>
      {running && <div className="rc2-track" aria-hidden="true"><i style={{ width: `${Math.min(100, ((elapsed ?? 0) / 60) * 100)}%` }} />{OPEN_PACE.map(p => <span key={p.n} style={{ left: `${(p.toMin / 60) * 100}%` }} />)}</div>}
    </header>
    {(err || msg) && <p role="status" className="rc2-msg">{msg || err}</p>}

    <section className="rc2-injects" aria-label="Injects">
      {OPEN_PACE.map(p => <article key={p.n} className={running && t?.chapter === p.n ? "is-now" : ""}><span className="rc2-n">{p.n}</span><div><h3>{p.title}</h3>
        <p>{p.n === 2 ? "15 points · terminal (server-scored)" : "15 points · paper (jury)"}</p><small>Suggested {p.fromMin}–{p.toMin} min{running && t?.chapter === p.n ? " · suggested now" : ""}</small></div></article>)}
      <p className="cc-note">All four injects stay open for the whole 60 minutes. The highlight is only the suggested pacing ({OPEN_BUFFER.label.toLowerCase()} in the last 3 minutes).</p>
    </section>

    <div className="cc-grid">
      <section className="cc-panel rc2-state" aria-label="Clock">
        {!t ? <p className="cc-dim">Loading…</p> : t.retired ? <><h2>Historical session (retired format)</h2><p>This database holds a session from the retired format. It is kept as history and cannot be restarted. Use a fresh event database for Round 2 (see the runbook).</p></>
          : t.phase === "not_started" ? <><span className="cc-eyebrow">BEFORE THE START</span><h2>Not started</h2><p className="cc-lede">Enroll the finalists, check readiness, then start when the room is ready. Nothing starts by opening this page.</p></>
          : t.phase === "complete" ? <><span className="cc-eyebrow">ROUND OVER</span><h2>INVESTIGATION COMPLETE — PENS DOWN</h2><p className="cc-lede">All injects are closed and every terminal is locked. Terminal history and scores are kept. Collect the answer sheets and mark below.</p></>
          : <div className="rc2-now"><div><small>SUGGESTED NOW (ALL INJECTS OPEN)</small><h2>{t.chapter ? `${t.chapter} · ` : ""}{t.chapterTitle}</h2></div><div><small>SUGGESTED SLOT LEFT</small><b className="rc2-mid">{stale ? "--:--" : mmss(left)}</b></div></div>}
        {t?.schedule && <ol className="rc2-sched" aria-label="Suggested pacing">{t.schedule.map(s => { const past = Date.parse(s.at) <= nowMs; return <li key={s.at} className={past ? "is-past" : ""}><time>{hms(s.at)}</time><span>{s.event}</span>{past && <em>passed</em>}</li>; })}</ol>}
        {t?.taunt && <p className="rc2-taunt" role="status">GHOST_404: “{t.taunt}”</p>}
      </section>

      {t?.phase === "not_started" && !t.retired ? <section className="cc-panel" aria-label="Readiness"><span className="cc-eyebrow">START CHECKLIST</span><h2>Readiness</h2>
        {!ready ? <p className="cc-dim">Checking…</p> : <><ul className="rc2-checks">{ready.checks.filter(c => c.id !== "content-complete").map(c => <li key={c.id} className={c.ok ? "is-ok" : c.blocking ? "is-bad" : "is-warn"}><b aria-hidden="true">{c.ok ? "✓" : c.blocking ? "✗" : "!"}</b>{c.message}<em>{c.ok ? "OK" : c.blocking ? "Blocking" : "Warning"}</em></li>)}</ul>
          <p className="cc-dim">{ready.active} active finalists · {ready.standby} standby</p><ul className="rc2-rules">{RULES.map(r => <li key={r}>{r}</li>)}</ul>
          <div className="cc-actions">
            {!ready.confirmed && <a className="k-btn k-btn-primary" href="/admin#qualification">Review Top 10 Teams</a>}
            {ready.confirmed && ready.active === 0 && (armed === "enroll" ? <><button className="k-btn k-btn-primary" disabled={busy} onClick={() => void act({ action: "enroll" }, "Finalists enrolled from the confirmed qualification.")}>Confirm enroll</button><button className="k-btn" onClick={() => setArmed("")}>Cancel</button></> : <button className="k-btn" disabled={busy} onClick={() => setArmed("enroll")}>Enroll finalists</button>)}
            {armed === "start" ? <><button className="k-btn k-btn-danger" disabled={busy} onClick={() => void act({ action: "start" }, "Round 2 started: 60 minutes, all four injects open.")}>Yes, start the 60-minute investigation</button><button className="k-btn" onClick={() => setArmed("")}>Cancel</button></> : <button className="k-btn k-btn-primary k-btn-lg" disabled={busy || !ready.ready} onClick={() => setArmed("start")}>Start Round 2</button>}
          </div></>}</section>
        : running ? <section className="cc-panel rc2-end" aria-label="End now"><span className="cc-eyebrow">IRREVERSIBLE</span><h2>End early</h2><p>Closes every inject immediately, locks every terminal and shows PENS DOWN. Cannot be undone.</p>
          <div className="cc-form-row"><label>Reason (required)<input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label>
            {armed === "end" ? <><button className="k-btn k-btn-danger" disabled={busy || reason.trim().length < 5} onClick={() => void act({ action: "end", reason }, "Round 2 ended.")}>Yes, end now</button><button className="k-btn" onClick={() => setArmed("")}>Cancel</button></> : <button className="k-btn k-btn-danger" onClick={() => setArmed("end")}>End Round 2 now</button>}</div></section>
        : <section className="cc-panel" aria-label="Next step"><span className="cc-eyebrow">NEXT</span><h2>{t?.retired ? "Fresh database needed" : "Mark the papers"}</h2><p className="cc-lede">{t?.retired ? "Round 2 cannot run on this database." : "Enter the jury's marks in the marking sheet below, then publish once every finalist is complete."}</p>{!t?.retired && <a className="cc-btn cc-btn-primary" href="#marking">Go to marking</a>}</section>}
    </div>

    {t && t.phase !== "not_started" && !t.retired && <TerminalReview phase={t.phase} />}
    {t && !t.retired && <MarkingPanel phase={t.phase} />}
  </div>;
}
