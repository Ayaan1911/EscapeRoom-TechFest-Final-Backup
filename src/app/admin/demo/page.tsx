import Link from "next/link";
import { requireDemoAdmin } from "@/lib/demo/demo.server";
import { DEMO_STOPS } from "@/lib/demo/stops";

export default async function DemoHome() {
  await requireDemoAdmin();
  const group = (g: string) => DEMO_STOPS.filter(s => s.group === g && s.href !== "/admin/demo/round1");
  return <main className="dashboard-main dm-home">
    <section className="dm-hero"><span className="k-eyebrow">ORGANIZER PREVIEW</span><h1>OPERATION GHOST_404 <em>demonstration mode</em></h1>
      <p>Explore every chapter and every Round 2 chapter with the real interface. Nothing here starts a round, runs a timer, scores an answer or touches a team.</p>
      <ul className="dm-guard" aria-label="What demo mode never does"><li>No timers</li><li>No real scores</li><li>No attempts or hints used</li><li>No submissions stored</li><li>No team data touched</li></ul></section>
    <div className="dm-grid">
      <section className="dm-card dm-r1"><span className="k-eyebrow">ROUND 1</span><h2>NEXUS Incident Response</h2><p>Five chapters, all open. Edits stay on screen.</p>
        <Link className="k-btn k-btn-primary k-btn-lg" href="/admin/demo/round1">Open mission dashboard</Link>
        <ol>{group("Round 1").map(s => <li key={s.href}><a href={s.href}>{s.label}</a></li>)}</ol></section>
      <section className="dm-card dm-r2"><span className="k-eyebrow">ROUND 2</span><h2>GHOST RETURNS</h2><p>Part A live incidents and Part B digital tribunal, all released.</p>
        <a className="k-btn k-btn-primary k-btn-lg" href="/admin/demo/round2?unit=1">Open Round 2</a>
        <ol>{group("Round 2").map(s => <li key={s.href}><a href={s.href}>{s.label}</a></li>)}</ol></section>
    </div>
    <p className="dm-foot">Preview state lives only in this browser tab. Reset demo (or a refresh) clears it. To run the real event, use the organizer dashboard.</p>
  </main>;
}
