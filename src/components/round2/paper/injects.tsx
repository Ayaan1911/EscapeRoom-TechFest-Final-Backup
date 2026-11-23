"use client";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ConnMap, Spark } from "./chapters";
import type { Conn, I1, I2, I3, I4, TerminalState } from "@/lib/round2/paper/types";

// Case document v2 inject desks. READ-ONLY except the Inject 2 terminal: no answer is typed, selected for scoring or sent anywhere.
// Evidence is shown neutrally: nothing is coloured or labelled by whether it is part of the answer.

export function PaperNote({ items, title = "On your answer sheet" }: { items: string[]; title?: string }) {
  return <aside className="ij-paper" aria-label={title}><b><span aria-hidden="true">✎</span> {title}</b><ol>{items.map(x => <li key={x}>{x}</li>)}</ol></aside>;
}

/* ---------------- Inject 1 · Alert at 2:14 AM ---------------- */
const NIGHT_FROM = 21 * 60, NIGHT_SPAN = 330; // 21:00 to 02:30
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h < 12 ? h + 24 : h) * 60 + m - NIGHT_FROM; };
function NightStrip({ rows }: { rows: I1["network"] }) {
  const span = (t: string) => { const m = t.match(/\d{2}:\d{2}/g) ?? []; const a = toMin(m[0] ?? "21:00"); return { a, b: /onward/.test(t) ? NIGHT_SPAN : m[1] ? toMin(m[1]) : a + 2 }; };
  return <figure className="ij-night"><div className="ij-night-axis" aria-hidden="true">{["21:00", "22:00", "23:00", "00:00", "01:00", "02:00"].map(t => <span key={t} style={{ left: `${(toMin(t) / NIGHT_SPAN) * 100}%` }}>{t}</span>)}</div>
    <ol className="ij-night-rows">{rows.map((r, i) => { const s = span(r.time); return <li key={i}><span className="ij-night-lbl">{r.dest}</span><span className="ij-night-track"><i style={{ left: `${(s.a / NIGHT_SPAN) * 100}%`, width: `${Math.max(0.8, ((s.b - s.a) / NIGHT_SPAN) * 100)}%` }} title={`${r.time} · ${r.traffic}`} /></span></li>; })}</ol>
    <figcaption>Each bar is one row of the table below, placed on the night&apos;s clock. Same colour for every row: the table has the details.</figcaption></figure>;
}
const TABS1 = [["proc", "Processes"], ["logins", "Login history"], ["net", "Network activity"], ["mail", "Mail and downloads"], ["chat", "Chat transcript"]] as const;
export function Inject1({ c }: { c: I1 }) {
  const [tab, setTab] = useState<(typeof TABS1)[number][0]>("proc"), base = useId();
  const table = (cols: string[], rows: string[][]) => <table className="ij-table"><thead><tr>{cols.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={j === 0 ? "ij-mono" : undefined}>{v}</td>)}</tr>)}</tbody></table>;
  return <div className="ij ij-1">
    <section className="ij-incident" aria-label="Incident">
      <div className="ij-device" aria-hidden="true"><svg viewBox="0 0 64 44"><rect x="10" y="4" width="44" height="28" rx="2" /><rect x="14" y="8" width="36" height="20" className="ij-screen" /><path d="M4 36h56l-4 5H8z" /></svg><i className="ij-pulse" /></div>
      <div className="ij-incident-copy"><span className="ij-sev">{c.alert.severity}</span><h2>{c.alert.id} · {c.alert.host}</h2><p>User <b>{c.alert.user}</b> · {c.alert.observed}</p>
        <p className="ij-objective">Decide the first response. Open each evidence tab, compare the records with what Ravi says, then write your choice on paper.</p></div>
    </section>
    <div className="ij-cols">
      <section className="ij-panel ij-evidence" aria-label="Evidence">
        <div role="tablist" aria-label="Evidence tabs" className="ij-tabs">{TABS1.map(([id, label]) => <button key={id} role="tab" id={`${base}-${id}`} aria-selected={tab === id} aria-controls={`${base}-p`} onClick={() => setTab(id)}>{label}</button>)}</div>
        <div role="tabpanel" id={`${base}-p`} aria-labelledby={`${base}-${tab}`} className="ij-tabpanel">
          {tab === "proc" && <><p className="ij-note">Process snapshot taken at 02:14 on FIN-LAP-07.</p>{table(["PID", "Process", "User", "Started", "CPU"], c.processes.map(p => [p.pid, p.name, p.user, p.started, p.cpu]))}</>}
          {tab === "logins" && <><p className="ij-note">Authentication log for FIN-LAP-07, last 12 hours.</p>{table(["Time", "Account", "Type", "Result"], c.logins.map(l => [l.time, l.account, l.type, l.result]))}</>}
          {tab === "net" && <><p className="ij-note">Outbound activity from FIN-LAP-07 during the night.</p><NightStrip rows={c.network} />{table(["Time", "Destination", "Traffic"], c.network.map(n => [n.time, n.dest, n.traffic]))}</>}
          {tab === "mail" && <><p className="ij-note">Mailbox and downloads for ravi.k.</p><ol className="ij-mail">{c.mail.map(m => <li key={m.id}><span className="ij-mono">{m.id}</span><time>{m.when}</time><b>{m.subject}</b><span className="ij-from">{m.from}</span>{m.attachment && <span className="ij-att">📎 {m.attachment} · {m.size}</span>}{m.note && <span className="ij-from">{m.note}</span>}</li>)}</ol></>}
          {tab === "chat" && <><p className="ij-note">Recorded chat between Ravi and the IT Desk. Read-only.</p><ol className="ij-chat">{c.chat.map((m, i) => <li key={i} className={m.from === "ravi" ? "is-ravi" : "is-desk"}><b>{m.from === "ravi" ? "Ravi" : "IT Desk"}</b>{m.text}</li>)}</ol></>}
        </div>
      </section>
      <section className="ij-panel ij-options" aria-label="Response options"><h3>Response options</h3><p className="ij-note">All five are possible responses. Choose on paper, not here.</p>
        <ol className="ij-opts">{c.options.map(o => <li key={o.letter}><b>{o.letter}</b><span>{o.text}</span></li>)}</ol>
        <PaperNote items={c.paper} /></section>
    </div>
  </div>;
}

