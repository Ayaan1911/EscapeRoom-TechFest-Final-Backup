"use client";
import { useId, useState } from "react";
import type { Ch1, Ch2, Ch3, Ch4, Conn } from "@/lib/round2/paper/types";

// READ-ONLY chapter views. There is no <form>, no submit, no text field that leaves the page: answers are written on paper.
const PAPER = "Write your answer on paper.";

/** Chapter 1: incident-response alert console. */
export function AlertDesk({ c }: { c: Ch1 }) {
  const [tab, setTab] = useState(c.tabs[0].id), base = useId(), cur = c.tabs.find(t => t.id === tab)!;
  return <div className="rp-alert">
    <section className="rp-alertcard" aria-label="Security alert"><span className="rp-sev">{c.alert.severity}</span><div><b>{c.alert.id} · {c.alert.host}</b><p>{c.alert.summary}</p></div><time>{c.alert.time}</time></section>
    <div className="rp-alert-grid">
      <section className="rp-panel rp-evid" aria-label="Evidence tabs">
        <div role="tablist" aria-label="Evidence" className="rp-tabs">{c.tabs.map(t => <button key={t.id} role="tab" id={`${base}-${t.id}`} aria-selected={t.id === tab} aria-controls={`${base}-panel`} className={t.id === tab ? "is-on" : ""} onClick={() => setTab(t.id)}>{t.title}</button>)}</div>
        <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-${tab}`} tabIndex={0} className="rp-tablewrap">
          {cur.note && <p className="rp-note">{cur.note}</p>}
          <table className="rp-table"><thead><tr>{cur.columns.map(k => <th key={k.key} scope="col">{k.label}</th>)}</tr></thead>
            <tbody>{cur.rows.map((r, i) => <tr key={i}>{cur.columns.map(k => <td key={k.key}>{r[k.key]}</td>)}</tr>)}</tbody></table>
        </div>
      </section>
      <aside className="rp-side">
        <section className="rp-panel" aria-label="Chat with Ravi"><h3>Chat · Ravi (Finance)</h3><ol className="rp-chat">{c.chat.map((m, i) => <li key={i} className={m.from === "ravi" ? "is-ravi" : "is-you"}><b>{m.from === "ravi" ? "Ravi" : "Responder"}</b>{m.text}</li>)}</ol><small>Recorded transcript. You cannot reply.</small></section>
        <section className="rp-panel" aria-label="Response options"><h3>Response options</h3><ol className="rp-opts">{c.options.map(o => <li key={o.letter}><b>{o.letter}</b>{o.text}</li>)}</ol><small>{PAPER} Letter, two evidence points, one line of reasoning.</small></section>
      </aside>
    </div></div>;
}

function Spark({ series, tone }: { series: number[]; tone?: string }) {
  const max = Math.max(1, ...series);
  return <svg className={`rp-spark ${tone ?? ""}`} viewBox={`0 0 ${series.length * 4} 24`} role="img" aria-label="Traffic over time">{series.map((v, i) => <rect key={i} x={i * 4 + 0.5} width="3" y={24 - (v / max) * 22 - 1} height={(v / max) * 22 + 1} />)}</svg>;
}
/** Chapter 2: network monitor (read-only; no BLOCK command exists anywhere). */
export function NetworkMonitor({ c }: { c: Ch2 }) {
  const [sel, setSel] = useState<number | null>(null), [sort, setSort] = useState<"n" | "duration" | "sent">("n");
  const mb = (s: string) => { const m = /([\d.]+)\s*(GB|MB)/.exec(s); return m ? Number(m[1]) * (m[2] === "GB" ? 1024 : 1) : 0; };
  const rows = [...c.connections].sort((a, b) => sort === "sent" ? mb(b.sent) - mb(a.sent) : sort === "duration" ? b.series.filter(Boolean).length - a.series.filter(Boolean).length : a.n - b.n);
  const row = (k: Conn) => <tr key={k.n} className={sel === k.n ? "is-sel" : ""}>
    <td>{k.n}</td><td className="rp-mono">{k.ip}</td><td className="rp-mono">{k.process}</td><td>{k.country}</td><td>{k.sent}</td><td>{k.received}</td><td>{k.duration}</td><td><Spark series={k.series} /></td>
    <td><button className="rp-link" aria-pressed={sel === k.n} onClick={() => setSel(sel === k.n ? null : k.n)}>Inspect<span className="rp-sr"> connection {k.n}</span></button></td></tr>;
  const open = c.connections.find(k => k.n === sel);
  return <div className="rp-net">
    <p className="rp-readonly" role="note"><b>READ-ONLY</b> {c.brief} Nothing here can be blocked, changed or submitted.</p>
    <div className="rp-sort" role="group" aria-label="Sort connections">Sort <button aria-pressed={sort === "n"} onClick={() => setSort("n")}>#</button><button aria-pressed={sort === "sent"} onClick={() => setSort("sent")}>Data sent</button><button aria-pressed={sort === "duration"} onClick={() => setSort("duration")}>Active time</button></div>
    <div className="rp-panel rp-tablewrap" tabIndex={0} role="region" aria-label="Live connections"><table className="rp-table rp-conns"><thead><tr><th scope="col">#</th><th scope="col">IP address</th><th scope="col">Process</th><th scope="col">Country</th><th scope="col">Sent</th><th scope="col">Received</th><th scope="col">Duration</th><th scope="col">Traffic</th><th scope="col"><span className="rp-sr">Inspect</span></th></tr></thead><tbody>{rows.map(row)}</tbody></table></div>
    {open && <section className="rp-panel rp-detail" aria-live="polite" aria-label={`Connection ${open.n}`}><h3>Connection {open.n} · <span className="rp-mono">{open.ip}</span></h3><Spark series={open.series} tone="big" /><dl><div><dt>Process</dt><dd className="rp-mono">{open.process}</dd></div><div><dt>Country</dt><dd>{open.country}</dd></div><div><dt>Behaviour</dt><dd>{open.pattern}</dd></div><div><dt>Duration</dt><dd>{open.duration}</dd></div></dl></section>}
    <small>{PAPER} Two attacker-controlled IP addresses, your evidence, and why a convincing legitimate connection must not be blocked.</small>
  </div>;
}

/** Chapter 3: audit desk (report vs. timeline vs. evidence). */
export function AuditDesk({ c }: { c: Ch3 }) {
  return <div className="rp-audit">
    <section className="rp-panel rp-report" aria-label="SENTINEL-AI report"><header><b>SENTINEL-AI</b> incident summary <i>auto-generated</i></header>
      <ol>{c.claims.map(k => <li key={k.n}><span className="rp-claimn">{k.n}</span><p>{k.text}</p><em>{k.confidence}</em></li>)}</ol><small>{PAPER} TRUE or FALSE for each claim, plus one clue.</small></section>
    <section className="rp-panel rp-timeline" aria-label="Night timeline"><h3>Night timeline</h3><ol>{c.timeline.map((t, i) => <li key={i}><time>{t.time}</time><div><p>{t.event}</p>{t.note && <blockquote>{t.note}</blockquote>}</div></li>)}</ol></section>
    <section className="rp-panel rp-records" aria-label="Case file extracts"><h3>Case file extracts</h3><ul>{c.records.map(r => <li key={r.id}><span className="rp-id">{r.id}</span><b>{r.source}</b><p>{r.text}</p></li>)}</ul><small>Chapters 1 and 2 are closed. Use these records, the timeline and your own notes.</small></section>
  </div>;
}

/** Chapter 4: three executive calls and a public statement. */
export function CallsDesk({ c }: { c: Ch4 }) {
  return <div className="rp-calls">
    <section className="rp-board" aria-label="Situation board">{c.situation.map(s => <div key={s.label}><span>{s.label}</span><b>{s.value}</b></div>)}</section>
    <div className="rp-callgrid">{c.calls.map(k => <section key={k.n} className="rp-call" aria-label={`Call ${k.n}`}><header><span className="rp-ring" aria-hidden="true">☎</span><div><small>CALL {k.n} OF 3 · {k.title.toUpperCase()}</small><h3>{k.question}</h3></div></header><blockquote>{k.pressure}</blockquote>
      <ol className="rp-opts">{k.options.map(o => <li key={o.letter}><b>{o.letter}</b>{o.text}</li>)}</ol></section>)}</div>
    <section className="rp-panel rp-statement" aria-label="Public statement"><h3>Public statement · choose two sentences</h3><ol>{c.statements.map(s => <li key={s.n}><b>{s.n}</b>“{s.text}”</li>)}</ol><small>{PAPER} Your three letters with one line of reasoning each, and the numbers of your two sentences.</small></section>
  </div>;
}
