import Link from "next/link";
import { Brand } from "@/components/ui/brand";

export default function AdminPage() {
  return (
    <div className="site-shell dashboard-shell">
      <header className="site-header"><Brand /><span className="header-meta"><span className="live-dot" /> EVENT OPERATIONS</span></header>
      <main className="dashboard-main">
        <div className="dashboard-title"><div><span className="eyebrow">CONTROL ROOM / PHASE 0</span><h1>Event operations</h1><p>Round 1 administration workspace.</p></div><span className="status-tag">SETUP MODE</span></div>
        <div className="admin-grid"><section className="panel admin-feature"><span className="eyebrow">SYSTEM STATUS</span><h2>Control room is standing by.</h2><p>Team registration, scoring, and live case controls will be connected in the next phase.</p><div className="admin-rule" /><div className="admin-metrics"><div><span>EXPECTED TEAMS</span><strong>40–50</strong></div><div><span>QUALIFYING TEAMS</span><strong>10</strong></div><div><span>ROUND 1 CHAPTERS</span><strong>04</strong></div></div></section><aside className="panel admin-side"><span className="eyebrow">OPERATOR NOTE</span><h2>Access pending</h2><p>This route is a visual shell only. Authentication and real team data are required before operational use.</p><span className="status-tag">NO LIVE DATA</span></aside></div>
        <Link className="back-link" href="/">← Back to mission overview</Link>
      </main>
    </div>
  );
}
