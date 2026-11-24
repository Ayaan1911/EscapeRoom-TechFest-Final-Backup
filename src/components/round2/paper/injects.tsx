"use client";
import { useId, useState, type ReactNode } from "react";
import { PaperNote } from "./paper-note";
import type { I1, I3, I4 } from "@/lib/round2/paper/types";

// Inject desks 1, 3 and 4 (read-only). Inject 2 lives in kill-switch.tsx. No answer is typed, selected for scoring or sent anywhere.
// Evidence is shown neutrally: nothing is coloured or labelled by whether it is part of the answer.


/* ---------------- Inject 1 · Alert at 2:14 AM ---------------- */
const NIGHT_FROM = 21 * 60, NIGHT_SPAN = 330; // 21:00 to 02:30
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h < 12 ? h + 24 : h) * 60 + m - NIGHT_FROM; };
function NightStrip({ rows }: { rows: I1["network"] }) {
  const span = (t: string) => { const m = t.match(/\d{2}:\d{2}/g) ?? []; const a = toMin(m[0] ?? "21:00"); return { a, b: /onward/.test(t) ? NIGHT_SPAN : m[1] ? toMin(m[1]) : a + 2 }; };
  return <figure className="ij-night"><div className="ij-night-axis" aria-hidden="true">{["21:00", "22:00", "23:00", "00:00", "01:00", "02:00"].map(t => <span key={t} style={{ left: `${(toMin(t) / NIGHT_SPAN) * 100}%` }}>{t}</span>)}</div>
    <ol className="ij-night-rows">{rows.map((r, i) => { const s = span(r.time); return <li key={i}><span className="ij-night-lbl">{r.dest}</span><span className="ij-night-track"><i style={{ left: `${(s.a / NIGHT_SPAN) * 100}%`, width: `${Math.max(0.8, ((s.b - s.a) / NIGHT_SPAN) * 100)}%` }} title={`${r.time} · ${r.traffic}`} /></span></li>; })}</ol>
    <figcaption>Each bar is one row of the table below, placed on the night&apos;s clock. Same colour for every row: the table has the details.</figcaption></figure>;
}
const TABS1 = [["proc", "Process list"], ["logins", "Login history"], ["net", "Network activity"], ["mail", "Mail and downloads"], ["chat", "Chat transcript"]] as const;
export function Inject1({ c }: { c: I1 }) {
  const [tab, setTab] = useState<(typeof TABS1)[number][0]>("proc"), base = useId();
  const count: Record<(typeof TABS1)[number][0], string> = { proc: `${c.processes.length} processes at 02:14`, logins: `${c.logins.length} entries · 12 h`, net: `${c.network.length} events · 21:00–02:30`, mail: `${c.mail.length} items`, chat: `${c.chat.length} lines · recorded` };
  const table = (cols: string[], rows: string[][]) => <table className="ij-table"><thead><tr>{cols.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={j === 0 ? "ij-mono" : undefined}>{v}</td>)}</tr>)}</tbody></table>;
  return <div className="ij ij-1">
    <section className="ij-incident" aria-label="Incident">
      <div className="ij-device" aria-hidden="true"><svg viewBox="0 0 64 44"><rect x="10" y="4" width="44" height="28" rx="2" /><rect x="14" y="8" width="36" height="20" className="ij-screen" /><path d="M4 36h56l-4 5H8z" /></svg><i className="ij-pulse" /></div>
      <div className="ij-incident-copy"><span className="ij-sev">{c.alert.severity}</span><h2>{c.alert.id} · {c.alert.host}</h2><p>{c.alert.observed}</p>
        <p className="ij-objective">Choose the first response. Use the five evidence tabs below, then answer on paper.</p></div>
    </section>
    <div className="ij-cols">
      <section className="ij-panel ij-evidence" aria-label="Evidence">
        <div role="tablist" aria-label="Evidence tabs" className="ij-tabs ij-tiles">{TABS1.map(([id, label]) => <button key={id} role="tab" id={`${base}-${id}`} aria-selected={tab === id} aria-controls={`${base}-p`} onClick={() => setTab(id)}><b>{label}</b><small>{count[id]}</small></button>)}</div>
        <div role="tabpanel" id={`${base}-p`} aria-labelledby={`${base}-${tab}`} className="ij-tabpanel">
          {tab === "proc" && <><p className="ij-note">Process list (snapshot at 02:14)</p>{table(["PID", "Process", "User", "Started", "CPU"], c.processes.map(p => [p.pid, p.name, p.user, p.started, p.cpu]))}</>}
          {tab === "logins" && <><p className="ij-note">Login history (last 12 hours)</p>{table(["Time", "Account", "Type", "Result"], c.logins.map(l => [l.time, l.account, l.type, l.result]))}</>}
          {tab === "net" && <><p className="ij-note">Network activity</p><NightStrip rows={c.network} />{table(["Time", "Destination", "Traffic"], c.network.map(n => [n.time, n.dest, n.traffic]))}</>}
          {tab === "mail" && <><p className="ij-note">Mail and downloads (ravi.k)</p>{table(["Time", "From", "Subject / file", "Notes"], c.mail.map(m => [m.when, m.from, m.subject, m.notes]))}</>}
          {tab === "chat" && <><p className="ij-note">Chat transcript with Ravi (recorded, read-only)</p><ol className="ij-chat">{c.chat.map((m, i) => <li key={i} className={m.from === "Ravi" ? "is-ravi" : "is-desk"}><b>{m.from}</b>{m.text}</li>)}</ol></>}
        </div>
      </section>
      <section className="ij-panel ij-options" aria-label="Response options"><h3>Response options</h3><p className="ij-note">All five are possible responses. Choose on paper, not here.</p>
        <ol className="ij-opts">{c.options.map(o => <li key={o.letter}><b>{o.letter}</b><span>{o.text}</span></li>)}</ol>
        <PaperNote items={c.paper} /></section>
    </div>
  </div>;
}

