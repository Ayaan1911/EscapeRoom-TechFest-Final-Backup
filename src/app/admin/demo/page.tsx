import Link from "next/link";
import { Mail, Activity, Users, ShieldAlert, Gavel, Siren, Network, ScanSearch, PhoneCall } from "lucide-react";
import type { ReactNode } from "react";
import { requireDemoAdmin } from "@/lib/demo/demo.server";
import { DEMO_STOPS } from "@/lib/demo/stops";

const R1_ICONS: ReactNode[] = [<Mail key="m" />, <Activity key="a" />, <Users key="u" />, <ShieldAlert key="s" />, <Gavel key="g" />];
const R1_SUB = ["Mail forensics", "Session trail", "Staff dossiers", "Response control room", "Case reconstruction"];
const R2_ICONS: ReactNode[] = [<Siren key="s" />, <Network key="n" />, <ScanSearch key="c" />, <PhoneCall key="p" />];
const R2_SUB = ["suggested 10 min · incident triage", "suggested 12 min · SOC terminal", "suggested 25 min · AI verification", "suggested 10 min · command center"];

export default async function DemoHome() {
  await requireDemoAdmin();
  const group = (g: string) => DEMO_STOPS.filter(s => s.group === g && s.href !== "/admin/demo/round1");
  const r1 = group("Round 1"), r2 = group("Round 2");
  return <main className="dashboard-main dm-home cn-scene cn-launch">
    <section className="dm-hero cn-launch-head"><span className="k-eyebrow">GHOST//OS · SIMULATION LAUNCHER</span><h1>OPERATION GHOST_404 <em>demonstration mode</em></h1>
      <p>Launch any chapter of either round in the real interface. Nothing here starts a round, runs a timer, scores an answer or touches a team.</p>
      <ul className="dm-guard" aria-label="What demo mode never does"><li>No timers</li><li>No real scores</li><li>No attempts or hints used</li><li>No submissions stored</li><li>No team data touched</li></ul></section>
    <div className="cn-launch-grid">
      <section className="cn-console cn-r1" aria-labelledby="dm-r1"><header><span className="cn-badge">ROUND 1 · DIGITAL</span><h2 id="dm-r1">NEXUS Incident Response</h2><p>Five linked chapters, all open. Edits stay on screen.</p></header>
        <ol className="cn-tiles">{r1.map((s, i) => <li key={s.href}><a href={s.href} aria-label={s.label} className="cn-tile" style={{ ["--i" as string]: i }}><span className="cn-tile-n" aria-hidden="true">0{i + 1}</span><span className="cn-tile-ic" aria-hidden="true">{R1_ICONS[i]}</span><b aria-hidden="true">{s.label.replace(/^\d · /, "")}</b><small aria-hidden="true">{R1_SUB[i]}</small></a></li>)}</ol>
        <Link className="cn-launch-btn" href="/admin/demo/round1">Open mission dashboard</Link></section>
      <section className="cn-console cn-r2" aria-labelledby="dm-r2"><header><span className="cn-badge cn-badge-amber">ROUND 2 · 60 MIN</span><h2 id="dm-r2">GHOST RETURNS — 60-MINUTE INVESTIGATION</h2><p>Four injects, all open for the whole 60 minutes. Answers go on paper; only Kill Switch takes typed commands.</p></header>
        <ol className="cn-tiles cn-tiles-4">{r2.map((s, i) => <li key={s.href}><a href={s.href} aria-label={s.label} className="cn-tile" style={{ ["--i" as string]: i }}><span className="cn-tile-n" aria-hidden="true">0{i + 1}</span><span className="cn-tile-ic" aria-hidden="true">{R2_ICONS[i]}</span><b aria-hidden="true">{s.label.replace(/^\d · /, "")}</b><small aria-hidden="true">{R2_SUB[i]}</small></a></li>)}</ol>
        <a className="cn-launch-btn" href="/admin/demo/round2?unit=1">Launch GHOST RETURNS — 60-minute investigation</a></section>
    </div>
    <p className="dm-foot">Preview state lives only in this browser tab. Reset demo (or a refresh) clears it. To run the real event, use the organizer dashboard.</p>
  </main>;
}
