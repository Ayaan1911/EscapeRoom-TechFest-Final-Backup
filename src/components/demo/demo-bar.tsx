"use client";
/* Persistent Demo Mode toolbar. It lives in normal page flow (sticky, 44 px) so it never covers evidence or controls.
   Reset = reload the page: all preview state is in memory only, so a reload clears exactly that and nothing else. */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { DEMO_STOPS } from "@/lib/demo/stops";

export function DemoBar() {
  const path = usePathname(), unit = useSearchParams().get("unit");
  const here = path === "/admin/demo/round2" ? `/admin/demo/round2?unit=${unit ?? "A1"}` : path;
  const i = DEMO_STOPS.findIndex(s => s.href === here), prev = DEMO_STOPS[i - 1], next = DEMO_STOPS[i + 1];
  const groups = [...new Set(DEMO_STOPS.map(s => s.group))];
  return <div className="dm-bar" role="region" aria-label="Demo controls">
    <strong className="dm-flag">DEMO MODE <span>NO TIMERS · NO REAL SCORES</span></strong>
    <nav className="dm-nav" aria-label="Demo navigation">
      <a className="k-btn k-btn-sm" href="/admin/demo">Demo home</a>
      <Link className="k-btn k-btn-sm" href="/admin/demo/round1">Round 1</Link>
      <a className="k-btn k-btn-sm" href="/admin/demo/round2?unit=A1">Round 2</a>
      {prev ? <a className="k-btn k-btn-sm" href={prev.href} aria-label={`Previous: ${prev.label}`}>← Prev</a> : <button type="button" className="k-btn k-btn-sm" disabled>← Prev</button>}
      {next ? <a className="k-btn k-btn-sm" href={next.href} aria-label={`Next: ${next.label}`}>Next →</a> : <button type="button" className="k-btn k-btn-sm" disabled>Next →</button>}
      <label className="dm-jump"><span className="k-sr">Jump to</span>
        <select value={i >= 0 ? DEMO_STOPS[i].href : ""} onChange={e => { window.location.assign(e.target.value); }}>
          {i < 0 && <option value="">Jump to…</option>}
          {groups.map(g => <optgroup key={g} label={g}>{DEMO_STOPS.filter(s => s.group === g).map(s => <option key={s.href} value={s.href}>{s.label}</option>)}</optgroup>)}
        </select></label>
      <button type="button" className="k-btn k-btn-sm" onClick={() => window.location.reload()}>Reset demo</button>
      <a className="k-btn k-btn-sm k-btn-primary" href="/admin">Exit demo</a>
    </nav>
  </div>;
}
