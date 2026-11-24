import type { qualificationReport } from "@/lib/game/qualification.server";
import { confirmReview } from "@/app/admin/qualification-actions";
import { ConfirmForm } from "@/components/ui/confirm";
import { Panel, Pill } from "@/components/admin/cc";

// Qualification decision panel. The full per-team table lives in the team table; this panel is the decision itself:
// who is in the Top 10 and standby candidate groups, what needs review, and the audited organizer confirmation.
export function QualificationBoard({ report }: { report: NonNullable<Awaited<ReturnType<typeof qualificationReport>>> }) {
  const { rows } = report, incomplete = rows.filter(row => row.completedAt === null).length;
  const tone = report.label === "PROVISIONAL" ? "warn" : report.confirmation ? "ok" : "live";
  const item = (row: (typeof rows)[number]) => <li key={row.id} className={row.completedAt === null ? "is-review" : ""}><span className="cc-q-rank">{row.rank}</span><span><b>{row.name}</b><small>{row.id}</small></span><span className="cc-num">{row.total}</span>{row.completedAt === null && <em>INCOMPLETE — review required</em>}</li>;
  return <Panel id="qualification" eyebrow={report.label} title="Qualification review" className="cc-qual" aside={<Pill tone={tone}><span role="status">{report.label}</span></Pill>}>
    <p className="cc-lede">Selection follows the saved Round 1 ranking. Confirmation records this exact result snapshot for the audit trail; it never changes scores and never moves a team into Round 2 by itself.</p>
    <div className="cc-q-groups">
      <section className="cc-q-group"><h3>Top 10 qualifying candidates ({Math.min(10, rows.length)})</h3><ol>{rows.slice(0, 10).map(item)}</ol></section>
      <section className="cc-q-group is-standby"><h3>Standby candidates ({Math.max(0, Math.min(2, rows.length - 10))})</h3><ol>{rows.slice(10, 12).map(item)}</ol>
        <div className="cc-q-facts"><p><b>{incomplete}</b> incomplete investigation{incomplete === 1 ? "" : "s"} (kept in the ranking, flagged for review).</p>
          <p><b>Tie order:</b> higher total, then higher Chapter 2 + 3 raw score, fewer hints, earlier recorded completion, then team ID.</p>
          <div><b>Audited progression overrides</b>{report.overrides.length === 0 ? <p>No progression overrides recorded.</p> : <ul>{report.overrides.map(log => <li key={log.id}>{log.createdAt.toISOString().slice(11, 19)} UTC · {log.detail}</li>)}</ul>}</div></div></section>
    </div>
    {rows.length === 0 && <p>No registered teams. No qualification or standby places are fabricated.</p>}
    <section className="cc-q-confirm" aria-labelledby="q-confirm-h"><h3 id="q-confirm-h">Organizer qualification confirmation</h3>
      {report.confirmation ? <p role="status">This exact result snapshot was confirmed at {report.confirmation.createdAt.toISOString()}.</p>
        : <p>{report.roundStatus === "finished" ? "Review incomplete cases, chapter scores, tie-breaks and all overrides before recording confirmation. A later change to saved results invalidates this confirmation." : "Available once Round 1 is closed."}</p>}
      <ConfirmForm action={confirmReview} danger title="Record qualification confirmation?" confirmLabel="Confirm qualification record" details={<><p>This records that you reviewed this exact result snapshot (digest included). It does not change scores and does not advance any team to Round 2.</p><p>A later change to saved results invalidates this confirmation.</p></>}>
        <fieldset disabled={report.roundStatus !== "finished" || !!report.confirmation} className="cc-form-row"><label>Review reason<input name="reason" required minLength={5} maxLength={500} /></label><label className="review-acknowledgement k-check"><input type="checkbox" name="reviewed" required />I reviewed incomplete investigations, tie-break details and audited overrides.</label><button className="k-btn k-btn-danger">Record qualification confirmation</button></fieldset>
      </ConfirmForm>
    </section>
  </Panel>;
}
