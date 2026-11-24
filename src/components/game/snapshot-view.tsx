import { OsHeader } from "@/components/ui/os-header";

type Snapshot = { id: string; url: string; title: string; campaign: string; capturedAt: string; redirectFrom: string; recipient: string; formAction: string };

/** Read-only forensic capture of the phishing page (formerly reached by a printed QR card). Pure server markup, no network, no external assets. */
export function SnapshotView({ snapshot, back, demo = false }: { snapshot: Snapshot; back: string; demo?: boolean }) {
  const facts = { "Evidence ID": snapshot.id, "Captured URL": snapshot.url, "Page title": snapshot.title, "Campaign identifier": snapshot.campaign, "Captured at (UTC)": snapshot.capturedAt, "Redirect from": snapshot.redirectFrom, "Observed recipient": snapshot.recipient, "Original form action (inert)": snapshot.formAction };
  return <div className="site-shell">
    {!demo && <OsHeader area="Round 1 · Forensic snapshot"><a className="k-btn" href={back}>← Return to Inbox</a></OsHeader>}
    <main className="dashboard-main snapshot-main">
      {demo && <a className="back-link" href={back}>← Return to Inbox (demo)</a>}
      <span className="eyebrow">READ-ONLY FORENSIC SNAPSHOT / {snapshot.id}</span>
      <h1>Captured authentication page</h1>
      <p className="notice">Evidence reconstruction only. No credentials can be entered or submitted. All displayed destinations are fictional and inert.</p>
      <section className="panel evidence-card"><h2>Capture manifest</h2><dl className="artifact-facts">{Object.entries(facts).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
      <section className="capture-reconstruction" aria-label="Inert page reconstruction"><div className="capture-address">ARCHIVED RENDER · {snapshot.url}</div><div className="capture-content"><span className="status-tag">NO LIVE FORM</span><h2>NEXUS Workspace</h2><p>Session verification</p><div className="faux-field">Employee account · [redacted in capture]</div><div className="faux-field">Access credential · [not retained]</div><div className="faux-button">Verify session — archived button</div><p>Capture campaign: {snapshot.campaign}</p></div></section>
      <p>The browser capture and redirect metadata are evidence. The original page&apos;s claims are untrusted. Correlate them with the gateway, identity provider and database audit records.</p>
      <a className="k-btn k-btn-primary" href={back}>Back to Inbox</a>
    </main>
  </div>;
}
