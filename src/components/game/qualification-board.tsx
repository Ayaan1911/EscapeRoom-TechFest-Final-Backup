import type { qualificationReport } from "@/lib/game/qualification.server";
import { titles } from "@/lib/game/engine";
import { confirmReview } from "@/app/admin/qualification-actions";
import { Badge } from "@/components/ui/kit";
import { ConfirmForm } from "@/components/ui/confirm";

export function QualificationBoard({ report }: { report: NonNullable<Awaited<ReturnType<typeof qualificationReport>>> }) {
  const { rows } = report;
  const tone = report.label === "PROVISIONAL" ? "amber" : report.confirmation ? "ok" : "info";
  return <section className="k-card qualification-board" aria-labelledby="qualification-heading">
    <header className="k-card-head"><div><span className="k-eyebrow">{report.label}</span><h2 id="qualification-heading">Registered teams and qualification</h2></div><Badge tone={tone}><span role="status">{report.label}</span></Badge></header>
    <div className="k-card-body">
      <p>Saved results only. Refresh to review the current server-authoritative closure state. Confirmation records this result snapshot for organizer review; it never changes scores or advances teams into Round 2.</p>
      <div className="k-groups qualification-groups">
        <section className="k-group"><h3>Top 10 qualifying candidates ({Math.min(10, rows.length)})</h3><ol>{rows.slice(0, 10).map(row => <li key={row.id}>{row.id} · {row.name} · {row.total} points {row.completedAt === null ? "· INCOMPLETE — review required" : ""}</li>)}</ol></section>
        <section className="k-group"><h3>Standby candidates ({Math.max(0, Math.min(2, rows.length - 10))})</h3><ol start={11}>{rows.slice(10, 12).map(row => <li key={row.id}>{row.id} · {row.name} · {row.total} points {row.completedAt === null ? "· INCOMPLETE — review required" : ""}</li>)}</ol></section>
      </div>
      <p>Incomplete investigations: {rows.filter(row => row.completedAt === null).length}. Ties use higher total, then higher Chapter 2 + 3 raw score, fewer hints, earlier recorded completion, then deterministic team ID. Incomplete cases retain a missing completion time and are not silently removed from ranking.</p>
      <div className="k-tablescroll" tabIndex={0} role="region" aria-label="Qualification table, scrollable"><table className="k-table" aria-label="Round 1 qualification leaderboard"><thead><tr><th>Rank</th><th>Team / ID</th><th>Investigation</th><th>Five raw scores</th><th>Hints / deductions</th><th>Bonus</th><th>Total</th><th>Completion UTC</th><th>Tie-break details</th><th>Candidate group / overrides</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} data-team-id={row.id}><td>{row.rank}</td><td>{row.name}<br />{row.id}<br />Variant {row.variant}<br />{(JSON.parse(row.participants) as string[]).join(", ")}</td><td>{row.completedAt === null ? `Incomplete · ${titles[row.progress.chapters.findIndex(chapter => chapter.completedAt === null)] ?? "Review progress"}` : "Complete"}</td><td>{row.rawScores.join(" / ")}</td><td>{row.progress.chapters.map(chapter => chapter.hints).join(" / ")}<br />Deductions: {row.deductions.join(" / ")}<br />Hints {row.hintCount} · Deduction {row.totalDeduction}</td><td>+{row.bonus}</td><td>{row.total} / 105</td><td>{row.completedAt === null ? "Incomplete" : new Date(row.completedAt).toISOString()}</td><td>Ch 2 + 3: {row.chapter23}<br />Hints: {row.hintCount}<br />Final fallback: {row.id}</td><td>{row.selection}<br />Overrides: {row.overrides.join(", ") || "None"}</td></tr>)}</tbody></table></div>
      {rows.length === 0 && <p>No registered teams. No qualification or standby places are fabricated.</p>}
      <section><h3>Audited progression overrides</h3>{report.overrides.length === 0 ? <p>No progression overrides recorded.</p> : report.overrides.map(log => <p key={log.id}>{log.createdAt.toISOString()} · {log.detail}</p>)}</section>
      <section className="k-confirm-review"><h3>Organizer qualification confirmation</h3>
        {report.confirmation ? <p role="status">This exact result snapshot was confirmed at {report.confirmation.createdAt.toISOString()}. Audit: {report.confirmation.detail}</p> : <p>Review incomplete cases, chapter scores, tie-breaks and all overrides before recording confirmation. Changed saved results invalidate an older snapshot confirmation.</p>}
        <ConfirmForm action={confirmReview} danger title="Record qualification confirmation?" confirmLabel="Confirm qualification record" details={<><p>This records that you reviewed this exact result snapshot (digest included). It does not change scores and does not advance any team to Round 2.</p><p>A later change to saved results invalidates this confirmation.</p></>}>
          <fieldset disabled={report.roundStatus !== "finished" || !!report.confirmation}><label>Review reason<input name="reason" required minLength={5} maxLength={500} /></label><label className="review-acknowledgement k-check"><input type="checkbox" name="reviewed" required />I reviewed incomplete investigations, tie-break details and audited overrides.</label><button className="k-btn k-btn-danger">Record qualification confirmation</button></fieldset>
        </ConfirmForm>
      </section>
    </div>
  </section>;
}
