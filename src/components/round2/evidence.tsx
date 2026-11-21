"use client";
import { useMemo, useState } from "react";
import type { R2Record } from "./types";

/** Searchable, filterable evidence browser. Evidence text is fictional but still rendered strictly as text (no HTML injection path). */
export function EvidenceBrowser({ records, title = "Evidence", open = true }: { records: R2Record[]; title?: string; open?: boolean }) {
  const [source, setSource] = useState("all"), [q, setQ] = useState("");
  const sources = useMemo(() => [...new Set(records.map(r => r.source))].sort(), [records]);
  const shown = records.filter(r => (source === "all" || r.source === source) && (!q || `${r.id} ${r.title} ${r.detail}`.toLowerCase().includes(q.toLowerCase())));
  return <details className="r2-panel" open={open}><summary><h3>{title} <span className="r2-count">{shown.length}/{records.length}</span></h3></summary>
    <div className="r2-filter" role="search"><label>Search<input type="search" value={q} maxLength={60} onChange={e => setQ(e.target.value)} placeholder="IP, host, account, id…" /></label>
      <div className="r2-chips" role="group" aria-label="Filter by source">{["all", ...sources].map(s => <button type="button" key={s} className={`r2-chipbtn ${source === s ? "is-on" : ""}`} aria-pressed={source === s} onClick={() => setSource(s)}>{s}</button>)}</div></div>
    <ul className="r2-records">{shown.map(r => <li key={r.id} className={`r2-rec src-${r.source.replace(/[^a-z]/g, "")}`}>
      <div className="r2-rec-head"><b className="r2-id">{r.id}</b><span className="r2-tag">{r.source}</span>{r.time !== "n/a" && <time className="r2-mono">{r.time}</time>}</div>
      <p className="r2-rec-title">{r.title}</p>{r.detail && <p className="r2-rec-detail">{r.detail}</p>}</li>)}
      {!shown.length && <li className="r2-empty">No records match.</li>}</ul></details>;
}
