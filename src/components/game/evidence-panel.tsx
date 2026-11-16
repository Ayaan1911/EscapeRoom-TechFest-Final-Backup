export function EvidencePanel({ inboxOpen = false, trailOpen = false }: { inboxOpen?: boolean; trailOpen?: boolean }) {
  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-heading">
      <div className="panel-heading"><span className="eyebrow">EVIDENCE STREAM / 01</span><span className="muted">{inboxOpen ? "CASE FILE READY" : "AWAITING ROUND START"}</span></div>
      <div className="evidence-empty">
        <div className="evidence-symbol" aria-hidden="true">⌁</div>
        <h2 id="evidence-heading">{trailOpen ? "Trail" : inboxOpen ? "The Inbox" : "Awaiting organizer start"}</h2>
        <p>{trailOpen ? "Follow the identity-provider events from session issuance to the unauthorized export. Inbox remains available for historical review." : inboxOpen ? "Six recovered messages. One initial compromise. Correlate the emails, captured page and audit records to prove what happened." : "Chapter 1 opens automatically when the organizer starts the shared round."}</p>
        {trailOpen && <a className="button-primary" href="/play/trail">Open Chapter 2</a>}
        {inboxOpen ? <a className="button-primary" href="/play/inbox">Open Chapter 1</a> : <span className="status-tag">INTAKE PENDING</span>}
      </div>
    </section>
  );
}
