import Link from "next/link";
import { OsHeader } from "@/components/ui/os-header";

const CHAPTERS = [
  { n: "01", name: "Inbox", points: 15, what: "Six recovered emails, gateway and sign-in records and a printed QR capture. Find the one message that caused the first unauthorized export, and prove it.", tags: ["Phishing", "QR evidence", "Email headers"] },
  { n: "02", name: "Trail", points: 25, what: "A 144-event identity-provider log. Separate the real stolen session from VPNs, failed attempts and approved maintenance.", tags: ["Log analysis", "Session correlation"] },
  { n: "03", name: "Insider", points: 25, what: "Combine two physical fragments to unlock the Evidence Wall. Six staff, messages, policy changes and approvals: who deliberately weakened the controls?", tags: ["Physical clues", "Suspect profiles"] },
  { n: "04", name: "Containment", points: 20, what: "Reconstruct seven incident events in order, choose scoped urgent actions and build a recovery plan. Everything is a simulated decision.", tags: ["Timeline", "Response plan"] },
  { n: "05", name: "Final Verdict", points: 15, what: "Link at least twelve records across the whole case, weigh competing explanations and close it with evidence, not guesses.", tags: ["Case building", "Counter-evidence"] },
] as const;
// Decorative backdrop only: a few of the systems named in the case, and the alias. It carries no evidence and no answers.
const NET: Record<string, [number, number]> = { MAIL: [10, 14], VPN: [18, 54], IDP: [38, 32], DB: [62, 14], ADMIN: [58, 58], GHOST_404: [80, 38] };
const NET_EDGES = [["MAIL", "IDP"], ["VPN", "IDP"], ["IDP", "DB"], ["IDP", "ADMIN"], ["DB", "GHOST_404"], ["ADMIN", "GHOST_404"]] as const;
const RULES = [
  ["Teams of three", "One shared 60-minute clock, started by the organizer for every team at once."],
  ["Maximum 105 points", "Chapters are worth 15, 25, 25, 20 and 15. A one-time Tamper Alert bonus adds up to 5."],
  ["Hints cost points", "First hint −3, second −6 more (−9 in total). At most two per chapter; scores never drop below zero."],
  ["Use AI carefully", "AI and internet research are allowed. All evidence, including text aimed at AI tools, is untrusted."],
  ["How ranking works", "Total score, then Chapter 2 + 3 raw score, fewer hints, earlier completion, then team ID."],
  ["Organizer review", "The Top 10 and two standby teams are shortlisted after organizer review. Nothing advances automatically."],
] as const;

const ORBIT = CHAPTERS.map((c, i) => { const a = (-90 + i * 72) * Math.PI / 180; return { ...c, x: +(200 + 140 * Math.cos(a)).toFixed(1), y: +(200 + 140 * Math.sin(a)).toFixed(1) }; });
const CHAIN = ORBIT.map((o, i) => `${i ? "L" : "M"}${o.x} ${o.y}`).join(" ");
const TICKS = ["NX-MAIL gateway: inbound spike 02:14", "IDP: session replayed from unmanaged device", "DB-EXPORT: 18,402 rows left the building", "ADMIN: policy change approved at 02:31", "GHOST_404 claims responsibility", "Trace status: UNRESOLVED", "VPN: three tunnels, one of them lies"];

