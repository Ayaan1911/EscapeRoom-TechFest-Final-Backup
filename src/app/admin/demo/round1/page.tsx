import { requireDemoAdmin } from "@/lib/demo/demo.server";

const STAGES = [
  { slug: "inbox", name: "The Inbox", focus: "Find the breach email and prove the entry point", max: 15, gate: 8, next: "Trail" },
  { slug: "trail", name: "The Trail", focus: "Reconstruct the stolen session in the logs", max: 25, gate: 13, next: "Insider" },
  { slug: "insider", name: "The Insider", focus: "Unlock the Evidence Wall and name the insider", max: 25, gate: 13, next: "Containment" },
  { slug: "containment", name: "Containment", focus: "Order the incident and plan the response", max: 20, gate: 10, next: "Final Verdict" },
  { slug: "verdict", name: "Final Verdict", focus: "Link the evidence and reach one verdict", max: 15, gate: 0, next: "" },
] as const;
const EXAMPLES = [["Locked", "is-locked", "Needs 8 points in the previous chapter"], ["Available", "is-available", "Open, nothing scored yet"], ["In progress", "is-progress", "5 / 15 · partial credit saved"], ["Complete", "is-complete", "15 / 15 · case chapter closed"]] as const;

export default async function DemoRound1() {
  await requireDemoAdmin();
  return <main className="dashboard-main dm-r1home">
    <header className="dm-mission"><div><span className="k-eyebrow">ROUND 1 · NEXUS INCIDENT RESPONSE</span><h1>Mission operations <em>preview</em></h1>
      <p>Five connected stages. In a real round the next stage opens when a team banks half of this one; here every stage is open.</p></div>
      <dl className="dm-vitals"><div><dt>Clock</dt><dd>DEMO</dd></div><div><dt>Score</dt><dd>—</dd></div><div><dt>Stages open</dt><dd>5 / 5</dd></div></dl></header>
    <ol className="dm-path" aria-label="Investigation stages">{STAGES.map((s, i) => <li key={s.slug} className="dm-stage" data-n={i + 1}>
      <span className="dm-node" aria-hidden="true">{i + 1}</span>
      <div><h2>{s.name}</h2><p>{s.focus}</p><small className="k-mono">{s.max} pts{s.gate ? ` · ${s.gate} unlocks ${s.next}` : " · final"}</small></div>
      <a className="k-btn k-btn-primary" href={`/admin/demo/round1/${s.slug}`}>Open Chapter {i + 1}<span className="k-sr"> — {s.name}</span></a></li>)}</ol>
    <section className="dm-examples" aria-label="Illustrative stage states"><h2>How a team sees progress <small>illustration only</small></h2>
      <ul>{EXAMPLES.map(([name, cls, text]) => <li key={name} className={cls}><b>{name}</b><span>{text}</span></li>)}</ul></section>
  </main>;
}