/* ---------------- Inject 3 · Audit the AI ---------------- */
export function Inject3({ c }: { c: I3 }) {
  const [claim, setClaim] = useState(1), [view, setView] = useState<"records" | "timeline">("records"), [rec, setRec] = useState("R-1"), base = useId();
  const r = c.records.find(x => x.id === rec)!;
  return <div className="ij ij-3">
    <p className="ij-brief"><b>SENTINEL-AI</b>, NEXUS’s AI assistant, has written an incident summary with eight claims. Decide which are true, which are false, and which cannot be proven.</p>
    <div className="ij-cols ij-cols-3">
      <section className="ij-panel ij-report" aria-label="SENTINEL-AI report"><h3>SENTINEL-AI says · 8 claims</h3>
        <ol className="ij-claims ij-claimnav">{c.claims.map(x => <li key={x.n}><button type="button" aria-pressed={claim === x.n} onClick={() => setClaim(x.n)} aria-label={`Claim ${x.n}, badge ${x.confidence}`}><b>{x.n}</b><span className="ij-conf">{x.confidence}</span></button></li>)}</ol>
        <article key={claim} className="ij-claimcard" aria-live="polite"><header><span className="ij-claim-n">Claim {claim} of {c.claims.length}</span><span className="ij-conf" aria-label={`Badge ${c.claims[claim - 1].confidence}`}>Badge {c.claims[claim - 1].confidence}</span></header><p className="ij-quote">{c.claims[claim - 1].text}</p>
          <div className="ij-claimstep"><button type="button" className="ij-link" disabled={claim === 1} onClick={() => setClaim(claim - 1)}>← Previous claim</button><button type="button" className="ij-link" disabled={claim === c.claims.length} onClick={() => setClaim(claim + 1)}>Next claim →</button></div></article>
        <PaperNote items={c.paper} /></section>
      <section className="ij-panel ij-sticky ij-verify" aria-label="Evidence">
        <div className="ij-focus"><span>Checking claim {claim}</span><p className="ij-quote">{c.claims[claim - 1].text}</p></div>
        <div role="tablist" aria-label="Evidence views" className="ij-tabs"><button role="tab" id={`${base}-r`} aria-selected={view === "records"} aria-controls={`${base}-v`} onClick={() => setView("records")}>Case file extracts</button><button role="tab" id={`${base}-t`} aria-selected={view === "timeline"} aria-controls={`${base}-v`} onClick={() => setView("timeline")}>Night timeline</button></div>
        <div role="tabpanel" id={`${base}-v`} aria-labelledby={`${base}-${view === "records" ? "r" : "t"}`} className="ij-tabpanel">
          {view === "records" ? <>
            <div className="ij-chips" role="group" aria-label="Records">{c.records.map(x => <button key={x.id} type="button" aria-pressed={rec === x.id} onClick={() => setRec(x.id)}>{x.id}</button>)}</div>
            <article className="ij-record" aria-label={`Record ${r.id}`}><header><b>{r.id}</b></header><p><b>{r.text.slice(0, r.text.indexOf(": "))}:</b> {r.text.slice(r.text.indexOf(": ") + 2)}</p></article>
          </> : <><p className="ij-note">Night timeline (all times IST, Monday night to Tuesday morning)</p><ol className="ij-tl">{c.timeline.map(t => <li key={t.n}><time>{t.time}</time><span>{t.event}</span></li>)}</ol></>}
        </div>
      </section>
    </div>
  </div>;
}