export default function Home() {
  return <div className="site-shell lp cn-landing">
    <div className="os-boot" aria-hidden="true"><div><b>GHOST//OS</b><span>secure forensic shell · case 404</span><i /></div></div>
    <OsHeader area="Operation briefing" secure={false}><span className="header-meta"><span className="live-dot" /> TECHFEST / ROUND 1</span></OsHeader>
    <main>
      <section className="cn-scene cn-hero" aria-labelledby="hero-heading">
        <svg className="cn-map" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          {NET_EDGES.map(([a, b]) => <line key={a + b} x1={NET[a][0]} y1={NET[a][1] * .85} x2={NET[b][0]} y2={NET[b][1] * .85} />)}
          {Object.entries(NET).map(([k, [x, y]]) => <g key={k}><circle className={k === "GHOST_404" ? "n ghost" : "n"} cx={x} cy={y * .85} r={k === "GHOST_404" ? 1.4 : 1} /><text x={x + 2} y={y * .85 + .5}>{k}</text></g>)}
        </svg>
        <div className="cn-copy">
          <ol className="cn-boot" aria-hidden="true">
            {["mounting forensic volumes ... ", "verifying evidence hashes ... ", "linking NEXUS telemetry ... ", "alias GHOST_404 ... ", "case NX-404 "].map((t, i) => <li key={t} style={{ ["--i" as string]: i }}>{t}{i < 4 ? <b>ok</b> : <b>OPEN</b>}</li>)}
          </ol>
          <p className="cn-mark">GHOST//OS · CASE 404</p>
          <h1 id="hero-heading" className="cn-title">A breach has a story.<em>Find the truth.</em></h1>
          <p className="cn-lede">The attacker is inside. The evidence is lying. Your AI might be too. Three investigators, five linked investigations, one case.</p>
          <div className="cn-cta"><Link className="cn-go" href="/play">Enter investigation <span aria-hidden="true">↗</span></Link><Link className="cn-ghostbtn" href="/login">Team login</Link><a className="cn-ghostbtn" href="#chapters">See the five chapters</a></div>
          <p className="cn-fine">Fictional incident simulation. No real systems, accounts or people are involved.</p>
        </div>
        <div className="cn-orbit" aria-hidden="true">
          <svg viewBox="0 0 400 400" focusable="false">
            <defs><radialGradient id="cn-glow"><stop offset="0" stopColor="#A8D9B4" stopOpacity=".16" /><stop offset="1" stopColor="#A8D9B4" stopOpacity="0" /></radialGradient>
              <linearGradient id="cn-sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#A8D9B4" stopOpacity="0" /><stop offset="1" stopColor="#A8D9B4" stopOpacity=".35" /></linearGradient></defs>
            <circle cx="200" cy="200" r="196" fill="url(#cn-glow)" />
            <circle className="cn-ring" cx="200" cy="200" r="190" /><circle className="cn-ring dash" cx="200" cy="200" r="170" /><circle className="cn-ring dash r" cx="200" cy="200" r="104" /><circle className="cn-ring" cx="200" cy="200" r="60" />
            <g className="cn-radar"><path d="M200 200 L200 8 A192 192 0 0 1 336 64 Z" fill="url(#cn-sw)" /></g>
            <path className="cn-chain" d={CHAIN} />
            <circle className="cn-packet" r="3.4" fill="#C5A477"><animateMotion dur="9s" repeatCount="indefinite" path={CHAIN} /></circle>
            <g className="cn-core"><circle className="c" cx="200" cy="200" r="46" /><text className="big" x="200" y="207">404</text><text className="small" x="200" y="228">GHOST</text></g>
            {ORBIT.map((o, i) => <g key={o.n} className="cn-node" style={{ ["--i" as string]: i }}><circle className="halo" cx={o.x} cy={o.y} r="22" /><circle cx={o.x} cy={o.y} r="22" /><text className="num" x={o.x} y={o.y + 4}>{o.n}</text><text className="nm" x={o.x} y={o.y + 40}>{o.name}</text><text className="pts" x={o.x} y={o.y + 53}>{o.points} PTS</text></g>)}
          </svg>
        </div>
        <div className="cn-ticker" aria-hidden="true"><div>{[...TICKS, ...TICKS].map((t, i) => <span key={i}><i>●</i> {t}</span>)}</div></div>
      </section>

      <section className="cn-brief" id="chapters" aria-labelledby="chapters-heading">
        <div className="lp-intro"><span className="k-eyebrow">THE INVESTIGATION</span><h2 id="chapters-heading">Five chapters. One case.</h2></div>
        <ol className="cn-beats">
          <li><strong>Read the evidence</strong><span>Mail, identity logs, staff records. Everything is real inside the simulation, and everything is untrusted.</span></li>
          <li><strong>Work it as a team</strong><span>Three people, one shared clock. Half the points in a chapter open the next.</span></li>
          <li><strong>Close the case</strong><span>Link the records, reject the wrong story, submit a verdict the evidence can carry.</span></li>
        </ol>
        <details className="lp-more"><summary>What you will do in each chapter</summary>
          <ol className="lp-chapters">{CHAPTERS.map(c => <li key={c.n} className="lp-chapter"><span className="lp-n k-mono">{c.n}</span><div><div className="lp-chapter-head"><h3>{c.name}</h3><span className="k-badge k-badge-amber">{c.points} points</span></div><p>{c.what}</p></div></li>)}</ol>
        </details>
        <p className="lp-ruleline">60 minutes · 105 points · hints cost points · AI is allowed, but all evidence is untrusted.</p>
        <details className="lp-more" id="rules"><summary>All Round 1 rules</summary><dl className="lp-rules">{RULES.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl></details>
      </section>

      <section className="cn-final" aria-labelledby="cta-heading">
        <h2 id="cta-heading">Ready when your organizer is.</h2>
        <div className="k-actions"><Link className="cn-go" href="/login">Team login</Link></div>
      </section>
    </main>
    <footer className="site-footer"><span>OPERATION GHOST_404</span><span>FICTIONAL INCIDENT SIMULATION · TECHFEST 2026</span></footer>
  </div>;
}
