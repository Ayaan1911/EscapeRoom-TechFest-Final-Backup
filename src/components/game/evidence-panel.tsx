export function EvidencePanel({ inboxOpen = false, trailOpen = false, insiderOpen = false, containmentOpen = false, verdictOpen = false }: { inboxOpen?: boolean; trailOpen?: boolean; insiderOpen?: boolean; containmentOpen?: boolean; verdictOpen?: boolean }) {
  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-heading">
      <div className="panel-heading"><span className="eyebrow">EVIDENCE STREAM / 01</span><span className="muted">{inboxOpen ? "CASE FILE READY" : "AWAITING ROUND START"}</span></div>
      <div className="evidence-empty">
        <div className="evidence-symbol" aria-hidden="true">⌁</div>
        <h2 id="evidence-heading">{verdictOpen ? "Final Verdict" : containmentOpen ? "Containment" : insiderOpen ? "Insider" : trailOpen ? "Trail" : inboxOpen ? "The Inbox" : "Awaiting organizer start"}</h2>
        <p>{verdictOpen ? "Synthesize the four investigations, test competing explanations and close the case with linked independent evidence." : containmentOpen ? "Reconstruct the incident, preserve evidence and build a scoped simulated response plan. All earlier evidence remains available." : insiderOpen ? "Collect your envelope and Evidence Wall fragments, then investigate who deliberately weakened the controls. Earlier case evidence stays available." : trailOpen ? "Follow the identity-provider events from session issuance to the unauthorized export. Inbox remains available for historical review." : inboxOpen ? "Six recovered messages. One initial compromise. Correlate the emails, captured page and audit records to prove what happened." : "Chapter 1 opens automatically when the organizer starts the shared round."}</p>
        {verdictOpen && <a className="button-primary" href="/play/verdict">Open Chapter 5</a>}
        {containmentOpen && <a className="button-primary" href="/play/containment">Open Chapter 4</a>}
        {insiderOpen && <a className="button-primary" href="/play/insider">Open Chapter 3</a>}
        {trailOpen && <a className="button-primary" href="/play/trail">Open Chapter 2</a>}
        {inboxOpen ? <a className="button-primary" href="/play/inbox">Open Chapter 1</a> : <span className="status-tag">INTAKE PENDING</span>}
      </div>
    </section>
  );
}
