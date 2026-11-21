"use client";
import { useState } from "react";
import { claimOf, useEvidence } from "./fields";
import { getAt, type Answer, type Field } from "@/lib/round2/form-types";
import type { R2Record } from "./types";

const IP = /^\d+\.\d+\.\d+\.\d+$/;
export type Conn = { id: string; src: string; dst: string; port: string; inbound: boolean; bytes: number; record: R2Record };
const UNIT = { KB: 1e3, MB: 1e6, GB: 1e9 } as const;
export function parseConn(r: R2Record): Conn | null {
  const m = /^(\S+) to (\S+?)(?::(\d+\/\w+))?( \(inbound\))?$/.exec(r.title);
  if (!m) return null;
  const b = /(?:Out|In) ([\d.,]+) (KB|MB|GB)/.exec(r.detail);
  return { id: r.id, src: m[1], dst: m[2], port: m[3] ?? "", inbound: !!m[4], bytes: b ? parseFloat(b[1].replace(/,/g, "")) * UNIT[b[2] as keyof typeof UNIT] : 0, record: r };
}
const isExternal = (n: string) => IP.test(n);

/** Incident 2: network map of every connection, with a full table as the accessible alternative. Marks are drafts of the real task answers. */
export function NetworkMap({ records, malicious, blocked, disabled, onMark, onBlock }: { records: R2Record[]; malicious: string[]; blocked: string[]; disabled: boolean; onMark: (id: string) => void; onBlock: (id: string) => void }) {
  const conns = records.map(parseConn).filter((c): c is Conn => !!c);
  const [active, setActive] = useState<string | null>(conns[0]?.id ?? null);
  const nodes = (side: boolean) => [...new Set(conns.flatMap(c => [c.src, c.dst]).filter(n => isExternal(n) === side))];
  const left = nodes(false), right = nodes(true), H = Math.max(left.length, right.length) * 44 + 40;
  const y = (list: string[], n: string) => 30 + (list.indexOf(n) + 0.5) * ((H - 40) / list.length);
  const pos = (n: string) => isExternal(n) ? { x: 600, y: y(right, n) } : { x: 160, y: y(left, n) };
  const cur = conns.find(c => c.id === active);
  return <section className="r2-panel r2-net" aria-label="Network connections">
    <h3>Connection map <span className="r2-count">{conns.length} connections</span></h3>
    <p className="r2-meta">Internal systems on the left, external endpoints on the right. Line weight follows bytes transferred. The table below has every detail and the same controls.</p>
    <div className="r2-svgscroll"><svg viewBox={`0 0 760 ${H}`} className="r2-svg" aria-hidden="true" focusable="false">
      <defs><marker id="r2arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="currentColor" /></marker></defs>
      <text x="160" y="14" className="r2-svg-h" textAnchor="middle">INTERNAL</text><text x="600" y="14" className="r2-svg-h" textAnchor="middle">EXTERNAL</text>
      {conns.map(c => { const a = pos(c.src), b = pos(c.dst), w = 1.5 + Math.min(4.5, Math.log10(Math.max(c.bytes, 1e3)) - 3) , mid = (a.x + b.x) / 2;
        const cls = `r2-edge ${malicious.includes(c.id) ? "is-mal" : ""} ${blocked.includes(c.id) ? "is-blocked" : ""} ${active === c.id ? "is-active" : ""}`;
        return <g key={c.id} className={cls} onClick={() => setActive(c.id)}><path d={`M${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`} strokeWidth={w} fill="none" markerEnd="url(#r2arrow)" /><text x={mid} y={(a.y + b.y) / 2 - 4} textAnchor="middle" className="r2-svg-id">{c.id}</text></g>; })}
      {[...left, ...right].map(n => { const p = pos(n); return <g key={n} className="r2-node"><rect x={p.x - 70} y={p.y - 13} width="140" height="26" rx="5" /><text x={p.x} y={p.y + 4} textAnchor="middle">{n}</text></g>; })}
    </svg></div>
    {cur && <div className="r2-inspect" role="region" aria-label={`Inspecting ${cur.id}`}><b className="r2-id">{cur.id}</b> <span className="r2-mono">{cur.src} → {cur.dst}{cur.port && `:${cur.port}`}</span> <span className="r2-tag">{cur.inbound ? "inbound" : "outbound"}</span><p>{cur.record.detail}</p><small className="r2-meta">Observed {cur.record.time}</small></div>}
    <div className="r2-tablewrap"><table className="r2-table"><caption className="r2-sr">All ten connections with traffic metadata and decisions</caption>
      <thead><tr><th scope="col">ID</th><th scope="col">Source → destination</th><th scope="col">Traffic and process</th><th scope="col">Malicious?</th><th scope="col">BLOCK (sim.)</th></tr></thead>
      <tbody>{conns.map(c => <tr key={c.id} className={active === c.id ? "is-active" : ""}>
        <th scope="row"><button type="button" className="r2-linkbtn r2-id" onClick={() => setActive(c.id)} aria-label={`Inspect ${c.id}`}>{c.id}</button></th>
        <td className="r2-mono">{c.src} → {c.dst}{c.port && `:${c.port}`}{c.inbound ? " (in)" : ""}</td><td>{c.record.detail}</td>
        <td><label className="r2-check"><input type="checkbox" disabled={disabled} checked={malicious.includes(c.id)} onChange={() => onMark(c.id)} /><span className="r2-sr">Mark {c.id} malicious</span><span aria-hidden="true">{malicious.includes(c.id) ? "Marked" : "Mark"}</span></label></td>
        <td><label className="r2-check"><input type="checkbox" disabled={disabled} checked={blocked.includes(c.id)} onChange={() => onBlock(c.id)} /><span className="r2-sr">Queue simulated BLOCK for {c.id}</span><span aria-hidden="true">{blocked.includes(c.id) ? "Queued" : "Queue"}</span></label></td></tr>)}</tbody></table></div>
    <div className="r2-lists"><div><h4>Marked malicious ({malicious.length})</h4><p className="r2-mono">{malicious.join(", ") || "none"}</p></div><div><h4>Simulated BLOCK queue ({blocked.length})</h4><p className="r2-mono">{blocked.map(b => `BLOCK ${b}`).join(", ") || "empty"}</p><small className="r2-meta">Simulation only: no command is ever executed.</small></div></div>
  </section>;
}

