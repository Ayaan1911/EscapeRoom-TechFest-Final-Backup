"use client";
import { useMemo, useState } from "react";

// Organizer team management for 40-50 teams: one table (page scroll, no inner scroller), search, filters, sort and a detail panel.
// Rows carry no access codes or hashes; the server builds them from saved results only.
export type TeamRow = {
  id: string; name: string; variant: string; participants: string[]; rank: number; total: number; raw: number[]; hints: number[]; deductions: number[];
  bonus: number; completedAt: string | null; chapter23: number; selection: string; overrides: number[]; done: boolean[]; current: string | null; signedIn: boolean;
  r2: { status: string; attempts: number | null } | null;
};
const CH = ["Inbox", "Trail", "Insider", "Containment", "Final Verdict"];
type Sort = "rank" | "id" | "progress";
const state = (r: TeamRow) => r.completedAt ? "complete" : r.done.some(Boolean) || r.total > 0 ? "progress" : "none";

export function TeamTable({ rows, provisional, live }: { rows: TeamRow[]; provisional: boolean; live: boolean }) {
  const [q, setQ] = useState(""), [status, setStatus] = useState("all"), [group, setGroup] = useState("all"), [sort, setSort] = useState<Sort>("rank"), [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => (!needle || [r.id, r.name, ...r.participants].some(x => x.toLowerCase().includes(needle)))
      && (status === "all" || state(r) === status) && (group === "all" || (group === "r2" ? !!r.r2 : r.selection.startsWith(group))))
      .sort((a, b) => sort === "id" ? a.id.localeCompare(b.id) : sort === "progress" ? b.done.filter(Boolean).length - a.done.filter(Boolean).length || a.rank - b.rank : a.rank - b.rank);
  }, [rows, q, status, group, sort]);
  const sel = rows.find(r => r.id === open) ?? null;
  return <div className="cc-teams">
    <div className="cc-toolbar" role="search">
      <label className="cc-search">Search teams<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Team ID, name or participant" /></label>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All</option><option value="complete">Complete</option><option value="progress">In progress</option><option value="none">Not started</option></select></label>
      <label>Group<select value={group} onChange={e => setGroup(e.target.value)}><option value="all">All</option><option value="Top 10">Top 10 candidates</option><option value="Standby">Standby</option><option value="Outside">Outside selection</option><option value="r2">Round 2 finalists</option></select></label>
      <label>Sort<select value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="rank">Rank</option><option value="id">Team ID</option><option value="progress">Chapters done</option></select></label>
      <span className="cc-count" role="status">{shown.length} of {rows.length} teams</span>
    </div>
    <div className={`cc-teams-body ${sel ? "has-detail" : ""}`}>
      <table className="cc-table" aria-label="Round 1 qualification leaderboard">
        <thead><tr><th scope="col">Rank</th><th scope="col">Team</th><th scope="col">Chapters 1–5 <span className="cc-legend-inline"><i className="is-done" />done{live && <><i className="is-now" />working</>}</span></th><th scope="col">Score</th><th scope="col">Hints</th><th scope="col">Investigation</th><th scope="col">Group{provisional ? " (provisional)" : ""}</th><th scope="col">Round 2</th><th scope="col"><span className="sr-only">Details</span></th></tr></thead>
        <tbody>{shown.map(r => <tr key={r.id} data-team-id={r.id} className={open === r.id ? "is-open" : ""}>
          <td className="cc-rank">{r.rank}</td>
          <td><b>{r.name}</b><small>{r.id} · Variant {r.variant}{r.signedIn ? " · signed in" : ""}</small></td>
          <td><ol className="cc-chain" aria-label={`Chapters: ${r.done.filter(Boolean).length} of 5 done${live && r.current ? `, working on ${r.current}` : ""}`}>{CH.map((c, i) => <li key={c} title={`${i + 1} · ${c}`} className={r.done[i] ? "is-done" : live && r.current === c ? "is-now" : ""}>{i + 1}</li>)}</ol></td>
          <td className="cc-num">{r.total} / 105</td>
          <td className="cc-num">{r.hints.reduce((a, b) => a + b, 0)}</td>
          <td>{r.completedAt ? "Complete" : `Incomplete · ${r.current ?? "Review progress"}`}</td>
          <td><span className={`cc-group is-${r.selection.split(" ")[0].toLowerCase()}`}>{r.selection.replace(" candidate", "")}</span></td>
          <td>{r.r2 ? <span>{r.r2.status}{r.r2.attempts !== null ? ` · ${r.r2.attempts}/4 blocks` : ""}</span> : <span className="cc-dim">—</span>}</td>
          <td><button type="button" className="cc-btn cc-btn-sm" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Close" : "Details"}<span className="sr-only"> for {r.id}</span></button></td>
        </tr>)}</tbody>
      </table>
      {shown.length === 0 && <p className="cc-empty">{rows.length ? "No team matches these filters." : "No registered teams. No qualification or standby places are fabricated."}</p>}
      {sel && <aside className="cc-detail" aria-label={`Team ${sel.id} details`}>
        <header><span className="cc-eyebrow">TEAM {sel.id} · RANK {sel.rank}</span><h3>{sel.name}</h3><p>{sel.participants.join(", ") || "No participants listed"}</p></header>
        <dl className="cc-detail-grid">
          <div><dt>Total</dt><dd>{sel.total} / 105</dd></div><div><dt>Bonus</dt><dd>+{sel.bonus}</dd></div>
          <div><dt>Chapter 2 + 3 raw</dt><dd>{sel.chapter23}</dd></div><div><dt>Completed</dt><dd>{sel.completedAt ? new Date(sel.completedAt).toISOString().slice(11, 19) + " UTC" : "Not complete"}</dd></div>
        </dl>
        <table className="cc-table cc-table-mini" aria-label={`Chapter scores for ${sel.id}`}><thead><tr><th>Chapter</th><th>Raw</th><th>Hints</th><th>Deduction</th></tr></thead>
          <tbody>{CH.map((c, i) => <tr key={c}><td>{c}{sel.overrides.includes(i + 1) ? " · override" : ""}</td><td>{sel.raw[i]}</td><td>{sel.hints[i]}</td><td>−{sel.deductions[i]}</td></tr>)}</tbody></table>
        <p className="cc-note">Round 2: {sel.r2 ? `${sel.r2.status}${sel.r2.attempts !== null ? `, ${sel.r2.attempts} of 4 terminal blocks used` : ""}` : "not a finalist"}.</p>
        <button type="button" className="cc-btn" onClick={() => setOpen(null)}>Close details</button>
      </aside>}
    </div>
  </div>;
}
