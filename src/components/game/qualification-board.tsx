import type { qualificationReport } from "@/lib/game/qualification.server";
import { confirmReview } from "@/app/admin/qualification-actions";
import { Panel, Pill } from "@/components/admin/cc";
import { AdvanceTop10, type AdvRow } from "@/components/admin/advance-form";
import { cutoffTie, TOP_N } from "@/lib/game/top10";

type Detail = { top10?: string[]; standby?: string[]; advanced?: boolean; tieDecision?: { score: number; group: string[]; chosen: string[] } };
const parse = (s: string): Detail => { try { return JSON.parse(s) as Detail; } catch { return {}; } };

// Qualification and advancement. Source of truth: the saved server-side Round 1 ranking (never client values).
// States: Round 1 still open -> review (proposed Top 10, tie at 10th place needs the organizer) -> advanced (finalists enrolled) -> Round 2 control room.
export function QualificationBoard({ report, enrolled }: { report: NonNullable<Awaited<ReturnType<typeof qualificationReport>>>; enrolled: number }) {
  const { rows } = report, finished = report.roundStatus === "finished", incomplete = rows.filter(row => row.completedAt === null).length;
  const adv = (row: (typeof rows)[number]): AdvRow => ({ id: row.id, name: row.name, rank: row.rank, total: row.total, chapter23: row.chapter23, hints: row.hintCount, completedAt: row.completedAt === null ? null : new Date(row.completedAt).toISOString() });
  const cands = rows.map(r => ({ id: r.id, name: r.name, total: r.total, chapter23: r.chapter23, hintCount: r.hintCount, completedAt: r.completedAt }));
  const tie = finished && !report.confirmation ? cutoffTie(cands) : null;
  const detail = report.confirmation ? parse(report.confirmation.detail) : null;
  const confirmedIds = new Set(detail?.top10 ?? []), advanced = !!detail && detail.advanced !== false && enrolled > 0;
  const proposed = tie ? tie.sure.map(r => rows.find(x => x.id === r.id)!) : rows.slice(0, TOP_N);
  const tone = !finished ? "warn" : report.confirmation ? (advanced ? "ok" : "live") : "live";
  const label = !finished ? "PROVISIONAL" : advanced ? "TOP 10 ADVANCED" : report.confirmation ? "CONFIRMED · NOT ENROLLED" : "REVIEW NEEDED";
  const item = (row: (typeof rows)[number], mark?: string) => <li key={row.id} className={row.completedAt === null ? "is-review" : ""}><span className="cc-q-rank">{row.rank}</span><span><b>{row.name}</b><small>{row.id}</small></span><span className="cc-num">{row.total}</span>{(mark || row.completedAt === null) && <em>{[mark, row.completedAt === null ? "INCOMPLETE — review required" : ""].filter(Boolean).join(" · ")}</em>}</li>;
  return <Panel id="qualification" eyebrow={label} title={finished && !report.confirmation ? "Review Top 10 Teams" : "Qualification and Round 2 advancement"} className="cc-qual" aside={<Pill tone={tone}><span role="status">{report.label}</span></Pill>}>
    {!finished && <p className="cc-lede">Available once Round 1 is officially closed (deadline reached or stopped). The standings below are provisional until then. Nothing advances automatically.</p>}

    {finished && !report.confirmation && <>
      <ol className="cc-flow" aria-label="Qualification steps"><li className="is-done">Round 1 closed</li><li className="is-done">Scores saved</li><li className="is-now">Review Top 10</li><li>Advance to Round 2</li><li>Start Round 2</li></ol>
      <p className="cc-lede">The proposed Top 10 follows the saved Round 1 score (max 105). Confirming records the decision, marks these teams eligible for Round 2 and writes an audit entry. <b>It does not start Round 2</b>: you start the shared 60-minute round separately.</p>
      {tie && <p role="alert" className="cc-alert">TIE AT 10TH PLACE — {tie.group.length} teams share {tie.score} points for the last {tie.slots} place{tie.slots === 1 ? "" : "s"}. The system will not choose between them. Select them below.</p>}
    </>}

    <div className="cc-q-groups">
      <section className="cc-q-group"><h3>{report.confirmation ? "Finalists" : tie ? "Clearly in" : "Top 10 qualifying candidates"} ({report.confirmation ? (detail?.top10?.length ?? 0) : proposed.length})</h3>
        <ol>{(report.confirmation ? rows.filter(r => confirmedIds.has(r.id)) : proposed).map(r => item(r, report.confirmation && detail?.tieDecision?.chosen.includes(r.id) ? "chosen by the organizer" : undefined))}</ol>
        {tie && <p className="cc-note">The remaining {tie.slots} place{tie.slots === 1 ? "" : "s"} come from the tied group.</p>}</section>
      <section className="cc-q-group is-standby"><h3>Standby candidates ({report.confirmation ? (detail?.standby?.length ?? 0) : rows.filter(r => !proposed.includes(r)).slice(0, 2).length})</h3>
        <ol>{(report.confirmation ? rows.filter(r => detail?.standby?.includes(r.id)) : tie ? [] : rows.slice(TOP_N, TOP_N + 2)).map(r => item(r))}</ol>
        <div className="cc-q-facts"><p><b>{incomplete}</b> incomplete investigation{incomplete === 1 ? "" : "s"} (kept in the ranking, flagged for review).</p>
          <p><b>Ranking order:</b> higher total, then higher Chapter 2 + 3 raw score, fewer hints, earlier recorded completion, then team ID. This only orders the list; equal totals at the cutoff are never settled by it.</p>
          <div><b>Audited progression overrides</b>{report.overrides.length === 0 ? <p>No progression overrides recorded.</p> : <ul>{report.overrides.map(log => <li key={log.id}>{log.createdAt.toISOString().slice(11, 19)} UTC · {log.detail}</li>)}</ul>}</div></div></section>
    </div>
    {rows.length === 0 && <p>No registered teams. No qualification or standby places are fabricated.</p>}

    {finished && !report.confirmation && rows.length > 0 && <section className="cc-q-confirm" aria-labelledby="q-confirm-h"><h3 id="q-confirm-h">Confirm Top 10 and Advance to Round 2</h3>
      <AdvanceTop10 action={confirmReview} disabled={false}
        sure={(tie ? tie.sure : cands.slice(0, TOP_N)).map(c => adv(rows.find(r => r.id === c.id)!))}
        rest={rows.slice(tie ? tie.sure.length : TOP_N).map(adv)}
        tie={tie ? { score: tie.score, slots: tie.slots, group: tie.group.map(c => adv(rows.find(r => r.id === c.id)!)) } : null} />
    </section>}

    {report.confirmation && <section className="cc-q-confirm" aria-labelledby="q-confirm-h"><h3 id="q-confirm-h">{advanced ? "Advanced to Round 2" : "Confirmed, not yet enrolled"}</h3>
      <p role="status">Confirmed {report.confirmation.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC{detail?.tieDecision ? ` · tie at 10th place resolved manually by the organizer (${detail.tieDecision.chosen.length} of ${detail.tieDecision.group.length})` : ""}. {advanced ? `${enrolled} teams are enrolled for Round 2. Round 2 has NOT started.` : "Finalists are not enrolled yet. Open the Round 2 control room to enroll them."}</p>
      <a className="cc-btn cc-btn-primary" href="/admin/round2">Open the Round 2 control room</a>
    </section>}
  </Panel>;
}
