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
