"use client";
/* Evidence visuals shared by the chapter desks. Presentation only: every input is data the player can already see, or a choice the player made.
   Nothing here decides what is correct; links are drawn only between records the player pinned/selected. */
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

export type Tone = "ok" | "alert" | "amber" | "info" | "neutral";
export type TLItem = { id: string; at: string; lane: string; tone?: Tone; hint?: string; mark?: string };
export type TLLegend = { tone: Tone; label: string; mark?: string }[];
/** The zoomed time slice (epoch ms, `last` = upper bound inclusive), or null for the whole night. */
export type TLWindow = { from: number; to: number; last: boolean } | null;
const BUCKETS = 24;

/** Event explorer: an activity overview (events per time slice; select a slice to zoom), then one lane per event type where every
 *  marker is one real event at its real timestamp (shape + colour from the legend). The connector joins only the `linked` ids. */
export function ActivityTimeline({ label, items, selectedId, marked = [], linked = [], highlight = [], onSelect, note, legend, onWindow }: {
  onWindow?: (w: TLWindow) => void; label: string; items: TLItem[]; selectedId?: string; marked?: readonly string[]; linked?: readonly string[]; highlight?: readonly string[]; onSelect: (id: string) => void; note?: ReactNode; legend?: TLLegend;
}) {
  const [zoom, setZoom] = useState<number | null>(null);
  const model = useMemo(() => {
    const all = items.map(i => ({ ...i, t: Date.parse(i.at) })).filter(i => Number.isFinite(i.t));
    const min = Math.min(...all.map(r => r.t)), max = Math.max(...all.map(r => r.t)), width = Math.max(1, (max - min) / BUCKETS);
    const buckets = Array.from({ length: BUCKETS }, (_, b) => ({ b, from: min + b * width, to: min + (b + 1) * width, n: 0 }));
    for (const r of all) buckets[Math.min(BUCKETS - 1, Math.floor((r.t - min) / width))].n++;
    return { all, min, max, buckets, top: Math.max(1, ...buckets.map(x => x.n)) };
  }, [items]);
  const win = zoom === null ? null : model.buckets[zoom] ?? null;
  const lo = win ? win.from : model.min, hi = win ? win.to : model.max, span = hi - lo;
  const rows = model.all.filter(r => !win || (r.t >= win.from && (r.t < win.to || zoom === BUCKETS - 1)));
  const wFrom = win?.from, wTo = win?.to, wLast = zoom === BUCKETS - 1;
  useEffect(() => { onWindow?.(wFrom === undefined || wTo === undefined ? null : { from: wFrom, to: wTo, last: wLast }); }, [wFrom, wTo, wLast, onWindow]);
  if (model.all.length === 0) return <p className="k-empty">No events to plot.</p>;
  const lanes = [...new Set(model.all.map(r => r.lane))].sort();
  const pos = (t: number) => (span ? ((t - lo) / span) * 100 : 50);
  const hh = (t: number) => new Date(t).toISOString().slice(11, 16);
  const line = linked.map(id => rows.find(r => r.id === id)).filter((r): r is (typeof rows)[number] => !!r).sort((a, b) => a.t - b.t);
  const ticks = [0, .25, .5, .75, 1].map(f => lo + f * span);
  return <figure className="ds-tl gx-tl" aria-label={label}>
    <div className="gx-tl-head">
      <div className="gx-tl-overview" role="group" aria-label="Activity overview: events per time slice. Select a slice to zoom in.">
        {model.buckets.map(x => <button key={x.b} type="button" className={`gx-bar ${zoom === x.b ? "is-on" : ""}`} disabled={x.n === 0} aria-pressed={zoom === x.b}
          aria-label={`${hh(x.from)} to ${hh(x.to)} UTC, ${x.n} event${x.n === 1 ? "" : "s"}`} title={`${hh(x.from)}–${hh(x.to)} · ${x.n}`} onClick={() => setZoom(zoom === x.b ? null : x.b)}>
          <i style={{ height: `${x.n ? 12 + 88 * (x.n / model.top) : 0}%` }} /></button>)}
      </div>
      <div className="gx-tl-zoom">{win ? <><span>Zoomed to <b className="k-mono">{hh(win.from)}–{hh(win.to)} UTC</b> · {rows.length} of {model.all.length} events</span><button type="button" className="k-btn k-btn-sm" onClick={() => setZoom(null)}>Show the whole night</button></>
        : <span>{model.all.length} events · bars show how busy each slice was · select a bar to zoom</span>}</div>
    </div>
    {legend && <ul className="gx-legend-row" aria-label="Marker legend">{legend.map(l => <li key={l.label}><span className={`gx-key is-${l.tone}`} aria-hidden="true">{l.mark}</span>{l.label}</li>)}
      {marked.length > 0 && <li><span className="gx-key is-neutral is-marked" aria-hidden="true" />pinned by you</li>}{linked.length > 1 && <li><span className="gx-key-line" aria-hidden="true" />joined in time order</li>}</ul>}
    <div className="ds-tl-body">
      <div className="ds-tl-lanes" aria-hidden="true">{lanes.map(l => <span key={l}>{l} <small>{rows.filter(r => r.lane === l).length}</small></span>)}</div>
      <div className="ds-tl-track" style={{ height: lanes.length * 36 }}>
        {lanes.map((l, i) => <i className="ds-tl-lane" key={l} style={{ top: i * 36, height: 36 }} />)}
        {line.length > 1 && <svg className="ds-tl-link" viewBox={`0 0 100 ${lanes.length}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={line.map(r => `${pos(r.t)},${lanes.indexOf(r.lane) + 0.5}`).join(" ")} /></svg>}
        {rows.map(r => <button type="button" key={r.id} tabIndex={r.id === selectedId ? 0 : -1} aria-pressed={r.id === selectedId} aria-label={`Timeline marker ${r.id}, ${r.lane}, ${hh(r.t)}${r.hint ? `, ${r.hint}` : ""}`}
          className={`ds-tl-dot is-${r.tone ?? "neutral"}${r.id === selectedId ? " is-selected" : ""}${marked.includes(r.id) ? " is-marked" : ""}${highlight.includes(r.id) ? " is-hl" : ""}`}
          style={{ left: `${pos(r.t)}%`, top: lanes.indexOf(r.lane) * 36 + 18 }} onClick={() => onSelect(r.id)}>{r.mark}</button>)}
      </div>
    </div>
    <div className="ds-tl-body gx-ticks" aria-hidden="true"><span /><div className="gx-ticks-in">{ticks.map((t, i) => <span key={i} style={{ left: `${i * 25}%` }}>{hh(t)}</span>)}</div></div>
    <figcaption>{note ?? "Each marker is one event at its timestamp. Select one to inspect it."}</figcaption>
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
