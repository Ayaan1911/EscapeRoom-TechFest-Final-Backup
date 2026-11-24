import Link from "next/link";
import { Mail, Activity, Users, ShieldAlert, Gavel, Siren, Network, ScanSearch, PhoneCall } from "lucide-react";
import type { ReactNode } from "react";
import { requireDemoAdmin } from "@/lib/demo/demo.server";
import { DEMO_STOPS } from "@/lib/demo/stops";
import { keyInstalled } from "@/lib/round2/paper/terminal.server";

// Demo Mode mission launcher. Organizer-only; every link opens the real interface in isolated preview state (no timers, scores or writes).
// Scenario lines describe the task only, never an answer.
const R1: { icon: ReactNode; sub: string; brief: string }[] = [
  { icon: <Mail />, sub: "Mail forensics", brief: "Find the email that opened the door and prove how it was delivered." },
  { icon: <Activity />, sub: "Session trail", brief: "Follow one night of sign-ins and moves across the network." },
  { icon: <Users />, sub: "Staff dossiers", brief: "Cross dossiers, access records and messages to find who helped." },
  { icon: <ShieldAlert />, sub: "Response control room", brief: "Contain the incident, keep the evidence, recover safely." },
  { icon: <Gavel />, sub: "Case reconstruction", brief: "Assemble the whole case into one verdict." },
];
const R2: { icon: ReactNode; sub: string; brief: string; min: number }[] = [
  { icon: <Siren />, sub: "Incident triage", brief: "A finance laptop calls out at 2:14 AM. Choose the first response.", min: 10 },
  { icon: <Network />, sub: "SOC terminal", brief: "Ten live connections, four BLOCK attempts. Typed commands, scored by the server.", min: 12 },
  { icon: <ScanSearch />, sub: "AI verification", brief: "SENTINEL-AI filed eight confident claims. Check each against the records.", min: 25 },
  { icon: <PhoneCall />, sub: "Executive decisions", brief: "The CEO calls three times. Decide, then shape the public statement.", min: 10 },
];

export default async function DemoHome() {
  await requireDemoAdmin();
  const group = (g: string) => DEMO_STOPS.filter(s => s.group === g && s.href !== "/admin/demo/round1");
  const r1 = group("Round 1"), r2 = group("Round 2"), keyReady = await keyInstalled();
  return <main className="dashboard-main dm2">
    <section className="dm2-hero">
      <div><span className="cc-eyebrow">GHOST//OS · SIMULATION LAUNCHER</span><h1>OPERATION GHOST_404 <em>demonstration mode</em></h1>
        <p>Launch any chapter of either round in the real interface. Nothing here starts a round, runs a timer, scores an answer or touches a team.</p></div>
      <aside className="dm2-status" aria-label="Simulation status"><h2>Simulation status</h2>
        <ul className="dm-guard" aria-label="What demo mode never does"><li>No timers</li><li>No real scores</li><li>No attempts or hints used</li><li>No submissions stored</li><li>No team data touched</li></ul>
        <p className={keyReady ? "is-ok" : "is-warn"}><b>Kill Switch demo terminal:</b> {keyReady ? "answer key installed on this server. Demo blocks are classified but never stored." : "unavailable here. The private answer key is not installed on this server, so the demo terminal stays offline (no fallback answers). Install it on the event server only."}</p></aside>
    </section>

    <section className="dm2-round" aria-labelledby="dm-r1">
      <header><span className="cn-badge">ROUND 1 · DIGITAL · 60 MIN</span><h2 id="dm-r1">NEXUS Incident Response</h2>
        <p>Five chapters. In the real event each one unlocks after the one before; in demo mode every chapter is open.</p>
        <Link className="cc-btn cc-btn-primary" href="/admin/demo/round1">Open mission dashboard</Link></header>
      <ol className="dm2-path">{r1.map((s, i) => <li key={s.href} style={{ ["--i" as string]: i }}>
        <a href={s.href} aria-label={s.label} className="dm2-mod"><span className="dm2-n" aria-hidden="true">0{i + 1}</span><span className="dm2-ic" aria-hidden="true">{R1[i].icon}</span>
          <b aria-hidden="true">{s.label.replace(/^\d · /, "")}</b><small aria-hidden="true">{R1[i].sub}</small><span className="dm2-brief" aria-hidden="true">{R1[i].brief}</span><span className="dm2-go" aria-hidden="true">Launch →</span></a></li>)}</ol>
    </section>

    <section className="dm2-round is-r2" aria-labelledby="dm-r2">
      <header><span className="cn-badge cn-badge-amber">ROUND 2 · 60 MINUTES · FOUR OPEN INJECTS</span><h2 id="dm-r2">GHOST RETURNS</h2>
        <p>One shared 60-minute clock. All four injects open together; answers go on paper; only Kill Switch takes typed commands.</p>
        <a className="cc-btn dm2-amber" href="/admin/demo/round2?unit=1">Launch GHOST RETURNS — 60-minute investigation</a></header>
      <ol className="dm2-grid">{r2.map((s, i) => <li key={s.href} style={{ ["--i" as string]: i }}>
        <a href={s.href} aria-label={s.label} className="dm2-mod"><span className="dm2-n" aria-hidden="true">0{i + 1}</span><span className="dm2-ic" aria-hidden="true">{R2[i].icon}</span>
          <b aria-hidden="true">{s.label.replace(/^\d · /, "")}</b><small aria-hidden="true">{R2[i].sub} · suggested {R2[i].min} min</small><span className="dm2-brief" aria-hidden="true">{R2[i].brief}</span><span className="dm2-go" aria-hidden="true">Launch →</span></a></li>)}</ol>
    </section>
    <p className="dm-foot">Preview state lives only in this browser tab. Reset demo (or a refresh) clears it. To run the real event, use the command center.</p>
  </main>;
}
