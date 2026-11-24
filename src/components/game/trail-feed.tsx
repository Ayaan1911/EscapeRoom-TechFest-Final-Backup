"use client";
/* Round 1 · Trail: readable event list shown under the timeline. Same records and same filters/zoom as the timeline and the Event console.
   Presentation only. The description is a FIXED sentence per event type (the same for every event of that type and every team), so it explains what the type means
   without adding any per-event clue: the free-text `details`, `method`, `device` and `conditionalAccess` fields stay in the Event inspector. One page scroll, no inner scrollbars. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/kit";
import type { TrailEvent } from "@/types/trail";

const STEP = 30;
export const TRAIL_OUTCOME = { success: { tone: "ok", mark: "✓", text: "Allowed" }, failure: { tone: "alert", mark: "✕", text: "Denied" }, challenge: { tone: "amber", mark: "◔", text: "Challenged" } } as const;
const hour = (r: TrailEvent) => r.timestamp.slice(11, 13);
const WHAT: Record<string, string> = {
  "password-check": "A password was checked by the identity provider.", "interactive-sign-in": "A person signed in interactively.", "mfa-challenge": "A second-factor challenge was sent.", "mfa-check": "A second-factor response was checked.",
  "token-issue": "A session token was issued.", "token-refresh": "An existing token was refreshed.", "service-token": "A scheduled or service workload asked for a token.", "vpn-sign-in": "A VPN sign-in was attempted.",
  "session-validation": "An existing session was presented and validated.", "session-revoke": "A session was ended by policy.", "database-access": "A database resource was accessed.", "client-note": "A client attached a note to the log.",
};

export function TrailFeed({ rows, total, selectedId, pinned, reveal, rangeLabel, onSelect, onInspect }: {
  rows: TrailEvent[]; total: number; selectedId: string; pinned: readonly string[]; reveal: { id: string; n: number }; rangeLabel: string; onSelect: (id: string) => void; onInspect: (id: string) => void;
}) {
  // How many rows are listed. It starts from the top again whenever the filtered set or the time slice changes (derived from the key, no effect),
  // and always includes the row a marker click asked for.
  const viewKey = `${rows.length}|${rangeLabel}`, [grown, setGrown] = useState({ key: viewKey, n: STEP }), root = useRef<HTMLDivElement>(null);
  const wanted = reveal.n ? rows.findIndex(r => r.id === reveal.id) : -1;
  const limit = Math.max(grown.key === viewKey ? grown.n : STEP, wanted >= 0 ? Math.ceil((wanted + 1) / STEP) * STEP : 0);
  const shown = rows.slice(0, limit), more = (n: number) => setGrown({ key: viewKey, n });
  // A marker click must land on its row: bring it into the (single) page scroll once it is rendered.
  useEffect(() => { if (reveal.n) root.current?.querySelector<HTMLElement>(`[data-ev="${CSS.escape(reveal.id)}"]`)?.scrollIntoView({ block: "nearest" }); }, [reveal]);
  const groups = useMemo(() => { const out: { h: string; rows: TrailEvent[] }[] = []; for (const r of shown) { const last = out[out.length - 1]; if (last && last.h === hour(r)) last.rows.push(r); else out.push({ h: hour(r), rows: [r] }); } return out; }, [shown]);

  return <section className="tf" ref={root} aria-label="Event feed">
    <header className="tf-head"><h2 className="pg-h">What happened <small>{rangeLabel}</small></h2>
      <p role="status" aria-live="polite"><b>{shown.length}</b> of {rows.length} shown{rows.length !== total ? ` · ${total} in the whole night` : ""} · times are UTC</p></header>
    <p className="tf-key"><b>Allowed</b> = the system permitted it · <b>Denied</b> = it refused it · <b>Challenged</b> = more proof was requested. None of these says by itself whether anyone acted maliciously.</p>
    {rows.length === 0 ? <p className="k-empty">No events match the current filters or time slice.</p> : <>
      {groups.map(g => <div className="tf-group" key={g.h}>
        <h3 className="tf-hour">{g.h}:00 UTC <small>{g.rows.length} event{g.rows.length === 1 ? "" : "s"}{shown.length < rows.length ? " listed" : ""}</small></h3>
        <ol className="tf-list">{g.rows.map(r => { const o = TRAIL_OUTCOME[r.result], on = r.id === selectedId;
          return <li key={r.id} data-ev={r.id} className={`tf-row${on ? " is-selected" : ""}${pinned.includes(r.id) ? " is-pinned" : ""}`}>
            <button type="button" className="tf-main" aria-pressed={on} onClick={() => onSelect(r.id)} aria-label={`${r.id}, ${r.timestamp.slice(11, 19)} UTC, ${r.eventType}, ${o.text}, ${r.account}`}>
              <time className="k-mono tf-time" dateTime={r.timestamp}>{r.timestamp.slice(11, 19)}</time>
              <span className="tf-type">{r.eventType}</span>
              <Badge tone={o.tone}><span aria-hidden="true">{o.mark}</span> {o.text}</Badge>
              <span className="tf-who">{r.account}</span>
              <span className="tf-src k-mono">{r.sourceIp}</span>
              <span className="tf-desc">{WHAT[r.eventType] ?? "Authentication event."}</span>
              <span className="tf-ids k-mono">{r.id} · session {r.sessionId}{pinned.includes(r.id) ? " · ★ pinned" : ""}</span>
            </button>
            <button type="button" className="k-btn k-btn-sm tf-inspect" onClick={() => onInspect(r.id)} aria-label={`Open ${r.id} in the Event inspector`}>Inspect</button>
          </li>; })}</ol>
      </div>)}
      {shown.length < rows.length && <div className="tf-more"><button type="button" className="k-btn" onClick={() => more(limit + STEP)}>Show {Math.min(STEP, rows.length - shown.length)} more</button><button type="button" className="k-btn" onClick={() => more(rows.length)}>Show all {rows.length}</button></div>}
    </>}
  </section>;
}
