import Link from "next/link";
import { Brand } from "@/components/ui/brand";

const CHAPTERS = [
  { n: "01", name: "Inbox", points: 15, what: "Six recovered emails, gateway and sign-in records and a printed QR capture. Find the one message that caused the first unauthorized export, and prove it.", tags: ["Phishing", "QR evidence", "Email headers"] },
  { n: "02", name: "Trail", points: 25, what: "A 144-event identity-provider log. Separate the real stolen session from VPNs, failed attempts and approved maintenance.", tags: ["Log analysis", "Session correlation"] },
  { n: "03", name: "Insider", points: 25, what: "Combine two physical fragments to unlock the Evidence Wall. Six staff, messages, policy changes and approvals: who deliberately weakened the controls?", tags: ["Physical clues", "Suspect profiles"] },
  { n: "04", name: "Containment", points: 20, what: "Reconstruct seven incident events in order, choose scoped urgent actions and build a recovery plan. Everything is a simulated decision.", tags: ["Timeline", "Response plan"] },
  { n: "05", name: "Final Verdict", points: 15, what: "Link at least twelve records across the whole case, weigh competing explanations and close it with evidence, not guesses.", tags: ["Case building", "Counter-evidence"] },
] as const;
const RULES = [
  ["Teams of three", "One shared 60-minute clock, started by the organizer for every team at once."],
  ["Maximum 105 points", "Chapters are worth 15, 25, 25, 20 and 15. A one-time Tamper Alert bonus adds up to 5."],
  ["Hints cost points", "First hint −3, second −6 more (−9 in total). At most two per chapter; scores never drop below zero."],
  ["Use AI carefully", "AI and internet research are allowed. All evidence, including text aimed at AI tools, is untrusted."],
  ["How ranking works", "Total score, then Chapter 2 + 3 raw score, fewer hints, earlier completion, then team ID."],
  ["Organizer review", "The Top 10 and two standby teams are shortlisted after organizer review. Nothing advances automatically."],
] as const;

export default function Home() {
  return <div className="site-shell lp">
    <header className="site-header"><Brand /><span className="header-meta"><span className="live-dot" /> TECHFEST / ROUND 1</span></header>
    <main>
      <section className="lp-hero" aria-labelledby="hero-heading">
        <div className="lp-hero-copy">
          <span className="k-eyebrow">CLASSIFIED SIMULATION / CASE 404</span>
          <h1 id="hero-heading">A breach has a story.<br /><em>Find the truth.</em></h1>
          <p className="lp-lede">The attacker is inside. The evidence is lying. Your AI might be too.</p>
          <p className="lp-body">NEXUS Corp has been breached. A figure calling themselves GHOST_404 claims responsibility, but the trail does not add up. Assemble your three-person response team and work one case across five linked investigations.</p>
          <div className="k-actions"><Link className="k-btn k-btn-primary k-btn-lg" href="/play">Enter investigation <span aria-hidden="true">↗</span></Link><a className="k-btn k-btn-lg" href="#chapters">See the five chapters</a></div>
          <p className="lp-note">Fictional incident simulation. No real systems, accounts or people are involved.</p>
        </div>
        <aside className="lp-casefile" aria-label="Case file overview">
          <header><span className="k-mono">INCIDENT NX-404</span><span className="k-badge k-badge-alert">TRACE UNRESOLVED</span></header>
          <ol>{CHAPTERS.map(c => <li key={c.n}><span className="lp-node" aria-hidden="true">{c.n}</span><div><strong>{c.name}</strong><small>{c.points} points</small></div></li>)}</ol>
          <footer><span>60 minutes</span><span>3 players</span><span>105 max</span></footer>
        </aside>
      </section>

      <section className="lp-section" id="chapters" aria-labelledby="chapters-heading">
        <div className="lp-intro"><span className="k-eyebrow">THE INVESTIGATION</span><h2 id="chapters-heading">Five chapters. One case.</h2><p>Each chapter unlocks the next. Earlier evidence stays available, and every submission is checked on the server.</p></div>
        <ol className="lp-chapters">{CHAPTERS.map(c => <li key={c.n} className="lp-chapter"><span className="lp-n k-mono">{c.n}</span><div><div className="lp-chapter-head"><h3>{c.name}</h3><span className="k-badge k-badge-amber">{c.points} points</span></div><p>{c.what}</p><div className="k-badges">{c.tags.map(t => <span className="k-badge" key={t}>{t}</span>)}</div></div></li>)}</ol>
      </section>

      <section className="lp-section" id="rules" aria-labelledby="rules-heading">
        <div className="lp-intro"><span className="k-eyebrow">ROUND 1 RULES</span><h2 id="rules-heading">What you need to know</h2></div>
        <dl className="lp-rules">{RULES.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>
      </section>

      <section className="lp-section lp-cta" aria-labelledby="cta-heading">
        <h2 id="cta-heading">Ready when your organizer is.</h2>
        <p>Sign in with the team ID and access code your organizer gave you. Use the HTTPS address you were given and keep your code private.</p>
        <div className="k-actions"><Link className="k-btn k-btn-primary k-btn-lg" href="/login">Team login</Link></div>
      </section>
    </main>
    <footer className="site-footer"><span>OPERATION GHOST_404</span><span>FICTIONAL INCIDENT SIMULATION · TECHFEST 2026</span></footer>
  </div>;
}
