import { titles, type Progress } from "@/lib/game/engine";
import { hintDeduction, resultTotals } from "@/lib/game/results";

const MAX = [15, 25, 25, 20, 15];
export function CaseClosed({ teamId, teamName, progress }: { teamId: string; teamName: string; progress: Progress }) {
  const result = resultTotals(progress);
  const pct = Math.min(100, Math.round((result.total / 105) * 100));
  return <section id="case-closed" className="k-closed case-closed" aria-labelledby="case-closed-heading">
    <div className="k-burst" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--a" as string]: `${i * (360 / 14)}deg`, ["--d" as string]: `${(i % 3) * 40}ms` }} />)}</div>
    <div className="k-closed-hero">
      <div className="k-ring" style={{ ["--pct" as string]: `${pct}%` }} role="img" aria-label={`Final score ${result.total} out of 105`}><div><strong className="case-total">{result.total} / 105</strong><span>FINAL SCORE</span></div></div>
      <div className="k-closed-copy">
        <span className="k-eyebrow">ROUND 1 / SAVED INVESTIGATION RESULT</span>
        <h2 id="case-closed-heading">CASE CLOSED — INVESTIGATION COMPLETE</h2>
        <p><strong>{teamName}</strong> · Team {teamId}</p>
        <p>Server-recorded completion: <time className="k-mono">{result.completedAt === null ? "No completion timestamp" : new Date(result.completedAt).toISOString()}</time></p>
        <p className="k-closed-note">Total hint deductions: {result.totalDeduction} · Tamper Alert bonus: +{result.bonus}</p>
      </div>
    </div>
    <ol className="k-outcomes" aria-label="Chapter outcomes">{progress.chapters.map((chapter, i) => <li key={i} style={{ ["--i" as string]: i }}><span className="k-mono k-muted">0{i + 1}</span><strong>{titles[i]}</strong><span className="k-outcome-bar"><i style={{ width: `${(chapter.score / MAX[i]) * 100}%` }} /></span><span className="k-mono">{chapter.score}/{MAX[i]}</span></li>)}</ol>
    <div className="k-tablescroll" tabIndex={0} role="region" aria-label="Chapter results, scrollable"><table className="k-table" aria-label="Saved chapter results"><thead><tr><th>Chapter</th><th>Status</th><th>Raw</th><th>Hints</th><th>Deduction</th></tr></thead><tbody>{progress.chapters.map((chapter, i) => <tr key={i}><th>{i + 1}. {titles[i]}</th><td>{chapter.completedAt === null ? "Incomplete" : chapter.override ? "Completed by organizer override" : "Completed"}</td><td>{chapter.score}</td><td>{chapter.hints}</td><td>−{hintDeduction(chapter.hints)}</td></tr>)}</tbody></table></div>
    <p>The retained evidence links the captured redirect, session abuse, customer export and separately supported internal assistance. The response is a prepared simulation plan; GHOST_404 remains an alias without a proven real-world identity or location.</p>
    {progress.chapters.some(chapter => chapter.override) && <p className="k-banner k-banner-warn">This result includes organizer overrides. Review the audit record before qualification decisions.</p>}
    <p>Investigation completion does not confirm qualification. Organizer rankings remain provisional until the shared round closes, and selection requires organizer review. No team advances automatically to Round 2.</p>
    <nav className="k-actions" aria-label="Completed case evidence"><a className="k-btn" href="/play/inbox">Review Inbox</a><a className="k-btn" href="/play/trail">Review Trail</a><a className="k-btn" href="/play/insider">Review Insider</a><a className="k-btn" href="/play/containment">Review Containment</a><a className="k-btn" href="/play/verdict">Review Final Verdict</a></nav>
  </section>;
}