/* ---------------- Inject 4 · The Three Calls ---------------- */
export function Inject4({ c }: { c: I4 }) {
  const [call, setCall] = useState(1), cur = c.calls[call - 1]; // call 4 = the public statement board
  const ring = (n: number): ReactNode => <span className="ij-call-ic" aria-hidden="true">{n === call ? "☎" : "✆"}</span>;
  return <div className="ij ij-4">
    <dl className="ij-status" aria-label="Incident status">{c.status.map(s => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}</dl>
    <div className="ij-cols ij-cols-4">
      <nav className="ij-calls" aria-label="CEO calls">{c.calls.map(x => <button key={x.n} type="button" aria-pressed={call === x.n} onClick={() => setCall(x.n)}>{ring(x.n)}<span><b>Call {x.n} · {x.title}</b><small>“{x.ceo}”</small></span></button>)}
        <button type="button" aria-pressed={call === 4} onClick={() => setCall(4)}><span className="ij-call-ic" aria-hidden="true">✎</span><span><b>Public statement</b><small>choose two sentences</small></span></button></nav>
      {call <= c.calls.length ? <section key={cur.n} className="ij-panel ij-call" aria-label={`Call ${cur.n}: ${cur.title}`}>
        <header><span className="ij-live">INCOMING · CEO</span><h3>Call {cur.n} · {cur.title}</h3><blockquote>“{cur.ceo}”</blockquote></header>
        <ol className="ij-opts">{cur.options.map(o => <li key={o.letter}><b>{o.letter}</b><span>{o.text}</span></li>)}</ol>
        <p className="ij-note"><span aria-hidden="true">✎</span> Write the letter and one line of reasoning on paper. Nothing here is selected or sent.</p>
      </section> : <section className="ij-panel ij-call ij-statement" aria-label="Public statement"><header><span className="ij-live">DRAFT · PUBLIC STATEMENT</span><h3>Public statement: choose two sentences</h3></header><p className="ij-note">Write the numbers of your two sentences on paper.</p>
        <ol className="ij-sentences">{c.statements.map(s => <li key={s.n}><b>{s.n}</b><span className="ij-quote">{s.text}</span></li>)}</ol></section>}
    </div>
    <PaperNote items={c.paper} />
  </div>;
}
