"use client";
/* Evidence visuals shared by the chapter desks. Presentation only: every input is data the player can already see, or a choice the player made.
   Nothing here decides what is correct; links are drawn only between records the player pinned/selected. */
import type { ReactNode } from "react";
import { useMemo } from "react";

export type Tone = "ok" | "alert" | "amber" | "info" | "neutral";
export type TLItem = { id: string; at: string; lane: string; tone?: Tone; hint?: string };

/** Time-ordered lanes (one per record/event type). Markers sit at their real timestamp; the connector joins only the `linked` ids, in time order. */
export function ActivityTimeline({ label, items, selectedId, marked = [], linked = [], highlight = [], onSelect, note }: {
  label: string; items: TLItem[]; selectedId?: string; marked?: readonly string[]; linked?: readonly string[]; highlight?: readonly string[]; onSelect: (id: string) => void; note?: ReactNode;
}) {
  const model = useMemo(() => {
    const rows = items.map(i => ({ ...i, t: Date.parse(i.at) })).filter(i => Number.isFinite(i.t));
    const lanes = [...new Set(rows.map(r => r.lane))].sort();
    const min = Math.min(...rows.map(r => r.t)), max = Math.max(...rows.map(r => r.t)), span = max - min;
    const pos = (t: number) => (span ? ((t - min) / span) * 100 : 50);
    return { rows, lanes, min, max, pos };
  }, [items]);
  if (model.rows.length === 0) return <p className="k-empty">No events to plot.</p>;
  const { rows, lanes, pos } = model;
  const hh = (t: number) => new Date(t).toISOString().slice(11, 19);
  const line = linked.map(id => rows.find(r => r.id === id)).filter((r): r is (typeof rows)[number] => !!r).sort((a, b) => a.t - b.t);
  return <figure className="ds-tl" aria-label={label}>
    <div className="ds-tl-body">
      <div className="ds-tl-lanes" aria-hidden="true">{lanes.map(l => <span key={l}>{l}</span>)}</div>
      <div className="ds-tl-track" style={{ height: lanes.length * 36 }}>
        {lanes.map((l, i) => <i className="ds-tl-lane" key={l} style={{ top: i * 36, height: 36 }} />)}
        {line.length > 1 && <svg className="ds-tl-link" viewBox={`0 0 100 ${lanes.length}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={line.map(r => `${pos(r.t)},${lanes.indexOf(r.lane) + 0.5}`).join(" ")} /></svg>}
        {rows.map(r => <button type="button" key={r.id} tabIndex={r.id === selectedId ? 0 : -1} aria-pressed={r.id === selectedId} aria-label={`Timeline marker ${r.id}, ${r.lane}, ${hh(r.t)}${r.hint ? `, ${r.hint}` : ""}`}
          className={`ds-tl-dot is-${r.tone ?? "neutral"}${r.id === selectedId ? " is-selected" : ""}${marked.includes(r.id) ? " is-marked" : ""}${highlight.includes(r.id) ? " is-hl" : ""}`}
          style={{ left: `${pos(r.t)}%`, top: lanes.indexOf(r.lane) * 36 + 18 }} onClick={() => onSelect(r.id)} />)}
      </div>
    </div>
    <figcaption><span className="k-mono">{hh(model.min)}</span><span>{note ?? "Markers are placed by timestamp. Select one to inspect it."}</span><span className="k-mono">{hh(model.max)}</span></figcaption>
  </figure>;
}

export type Stage = { id: string; label: string; sub?: string; state: "done" | "partial" | "filled" | "open"; href?: string };
/** Horizontal workflow rail. State comes from the team's own saved scores/drafts, never from a solution. */
export function StageRail({ label, stages }: { label: string; stages: Stage[] }) {
  const text = { done: "complete", partial: "partly scored", filled: "filled in", open: "not started" } as const;
  return <ol className="ds-rail" aria-label={label}>{stages.map((s, i) => <li key={s.id} className={`is-${s.state}`}>
    {s.href ? <a href={s.href} onClick={() => { const n = Number(s.href?.split("-")[1]); if (n) window.dispatchEvent(new CustomEvent("task-open", { detail: n })); }} aria-label={`Jump to stage ${i + 1}: ${s.label}, ${text[s.state]}`}><b aria-hidden="true">{s.state === "done" ? "✓" : i + 1}</b><span>{s.label}</span>{s.sub && <small>{s.sub}</small>}</a>
      : <div><b aria-hidden="true">{s.state === "done" ? "✓" : i + 1}</b><span>{s.label}</span>{s.sub && <small>{s.sub}</small>}</div>}
  </li>)}</ol>;
}

/** Evidence-category tally: how many of the team's linked records come from each earlier chapter. */
export function CategoryBar({ label, cats }: { label: string; cats: { name: string; used: number; total: number }[] }) {
  return <ul className="ds-cats" aria-label={label}>{cats.map(c => <li key={c.name} className={c.used ? "is-on" : ""}><span>{c.name}</span><b>{c.used}</b><small>of {c.total} records</small></li>)}</ul>;
}

/** Tiny pass/fail dots (decorative: the header text is in the viewer). */
export function AuthDots({ value }: { value: string }) {
  const parts = value.split(";").map(p => p.trim().split("=")).filter(p => p[0]);
  return <span className="ds-dots" aria-hidden="true">{parts.map(([k, v]) => <i key={k} className={v === "pass" ? "ok" : v === "fail" ? "bad" : "mid"} title={`${k} ${v ?? "?"}`} />)}</span>;
}