/** Incident 3: the untrusted AI report beside its claims, with the participant's current verdicts shown. */
export function AiReportPanel({ working, verdictFields }: { working: Answer; verdictFields: Field[] }) {
  const { records } = useEvidence(), head = records.get("AI-REPORT");
  return <aside className="r2-ai" aria-label="AI-generated report, untrusted">
    <p><span className="r2-tag r2-tag-ai">UNTRUSTED · AI-GENERATED</span> <small className="r2-meta">{head?.title}</small></p>
    {["A", "B", "C"].map(l => { const v = getAt(working, verdictFields.find(f => f.path[1] === l)?.path ?? []) as string | undefined;
      return <blockquote key={l} className="r2-claim"><b>Claim {l}</b> {claimOf(records, l)}<span className={`r2-chip ${v ? "" : "is-muted"}`}>{v ? `Your verdict: ${v}` : "No verdict yet"}</span></blockquote>; })}
    <p className="r2-meta">An AI report is a lead, not evidence. Only the retained primary records (right) can confirm or contradict a claim.</p></aside>;
}

/** Part B1: events grouped by source lane with the clock each source logged in. Normalized UTC is deliberately NOT shown. */
export function ForensicLanes({ records, order }: { records: R2Record[]; order: string[] | undefined }) {
  const events = records.filter(r => r.id.startsWith("EV-")), lanes = [...new Set(events.map(e => e.source))].sort();
  return <section className="r2-panel" aria-label="Events by source"><h3>Events by source clock <span className="r2-count">{events.length}</span></h3>
    <p className="r2-meta">Each source stamped its events on its own clock. Normalize them before ordering.</p>
    <div className="r2-lanes">{lanes.map(l => <div key={l} className="r2-lane"><h4>{l}</h4><ul>{events.filter(e => e.source === l).map(e => <li key={e.id}><b className="r2-id">{e.id}</b> <span className="r2-mono">{e.time}</span><span>{e.title}</span>{order && <small className="r2-meta">your position {order.indexOf(e.id) + 1}</small>}</li>)}</ul></div>)}</div></section>;
}