/* ---------------- Inject 2 · Kill Switch terminal ---------------- */
type Line = { kind: "in" | "ok" | "bad" | "warn" | "info"; text: string };
const MSG = { caught: "CAUGHT and BLOCKED!!", cleared: "WHY THE HECK DID YOU BLOCKED ME ??? Connecting CEO", repeat: "ALREADY ATTEMPTED. The attempt still counts." } as const;
const EXHAUSTED = "CALL THE VOLUNTEERS . ASAP , IT IS EATING THE DATABASE !!";
function historyLines(st: TerminalState): Line[] {
  return st.attempts.flatMap((a, i) => [{ kind: "in" as const, text: `BLOCK ${a.ip}` }, { kind: a.result === "caught" ? "ok" as const : a.result === "cleared" ? "bad" as const : "warn" as const, text: `${MSG[a.result]}  [${st.max - (i + 1)} left]` }]);
}
export function Terminal({ demo, maxAttempts, insert }: { demo?: boolean; maxAttempts: number; insert: { ip: string; nonce: number } | null }) {
  const empty: TerminalState = { open: true, max: maxAttempts, remaining: maxAttempts, locked: false, allCaught: false, attempts: [], keyReady: true };
  const [st, setSt] = useState<TerminalState>(empty), [extra, setExtra] = useState<Line[]>([]), [cmd, setCmd] = useState(""), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(!!demo);
  const input = useRef<HTMLInputElement>(null), log = useRef<HTMLOListElement>(null);
  useEffect(() => { if (demo) return; let alive = true; fetch("/api/round2/terminal", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(s => { if (alive && s) { setSt(s); setExtra(historyLines(s)); } if (alive) setLoaded(true); }).catch(() => setLoaded(true)); return () => { alive = false; }; }, [demo]);
  useEffect(() => { if (!insert) return; const t = setTimeout(() => { setCmd(`BLOCK ${insert.ip}`); input.current?.focus(); }, 0); return () => clearTimeout(t); }, [insert]);
  useEffect(() => { log.current?.lastElementChild?.scrollIntoView({ block: "nearest" }); }, [st, extra]);
  async function submit(e: FormEvent) {
    e.preventDefault(); const line = cmd.trim(); if (!line || busy || st.locked) return;
    setBusy(true); setCmd("");
    try {
      if (demo) { // organizer preview: the server classifies one IP; the history lives only in this tab
        const m = /^\s*block\s+(\S+)\s*$/i.exec(line);
        if (!m) { setExtra(x => [...x, { kind: "in", text: line }, { kind: "info", text: "Unknown command. Usage: BLOCK <IP>" }]); return; }
        const r = await fetch("/api/round2/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "demo-block", ip: m[1], previous: st.attempts.map(a => a.ip) }) }).then(x => x.json());
        if (!r.result) { setExtra(x => [...x, { kind: "in", text: line }, { kind: "info", text: r.message ?? r.error ?? "Not classified." }]); return; }
        const attempts = [...st.attempts, { seq: st.attempts.length + 1, ip: m[1], result: r.result as "caught" | "cleared" | "repeat", at: new Date().toISOString() }];
        const next = { ...st, attempts, remaining: st.max - attempts.length, locked: attempts.length >= st.max };
        setSt(next); setExtra(x => [...x, ...historyLines(next).slice(-2)]);
        return;
      }
      const r = await fetch("/api/round2/terminal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: line }) });
      const body = await r.json();
      if (body.state) setSt(body.state);
      if (body.result && body.state) setExtra(x => [...x, ...historyLines(body.state).slice(-2)]);
      else if (body.message) setExtra(x => [...x, { kind: "in", text: line }, { kind: "info", text: body.message }]);
      else if (!r.ok) setExtra(x => [...x, { kind: "in", text: line }, { kind: "bad", text: body.error ?? "Command refused." }]);
    } catch { setExtra(x => [...x, { kind: "in", text: line }, { kind: "warn", text: "Connection lost. Nothing was recorded; try again." }]); }
    finally { setBusy(false); }
  }
  const lines = extra, out = st.locked && st.remaining === 0 && !st.allCaught;
  return <section className={`ij-term ${st.locked ? "is-locked" : ""}`} aria-label="Firewall terminal">
    <header><b>nexus-fw · simulated firewall</b><span className="ij-pips" role="img" aria-label={`${st.remaining} of ${st.max} attempts left`}>{Array.from({ length: st.max }, (_, i) => <i key={i} className={i < st.max - st.remaining ? "is-used" : ""} />)}</span><span className="ij-left">{st.remaining} / {st.max} attempts left</span></header>
    <ol className="ij-log" ref={log} aria-live="polite" aria-label="Terminal output">
      <li className="is-info">Simulation only: no real network, firewall or shell is touched. Usage: BLOCK &lt;IP&gt; · {st.max} attempts per team, kept across refreshes.</li>
      {!st.keyReady && <li className="is-warn">Terminal offline: awaiting the organizer&apos;s approved answer set. Write your findings on paper.</li>}
      {lines.map((l, i) => <li key={i} className={`is-${l.kind}`}>{l.kind === "in" ? <><span className="ij-prompt">ghost@nexus-fw:~$</span> {l.text}</> : l.text}</li>)}
      {st.allCaught && <li className="is-ok ij-final">ALL ATTACKER CONNECTIONS BLOCKED. Write the IPs you blocked on your answer sheet.</li>}
      {out && <li className="is-bad ij-final">{EXHAUSTED}</li>}
      {!st.open && st.keyReady && !demo && loaded && <li className="is-warn">The terminal is closed.</li>}
    </ol>
    <form onSubmit={submit} className="ij-cmd"><label htmlFor="ij-cmd-input" className="ij-prompt">ghost@nexus-fw:~$</label>
      <input id="ij-cmd-input" ref={input} value={cmd} onChange={e => setCmd(e.target.value)} disabled={st.locked || busy || !loaded} maxLength={80} autoComplete="off" spellCheck={false} aria-label="Terminal command" placeholder={st.locked ? "terminal locked" : "BLOCK <IP>"} />
      <button type="submit" disabled={st.locked || busy || !cmd.trim()}>Run</button></form>
    {out && <p className="ij-term-note">No further block commands are possible. A volunteer can help; any deduction is handled on paper.</p>}
    {demo && <button type="button" className="ij-reset" onClick={() => { setSt(empty); setExtra([]); }}>Reset demo terminal</button>}
  </section>;
}
function ConnInspector({ k, onInsert }: { k: Conn; onInsert: (ip: string) => void }) {
  return <section className="ij-panel ij-inspect" aria-label={`Connection ${k.n}`}><h3>Connection {k.n} · <span className="ij-mono">{k.ip}</span></h3>
    <dl className="ij-dl"><div><dt>Process</dt><dd className="ij-mono">{k.process}</dd></div><div><dt>Country</dt><dd>{k.country}</dd></div><div><dt>Sent / received</dt><dd>{k.sent} / {k.received}</dd></div><div><dt>Active</dt><dd>{k.duration}</dd></div><div><dt>Pattern</dt><dd>{k.pattern}</dd></div></dl>
    <Spark series={k.series} /><button type="button" className="ij-btn" onClick={() => onInsert(k.ip)}>Copy IP into the terminal <span className="ij-sub">(does not run it)</span></button></section>;
}
export function Inject2({ c, demo }: { c: I2; demo?: boolean }) {
  const [sel, setSel] = useState<number | null>(null), [insert, setInsert] = useState<{ ip: string; nonce: number } | null>(null), k = c.connections.find(x => x.n === sel);
  return <div className="ij ij-2">
    <p className="ij-brief">{c.brief} <b>Each BLOCK uses one of {c.maxAttempts} attempts</b>, right or wrong.</p>
    <div className="ij-cols ij-cols-2">
      <div className="ij-stack">
        <ConnMap conns={c.connections} sel={sel} onSelect={setSel} />
        <section className="ij-panel" aria-label="Live connections"><table className="ij-table ij-conns"><thead><tr><th scope="col">#</th><th scope="col">IP address</th><th scope="col">Process</th><th scope="col">Country</th><th scope="col">Sent</th><th scope="col">Active</th><th scope="col"><span className="rp-sr">Inspect</span></th></tr></thead>
          <tbody>{c.connections.map(x => <tr key={x.n} className={sel === x.n ? "is-sel" : ""}><td>{x.n}</td><td className="ij-mono">{x.ip}</td><td className="ij-mono">{x.process}</td><td>{x.country}</td><td>{x.sent}</td><td>{x.duration}</td><td><button type="button" className="ij-link" aria-pressed={sel === x.n} onClick={() => setSel(sel === x.n ? null : x.n)}>Inspect<span className="rp-sr"> connection {x.n}</span></button></td></tr>)}</tbody></table></section>
      </div>
      <div className="ij-stack ij-sticky">
        {k ? <ConnInspector k={k} onInsert={ip => setInsert({ ip, nonce: Date.now() })} /> : <p className="ij-panel ij-empty">Select a connection on the map or in the table to inspect it.</p>}
        <Terminal demo={demo} maxAttempts={c.maxAttempts} insert={insert} />
        <PaperNote items={c.paper} />
      </div>
    </div>
  </div>;
}

/* ---------------- Inject 3 · Audit the AI ---------------- */
export function Inject3({ c }: { c: I3 }) {
  const [claim, setClaim] = useState(1), [view, setView] = useState<"records" | "timeline">("records"), [rec, setRec] = useState("R-1"), base = useId();
  const r = c.records.find(x => x.id === rec)!;
  return <div className="ij ij-3">
    <p className="ij-brief"><b>SENTINEL-AI</b> filed this report with confidence scores. The scores are the AI&apos;s own; they are not evidence. Check every claim against the records.</p>
    <div className="ij-cols ij-cols-3">
      <section className="ij-panel ij-report" aria-label="SENTINEL-AI report"><h3>SENTINEL-AI incident report</h3>
        <ol className="ij-claims">{c.claims.map(x => <li key={x.n}><button type="button" aria-pressed={claim === x.n} onClick={() => setClaim(x.n)}><span className="ij-claim-n">Claim {x.n}</span><span className="ij-conf" aria-label={`AI confidence ${x.confidence}`}>AI confidence {x.confidence}</span><span className="ij-claim-t">{x.text}</span></button></li>)}</ol>
        <PaperNote items={c.paper} /></section>
      <section className="ij-panel ij-sticky ij-verify" aria-label="Evidence">
        <div className="ij-focus" aria-live="polite"><span>Checking claim {claim}</span><p>{c.claims[claim - 1].text}</p></div>
        <div role="tablist" aria-label="Evidence views" className="ij-tabs"><button role="tab" id={`${base}-r`} aria-selected={view === "records"} aria-controls={`${base}-v`} onClick={() => setView("records")}>Case file extracts</button><button role="tab" id={`${base}-t`} aria-selected={view === "timeline"} aria-controls={`${base}-v`} onClick={() => setView("timeline")}>Night timeline (IST)</button></div>
        <div role="tabpanel" id={`${base}-v`} aria-labelledby={`${base}-${view === "records" ? "r" : "t"}`} className="ij-tabpanel">
          {view === "records" ? <>
            <div className="ij-chips" role="group" aria-label="Records">{c.records.map(x => <button key={x.id} type="button" aria-pressed={rec === x.id} onClick={() => setRec(x.id)}>{x.id}{x.tz === "UTC" && <small> UTC</small>}</button>)}</div>
            <article className="ij-record" aria-label={`Record ${r.id}`}><header><b>{r.id}</b><span>{r.source}</span><span className={`ij-tz ${r.tz === "UTC" ? "is-utc" : ""}`}>Times in {r.tz}</span></header><ul>{r.lines.map(l => <li key={l}>{l}</li>)}</ul></article>
          </> : <ol className="ij-tl">{c.timeline.map(t => <li key={t.n}><time>{t.time} <small>{t.tz}</small></time><span>{t.event}</span></li>)}</ol>}
        </div>
        <p className="ij-note">All times are IST except where a record says UTC. India Standard Time is UTC + 5:30.</p>
      </section>
    </div>
  </div>;
}

/* ---------------- Inject 4 · The Three Calls ---------------- */
export function Inject4({ c }: { c: I4 }) {
  const [call, setCall] = useState(1), cur = c.calls[call - 1];
  const ring = (n: number): ReactNode => <span className="ij-call-ic" aria-hidden="true">{n === call ? "☎" : "✆"}</span>;
  return <div className="ij ij-4">
    <dl className="ij-status" aria-label="Incident status">{c.status.map(s => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>
    <div className="ij-cols ij-cols-4">
      <nav className="ij-calls" aria-label="CEO calls">{c.calls.map(x => <button key={x.n} type="button" aria-pressed={call === x.n} onClick={() => setCall(x.n)}>{ring(x.n)}<span><b>Call {x.n} · {x.title}</b><small>“{x.ceo}”</small></span></button>)}</nav>
      <section key={cur.n} className="ij-panel ij-call" aria-label={`Call ${cur.n}: ${cur.title}`}>
        <header><span className="ij-live">INCOMING · CEO</span><h3>Call {cur.n} · {cur.title}</h3><blockquote>“{cur.ceo}”</blockquote></header>
        <ol className="ij-opts">{cur.options.map(o => <li key={o.letter}><b>{o.letter}</b><span>{o.text}</span></li>)}</ol>
        <p className="ij-note"><span aria-hidden="true">✎</span> Write the letter and one line of reasoning on paper. Nothing here is selected or sent.</p>
      </section>
    </div>
    <section className="ij-panel ij-statement" aria-label="Public statement"><h3>Public statement draft board</h3><p className="ij-note">Pick two sentences for the public statement. Write their numbers on paper.</p>
      <ol className="ij-sentences">{c.statements.map(s => <li key={s.n}><b>{s.n}</b><span>{s.text}</span></li>)}</ol></section>
    <PaperNote items={c.paper} />
  </div>;
}
