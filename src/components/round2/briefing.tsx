"use client";
/* Round 2 presentation aids. Read-only views of server state and of records the team can already see; no scoring or timing logic lives here. */
import { useState, useSyncExternalStore } from "react";
const subscribe = () => () => {};
import { formatClock } from "@/lib/round2/client-clock";
import type { R2Record } from "./types";

export type TLNode = { key: string; label: string; title: string; atMs: number; state: string; earned: number; max: number; etaMs: number | null };
const TOTAL = 50 * 60_000;

/** The whole 50-minute round on one line: four incident releases, the Part B opening and the end. The server clock drives every value. */
export function RoundTimeline({ nodes, elapsedMs, phase, nextText }: { nodes: TLNode[]; elapsedMs: number; phase: string; nextText: string }) {
  const live = useSyncExternalStore(subscribe, () => true, () => false); // countdowns depend on the browser clock: render them only after hydration
  const eta = (n: TLNode) => (live ? n.etaMs : null);
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / TOTAL) * 100))}%`;
  return <section className="r2-tl" aria-label="Round timeline" data-phase={phase}>
    <div className="r2-tl-bar" aria-hidden="true"><i className="r2-tl-a" /><i className="r2-tl-b" /><i className="r2-tl-now" style={{ left: live ? pct(elapsedMs) : "0%" }} />
      {nodes.map(n => <i key={n.key} className={`r2-tl-pin is-${n.state.replace(" ", "-")}`} style={{ left: pct(n.atMs) }} />)}</div>
    <ol className="r2-tl-list">{nodes.map(n => <li key={n.key} style={{ "--x": pct(n.atMs) } as React.CSSProperties} aria-label={`${n.title}: ${n.state}${eta(n) !== null ? `, releases in ${formatClock(eta(n)!)}` : `, ${n.earned} of ${n.max} points`}`} className={`is-${n.state.replace(" ", "-")}`}>
      <b>{n.label}</b><span>{n.state === "not released" ? (eta(n) !== null ? `in ${formatClock(eta(n)!)}` : "pending") : `${n.earned}/${n.max}`}</span></li>)}</ol>
    <p className="r2-tl-next" role="note">{live ? nextText : "Loading schedule…"}</p>
  </section>;
}

const secs = (t: string) => { const m = /^(\d\d):(\d\d)(?::(\d\d))?/.exec(t); return m ? +m[1] * 3600 + +m[2] * 60 + +(m[3] ?? 0) : null; };
const gap = (a: number, b: number) => { const d = Math.abs(a - b); return `${String(Math.floor(d / 60)).padStart(2, "0")}:${String(d % 60).padStart(2, "0")}`; };

/** Side-by-side comparison of any two records already released to the team. It states only facts (same/different source, time gap); it never says which record is right. */
export function ComparePanel({ records }: { records: R2Record[] }) {
  const [a, setA] = useState(""), [b, setB] = useState("");
  const ra = records.find(r => r.id === a), rb = records.find(r => r.id === b);
  const ta = ra ? secs(ra.time) : null, tb = rb ? secs(rb.time) : null;
  const opt = (v: string, set: (s: string) => void, label: string) => <label>{label}<select value={v} onChange={e => set(e.target.value)}><option value="">Choose a record…</option>{records.map(r => <option key={r.id} value={r.id}>{r.id} · {r.title}</option>)}</select></label>;
  const col = (r: R2Record | undefined, other: R2Record | undefined) => r ? <article className="r2-cmp-col"><span className="r2-tag">{r.source}</span><b className="r2-id">{r.id}</b><h4>{r.title}</h4>
    <p className="r2-mono">{r.time === "n/a" ? "no timestamp" : r.time}</p><p>{r.detail}</p>{other && other.source === r.source && <small>same source as the other record</small>}</article> : <article className="r2-cmp-col is-empty"><p>Pick a record.</p></article>;
  return <details className="r2-panel r2-cmp" open><summary><h3>Compare two records</h3></summary>
    <div className="r2-cmp-pick">{opt(a, setA, "Record A")}{opt(b, setB, "Record B")}</div>
    <div className="r2-cmp-grid">{col(ra, rb)}{col(rb, ra)}</div>
    {ra && rb && <p className="r2-cmp-facts" role="status">{ra.source === rb.source ? "Same source." : `Different sources: ${ra.source} and ${rb.source}.`} {ta !== null && tb !== null ? `Time gap ${gap(ta, tb)}.` : "At least one record has no clock time."}</p>}
  </details>;
}
