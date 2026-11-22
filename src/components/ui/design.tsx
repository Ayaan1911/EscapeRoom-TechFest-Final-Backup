// Shared design-system primitives (presentation only; every number is passed in from server state). CSS: src/app/design.css
import type { ReactNode } from "react";

/** SVG score ring. Text equivalent is in the aria-label; the ring itself is decorative. */
export function ScoreRing({ value, max, label = "Saved score" }: { value: number; max: number; label?: string }) {
  const r = 44, c = 2 * Math.PI * r, frac = Math.max(0, Math.min(1, max ? value / max : 0));
  return <div className="ds-ring" role="img" aria-label={`${label}: ${value} of ${max}`}>
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r={r} className="ds-ring-track" /><circle cx="50" cy="50" r={r} className="ds-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 50 50)" /></svg>
    <span className="ds-ring-text"><b>{value}</b><small>/ {max}</small></span>
  </div>;
}

/** Thin progress meter with an optional threshold tick (e.g. the 50% unlock gate). */
export function Meter({ value, max, gate, label, tone = "accent" }: { value: number; max: number; gate?: number; label: string; tone?: "accent" | "ok" }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return <span className={`ds-meter is-${tone}`} role="img" aria-label={label}><i style={{ width: `${pct}%` }} />{gate !== undefined && <u style={{ left: `${Math.min(100, (gate / max) * 100)}%` }} />}</span>;
}

/** Small status label with an icon glyph so state never depends on colour alone. */
export function StatusPill({ kind, children }: { kind: "locked" | "available" | "progress" | "complete" | "live" | "waiting"; children: ReactNode }) {
  const glyph = { locked: "🔒", available: "○", progress: "◐", complete: "✓", live: "●", waiting: "◌" }[kind];
  return <span className={`ds-pill is-${kind}`}><span aria-hidden="true">{glyph}</span>{children}</span>;
}

/** Calm, intentional "nothing is happening yet" panel with a pulsing radar mark. */
export function PulseState({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <section className="ds-pulse" aria-labelledby="pulse-h"><div className="ds-radar" aria-hidden="true"><i /><i /><i /></div>
    <div><span className="k-eyebrow">{eyebrow}</span><h2 id="pulse-h">{title}</h2>{children}</div></section>;
}

/** Line glyph per investigation chapter (decorative; the chapter name is always present as text). */
export function ChapterGlyph({ n, className = "" }: { n: number; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const shapes = [
    <g key="1" {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6.5L20.5 7" /></g>,
    <g key="2" {...p}><path d="M3 12h18M7 7v10M12 5v14M17 8v8" /><circle cx="7" cy="7" r="1" /><circle cx="17" cy="16" r="1" /></g>,
    <g key="3" {...p}><circle cx="6" cy="7" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="12" cy="17" r="2" /><path d="M8 7h8M7 9l4 6M17 9l-4 6" /></g>,
    <g key="4" {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></g>,
    <g key="5" {...p}><path d="M12 4v16M6 8h12M5 8l-3 6h6zM19 8l-3 6h6zM8 20h8" /></g>,
  ];
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{shapes[Math.max(0, Math.min(4, n - 1))]}</svg>;
}