/** Part B2: evidence links between records and hypotheses, as an accessible matrix. */
export function HypothesisMatrix({ working, bestField, elimFields }: { working: Answer; bestField: Field; elimFields: Field[] }) {
  const best = getAt(working, bestField.path) as string | undefined, support = (getAt(working, ["supportIds"]) as string[] | undefined) ?? [];
  const refutes = Object.fromEntries(["H1", "H2", "H3"].map(h => [h, (getAt(working, ["eliminate", h]) as string[] | undefined) ?? []])) as Record<string, string[]>;
  const rows = [...new Set([...support, ...Object.values(refutes).flat()])];
  void elimFields;
  return <section className="r2-panel" aria-label="Evidence links"><h3>Evidence links <span className="r2-count">{rows.length} records linked</span></h3>
    {rows.length ? <div className="r2-tablewrap"><table className="r2-table"><thead><tr><th scope="col">Record</th>{["H1", "H2", "H3", "H4"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(r => <tr key={r}><th scope="row" className="r2-id">{r}</th>{["H1", "H2", "H3", "H4"].map(h => { const supports = h === best && support.includes(r), refutesIt = refutes[h]?.includes(r);
        return <td key={h} aria-label={`${r} ${supports ? "supports" : refutesIt ? "refutes" : "not linked to"} ${h}`}>{supports ? <span className="r2-link ok">● supports</span> : refutesIt ? <span className="r2-link no">✕ refutes</span> : <span className="r2-faint">–</span>}</td>; })}</tr>)}</tbody></table></div>
      : <p className="r2-meta">Choose a hypothesis and link records to see the evidence matrix. Nothing here is graded; it only mirrors your selections.</p>}</section>;
}

/** Part B3: each bulletin claim next to the verification record the participant picked. Claim and source are visibly different things. */
export function IntelBoard({ working, gradeFields }: { working: Answer; gradeFields: Field[] }) {
  const { records } = useEvidence();
  return <section className="r2-panel" aria-label="Intelligence bulletin"><h3>Bulletin claims vs. retained evidence</h3>
    <ul className="r2-intel">{gradeFields.map(f => { const id = f.ref!, r = records.get(id), g = getAt(working, f.path) as string | undefined, src = getAt(working, ["refutations", id]) as string | undefined, s = src ? records.get(src) : undefined;
      return <li key={id}><div className="r2-intel-claim"><span className="r2-tag r2-tag-ai">CLAIM · {r?.source}</span><p><b className="r2-id">{id}</b> {r?.detail}</p><span className="r2-chip">{g ?? "ungraded"}</span></div>
        <div className="r2-intel-src"><span className="r2-tag r2-tag-ok">SOURCE</span>{s ? <p><b className="r2-id">{s.id}</b> {s.title}</p> : <p className="r2-faint">{["INT-2", "INT-4", "INT-5"].includes(id) ? "No verification record chosen" : "Source verification not required for this item"}</p>}</div></li>; })}</ul></section>;
}

/** Part B4: readable preview built only from the participant's own structured choices. */
export function ReportPreview({ fieldsByTask, workingByTask }: { fieldsByTask: Record<string, Field[]>; workingByTask: Record<string, Answer> }) {
  const text = (task: string, path: string[]) => { const f = fieldsByTask[task]?.find(x => x.path.join() === path.join()), v = getAt(workingByTask[task] ?? {}, path);
    const name = (id: string) => f?.options?.find(o => o.id === id)?.text ?? id; return Array.isArray(v) ? v.map(x => name(String(x))) : typeof v === "string" ? [name(v)] : []; };
  const sec: [string, string[]][] = [["Confirmed facts", text("b4.facts", ["factIds"])], ["Attribution", [...text("b4.attribution", ["level"])]], ["Attribution limits", text("b4.attribution", ["reasons"])], ["Containment", text("b4.plan", ["containment"])], ["Evidence preservation", text("b4.plan", ["preservation"])], ["Recovery gating", text("b4.plan", ["recovery"])], ["Regulator", text("b4.comms", ["regulator"])], ["Suppliers", text("b4.comms", ["suppliers"])]];
  return <section className="r2-panel r2-report" aria-label="Report preview"><h3>Command brief preview</h3><p className="r2-meta">Assembled from your current selections. Only the structured choices are scored.</p>
    {sec.map(([h, items]) => <div key={h}><h4>{h}</h4>{items.length ? <ul>{items.map(i => <li key={i}>{i}</li>)}</ul> : <p className="r2-faint">Not decided yet</p>}</div>)}</section>;
}

/** Part A4: dependency chain of the participant's current restoration order. */
export function DependencyChain({ order, labelOf }: { order: string[] | undefined; labelOf: (id: string) => string }) {
  return <section className="r2-panel" aria-label="Restoration chain"><h3>Restoration chain</h3>
    {order ? <ol className="r2-chain">{order.map((id, i) => <li key={id}><span className="r2-pos">{i + 1}</span>{labelOf(id)}</li>)}</ol> : <p className="r2-meta">Set an order below to see your restoration chain. Each step must be safe given what came before it.</p>}</section>;
}
