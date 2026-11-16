import Link from "next/link";
import { Brand } from "@/components/ui/brand";
import { ChapterNavigation } from "@/components/game/chapter-navigation";
import { EvidencePanel } from "@/components/game/evidence-panel";

export default function PlayPage() {
  return (
    <div className="site-shell dashboard-shell">
      <header className="site-header"><Brand /><span className="header-meta"><span className="live-dot" /> PARTICIPANT PORTAL</span></header>
      <main className="dashboard-main">
        <div className="dashboard-title"><div><span className="eyebrow">CASE FILE / NX-404</span><h1>Investigation dashboard</h1><p>Four chapters. One verdict. Follow the evidence when the case opens.</p></div><span className="status-tag">ROUND 1 · PREPARING</span></div>
        <div className="dashboard-grid">
          <aside className="panel chapter-panel"><div className="panel-heading"><h2>Case progression</h2><span className="muted">00 / 04</span></div><ChapterNavigation /><div className="verdict-row"><span>FINAL VERDICT</span><span className="chapter-lock">LOCKED</span></div></aside>
          <div className="dashboard-center"><EvidencePanel /><section className="panel briefing-panel"><span className="eyebrow">FIELD BRIEFING</span><h2>Incident intake</h2><p>GHOST_404 claims responsibility for a breach at NEXUS Corp. The available evidence is incomplete. Chapter materials and team progress will appear in this workspace when Round 1 opens.</p><div className="briefing-foot"><span>CASE STATUS</span><strong>AWAITING ACTIVATION</strong></div></section></div>
          <aside className="panel intel-panel"><div className="panel-heading"><h2>Case intel</h2><span className="muted">NX-404</span></div><dl><div><dt>Organisation</dt><dd>NEXUS Corp</dd></div><div><dt>Threat actor</dt><dd>GHOST_404 <small>/ UNVERIFIED</small></dd></div><div><dt>Team size</dt><dd>03 participants</dd></div><div><dt>Environment</dt><dd>Fictional simulation</dd></div></dl><div className="intel-note"><span className="live-dot" /> AI and internet use permitted</div></aside>
        </div>
        <Link className="back-link" href="/">← Back to mission overview</Link>
      </main>
    </div>
  );
}
