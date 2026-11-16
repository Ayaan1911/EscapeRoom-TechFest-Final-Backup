import Link from "next/link";
import { Brand } from "@/components/ui/brand";

export default function Home() {
  return (
    <div className="site-shell">
      <header className="site-header"><Brand /><span className="header-meta"><span className="live-dot" /> TECHFEST / ROUND 1</span></header>
      <main>
        <section className="hero" aria-labelledby="hero-heading">
          <div className="hero-copy">
            <span className="eyebrow"><span className="red-line" /> CLASSIFIED SIMULATION / CASE 404</span>
            <h1 id="hero-heading">A breach has a story.<br /><em>Find the truth.</em></h1>
            <p className="hero-tagline">The attacker is inside. The evidence is lying. Your AI might be too.</p>
            <p className="hero-description">NEXUS Corp has been breached. A figure calling themselves GHOST_404 claims responsibility, but the trail does not add up. Assemble your three-person response team and investigate the incident before the final verdict.</p>
            <div className="hero-actions"><Link className="button-primary" href="/play">Enter investigation <span aria-hidden="true">↗</span></Link><a className="text-link" href="#mission">Read mission brief <span aria-hidden="true">↓</span></a></div>
          </div>
          <div className="hero-display" aria-label="Fictional NEXUS incident status display">
            <div className="display-top"><span>NEXUS / SECURITY OPERATIONS</span><span>INCIDENT ID: NX-404</span></div>
            <div className="display-core"><div className="radar-ring ring-one" /><div className="radar-ring ring-two" /><div className="radar-ring ring-three" /><div className="radar-cross horizontal" /><div className="radar-cross vertical" /><span className="radar-center">404</span><span className="radar-label label-top">UNKNOWN ORIGIN</span><span className="radar-label label-bottom">SIGNAL DETECTED</span></div>
            <div className="display-bottom"><span><i /> THREAT LEVEL <b>ELEVATED</b></span><span>TRACE STATUS <b>UNRESOLVED</b></span></div>
          </div>
        </section>
        <section className="mission-section" id="mission" aria-labelledby="mission-heading">
          <div className="section-intro"><span className="eyebrow">MISSION PARAMETERS</span><h2 id="mission-heading">Follow the evidence.<br />Question the obvious.</h2></div>
          <div className="mission-grid">
            <article className="mission-card"><span className="mission-index">01 / INVESTIGATE</span><h3>Four linked chapters</h3><p>Move from a suspicious inbox to login traces, insider evidence, and the attack timeline.</p></article>
            <article className="mission-card"><span className="mission-index">02 / DECIDE</span><h3>One final verdict</h3><p>Build a case from what you can prove, then submit your team’s conclusion.</p></article>
            <article className="mission-card"><span className="mission-index">03 / ADVANCE</span><h3>Top 10 qualify</h3><p>The highest-ranking teams proceed to live incident simulations and a boardroom review.</p></article>
          </div>
        </section>
      </main>
      <footer className="site-footer"><span>OPERATION GHOST_404</span><span>FICTIONAL INCIDENT SIMULATION · TECHFEST 2026</span></footer>
    </div>
  );
}
