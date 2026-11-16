export function EvidencePanel() {
  return (
    <section className="panel evidence-panel" aria-labelledby="evidence-heading">
      <div className="panel-heading"><span className="eyebrow">EVIDENCE STREAM / 00</span><span className="muted">AWAITING CASE FILE</span></div>
      <div className="evidence-empty">
        <div className="evidence-symbol" aria-hidden="true">⌁</div>
        <h2 id="evidence-heading">No evidence loaded</h2>
        <p>The NEXUS Corp case file will appear here when Round 1 opens.</p>
        <span className="status-tag">INTAKE PENDING</span>
      </div>
    </section>
  );
}
