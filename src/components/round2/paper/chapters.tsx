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

export function Spark({ series, tone }: { series: number[]; tone?: string }) {
  const max = Math.max(1, ...series);
  return <svg className={`rp-spark ${tone ?? ""}`} viewBox={`0 0 ${series.length * 4} 24`} role="img" aria-label="Traffic over time">{series.map((v, i) => <rect key={i} x={i * 4 + 0.5} width="3" y={24 - (v / max) * 22 - 1} height={(v / max) * 22 + 1} />)}</svg>;
}
const mbOf = (v: string) => { const m = /([\d.]+)\s*(GB|MB|KB)/.exec(v); return m ? Number(m[1]) * (m[2] === "GB" ? 1024 : m[2] === "KB" ? 1 / 1024 : 1) : 0; };
/** Connection map: the monitor's own ten connections around the NEXUS network. Size = data sent, line weight = active time. Nothing is colour-coded by suspicion. */
export function ConnMap({ conns, sel, onSelect }: { conns: Conn[]; sel: number | null; onSelect: (n: number | null) => void }) {
  const maxSent = Math.max(1, ...conns.map(k => mbOf(k.sent))), maxActive = Math.max(1, ...conns.map(k => k.series.filter(Boolean).length));
  const pos = (i: number) => { const a = (-90 + (i * 360) / conns.length) * Math.PI / 180; return { x: 50 + 38 * Math.cos(a), y: 28 + 20 * Math.sin(a) }; };
  return <figure className="rp-map"><svg viewBox="0 0 100 56" role="group" aria-label="Connection map. Select a connection to inspect it.">
    {conns.map((k, i) => { const q = pos(i), w = 0.15 + 0.85 * (k.series.filter(Boolean).length / maxActive); return <line key={`l${k.n}`} x1="50" y1="28" x2={q.x} y2={q.y} strokeWidth={w} className={sel === k.n ? "is-sel" : ""} />; })}
    <g className="rp-hub" aria-hidden="true"><circle cx="50" cy="28" r="6" /><text x="50" y="27.6" textAnchor="middle">NEXUS</text><text x="50" y="30.6" textAnchor="middle">network</text></g>
    {conns.map((k, i) => { const q = pos(i), r = 2 + 3.4 * Math.sqrt(mbOf(k.sent) / maxSent);
      return <g key={k.n} className={`rp-node ${sel === k.n ? "is-sel" : ""}`} role="button" tabIndex={0} aria-pressed={sel === k.n} aria-label={`Connection ${k.n}, ${k.ip}, ${k.sent} sent`} onClick={() => onSelect(sel === k.n ? null : k.n)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(sel === k.n ? null : k.n); } }}>
        <circle cx={q.x} cy={q.y} r={r + 1.6} className="rp-hit" /><circle cx={q.x} cy={q.y} r={r} /><text x={q.x} y={q.y + 0.9} textAnchor="middle">{k.n}</text></g>; })}
  </svg><figcaption>Node size = data sent · line weight = active time · the table below has the exact figures</figcaption></figure>;
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
    <ConnMap conns={c.connections} sel={sel} onSelect={setSel} />
    <div className="rp-panel rp-tablewrap" tabIndex={0} role="region" aria-label="Live connections"><table className="rp-table rp-conns"><thead><tr><th scope="col">#</th><th scope="col">IP address</th><th scope="col">Process</th><th scope="col">Country</th><th scope="col">Sent</th><th scope="col">Received</th><th scope="col">Duration</th><th scope="col">Traffic</th><th scope="col"><span className="rp-sr">Inspect</span></th></tr></thead><tbody>{rows.map(row)}</tbody></table></div>
    {open && <section className="rp-panel rp-detail" aria-live="polite" aria-label={`Connection ${open.n}`}><h3>Connection {open.n} · <span className="rp-mono">{open.ip}</span></h3><Spark series={open.series} tone="big" /><dl><div><dt>Process</dt><dd className="rp-mono">{open.process}</dd></div><div><dt>Country</dt><dd>{open.country}</dd></div><div><dt>Behaviour</dt><dd>{open.pattern}</dd></div><div><dt>Duration</dt><dd>{open.duration}</dd></div></dl></section>}
    <small>{PAPER} Two attacker-controlled IP addresses, your evidence, and why a convincing legitimate connection must not be blocked.</small>
  </div>;
}

/** Chapter 3: split-screen audit. Left: the AI's claims. Right: the independent record (timeline + case file) with search. The "checked" ticks are only a memory aid on this screen: nothing is stored or sent. */
export function AuditDesk({ c }: { c: Ch3 }) {
  const [side, setSide] = useState<"timeline" | "records">("timeline"), [q, setQ] = useState(""), [done, setDone] = useState<number[]>([]), base = useId();
  const hit = (t: string) => !q.trim() || t.toLowerCase().includes(q.trim().toLowerCase());
  const tl = c.timeline.filter(t => hit(`${t.time} ${t.event} ${t.note ?? ""}`)), rec = c.records.filter(r => hit(`${r.id} ${r.source} ${r.text}`));
  return <div className="rp-audit">
    <section className="rp-panel rp-report" aria-label="SENTINEL-AI report"><header><b>SENTINEL-AI</b> incident summary <i>auto-generated</i></header>
      <ol>{c.claims.map(k => <li key={k.n} className={done.includes(k.n) ? "is-checked" : ""}><span className="rp-claimn">{k.n}</span><p>{k.text}</p><em>{k.confidence}</em>
        <label className="rp-check"><input type="checkbox" checked={done.includes(k.n)} onChange={() => setDone(d => d.includes(k.n) ? d.filter(x => x !== k.n) : [...d, k.n])} /> I have checked this claim <span className="rp-sr">{k.n}</span></label></li>)}</ol>
      <small>{PAPER} TRUE or FALSE for each claim, plus one clue. Ticks are a reminder for you only; nothing here is sent.</small></section>
    <section className="rp-panel rp-source" aria-label="Independent record">
      <div className="rp-sourcebar"><div role="tablist" aria-label="Independent record" className="rp-tabs"><button role="tab" id={`${base}-t`} aria-selected={side === "timeline"} className={side === "timeline" ? "is-on" : ""} onClick={() => setSide("timeline")}>Night timeline</button><button role="tab" id={`${base}-r`} aria-selected={side === "records"} className={side === "records" ? "is-on" : ""} onClick={() => setSide("records")}>Case file extracts</button></div>
        <label className="rp-search">Search the record<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="time, host, user, ID" /></label></div>
      <p className="rp-count" role="status">{side === "timeline" ? `${tl.length} of ${c.timeline.length} timeline entries` : `${rec.length} of ${c.records.length} extracts`}</p>
      {side === "timeline" ? <section aria-label="Night timeline" role="tabpanel" aria-labelledby={`${base}-t`}><ol className="rp-tl">{tl.map((t, i) => <li key={i}><time>{t.time}</time><div><p>{t.event}</p>{t.note && <blockquote>{t.note}</blockquote>}</div></li>)}</ol>{tl.length === 0 && <p className="rp-empty">No timeline entries match.</p>}</section>
        : <section aria-label="Case file extracts" role="tabpanel" aria-labelledby={`${base}-r`}><ul className="rp-rec">{rec.map(r => <li key={r.id}><span className="rp-id">{r.id}</span><b>{r.source}</b><p>{r.text}</p></li>)}</ul>{rec.length === 0 && <p className="rp-empty">No extracts match.</p>}<small>Chapters 1 and 2 are closed. Use these records, the timeline and your own notes.</small></section>}
    </section>
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
