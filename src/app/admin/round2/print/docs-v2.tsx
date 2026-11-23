import { caseKey } from "@/lib/round2/paper/private-key.server";
import { OPEN_BUFFER, OPEN_PACE } from "@/lib/round2/paper/format";

// Printable materials for the open-60 format (case document v2). Rendered only by the admin-gated print route.
// The key and rubric come from the git-ignored private file; nothing secret is in this source file.
export const DOCS_V2 = [
  { slug: "v2-answer-sheet", title: "Case v2 · Answer sheet for teams (60 min)", note: "One per team. Matches the four open injects." },
  { slug: "v2-key", title: "Case v2 · Organizer key and marking rubric", note: "ORGANIZER ONLY. Read from private/round2-key-v2.json.", secret: true },
  { slug: "v2-script", title: "Case v2 · 60-minute pacing script", note: "Suggested pacing; injects are never locked." },
] as const;
const Lines = ({ n = 2 }: { n?: number }) => <>{Array.from({ length: n }, (_, i) => <div key={i} className="pp-line" />)}</>;
const Field = ({ w }: { w: string }) => <span className="pp-field" style={{ width: w }} />;
const head = (n: number, t: string, min: string) => <header className="pp-ch"><span>INJECT {n}</span><h2>{t}</h2><small>{min}</small></header>;
const pace = (n: number) => { const p = OPEN_PACE[n - 1]; return `suggested ${p.fromMin}:00 – ${p.toMin}:00`; };

export function AnswerSheetV2() {
  return <>
    <section className="pp-page"><h1>GHOST RETURNS · Part A answer sheet (case v2)</h1><p className="pp-row"><span className="pp-field" style={{ width: "60%" }}>Team name</span><span className="pp-field" style={{ width: "30%" }}>Team ID</span></p>
      <p className="pp-rules">60 minutes. All four injects stay open on screen until pens down. Write every answer on this paper. No phones, no AI. Only Inject 2 takes typed commands (BLOCK &lt;IP&gt;, 4 attempts).</p>
      {head(1, "Alert at 2:14 AM", pace(1))}
      <p><b>Chosen letter (A–E):</b> <span className="pp-box" /></p>
      <p><b>Evidence 1</b> (tab + what you saw)</p><Lines /><p><b>Evidence 2</b> (a different tab + what you saw)</p><Lines />
      <p><b>Why this decision</b> (one line)</p><Lines n={1} /><p><b>A tempting alternative (letter) and why it fails</b></p><Lines /></section>
    <section className="pp-page">{head(2, "Kill Switch", pace(2))}
      <p><b>IP addresses you blocked in the terminal</b> (in order)</p>{[1, 2, 3, 4].map(n => <p key={n}>{n}. <Field w="55%" /></p>)}
      <p><b>Volunteer notes</b> (volunteer only)</p><Lines n={3} /><p><b>Deductions recorded by the volunteer</b> (volunteer only): <span className="pp-box" /></p></section>
    <section className="pp-page">{head(3, "Audit the AI", pace(3))}
      <table className="pp-table"><thead><tr><th>Claim</th><th>Circle one</th><th>Record IDs</th><th>One line of reasoning</th></tr></thead>
        <tbody>{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <tr key={n}><td>{n}</td><td>TRUE / FALSE / NOT ENOUGH EVIDENCE</td><td>R-___ R-___</td><td /></tr>)}</tbody></table>
      <p><b>The record that contains the planted line:</b> R-<span className="pp-box" /></p></section>
    <section className="pp-page">{head(4, "The Three Calls", pace(4))}
      {[1, 2, 3].map(n => <div key={n}><p><b>Call {n}:</b> letter <span className="pp-box" /> &nbsp; Reason (one line)</p><Lines n={1} /></div>)}
      <p><b>Public statement:</b> numbers of your two sentences <span className="pp-box" /> <span className="pp-box" /></p>
      <p className="pp-foot">Pens down at 60:00. Hand this sheet to a volunteer.</p></section>
  </>;
}

export function KeyV2() {
  const k = caseKey();
  if (!k) return <section className="pp-page"><p className="pp-secret">ORGANIZER ONLY</p><h1>Case v2 key not installed</h1><p>Place the approved key file at <code>private/round2-key-v2.json</code> on the event server (format in docs/ghost404-round2-open60.md). Until then the Inject 2 terminal stays offline and this page has nothing to print.</p></section>;
  return <section className="pp-page"><p className="pp-secret">ORGANIZER ONLY — CASE v2 ANSWER KEY — DO NOT SHARE WITH TEAMS</p><h1>GHOST RETURNS · Case v2 key and rubric (provisional total 60)</h1>
    <h2>Inject 1 · Alert at 2:14 AM (15)</h2><p><b>Correct:</b> {k.inject1.answer}</p><p>{k.inject1.rationale}</p><p><b>Accept as evidence:</b></p><ul>{k.inject1.evidence.map(x => <li key={x}>{x}</li>)}</ul><p><b>Decoys (not evidence of compromise):</b></p><ul>{k.inject1.decoys.map(x => <li key={x}>{x}</li>)}</ul><p><b>Marking:</b> {k.inject1.split}</p>
    <h2>Inject 2 · Kill Switch (15, {k.inject2.status === "approved" ? "approved" : "PROVISIONAL"})</h2><p><b>Attacker connections:</b> {k.inject2.malicious.join(", ")}</p><p><b>Cleared:</b> {k.inject2.cleared.join(", ")}</p><p><b>Source:</b> {k.inject2.source}</p><p><b>Marking:</b> {k.inject2.split}</p><p><b>Hints:</b> {k.inject2.hints}</p>
    <h2>Inject 3 · Audit the AI (15)</h2><table className="pp-table"><thead><tr><th>#</th><th>Classification</th><th>Accept reasoning like</th></tr></thead><tbody>{k.inject3.claims.map(c => <tr key={c.n}><td>{c.n}</td><td>{c.verdict}</td><td>{c.reason}</td></tr>)}</tbody></table><p>{k.inject3.planted}</p><p><b>Marking:</b> {k.inject3.split}</p>
    <h2>Inject 4 · The Three Calls (15)</h2><ul>{k.inject4.calls.map(c => <li key={c.n}><b>Call {c.n}: {c.correct}</b>{Object.entries(c.flaws).map(([l, w]) => <div key={l}>{l}: {w}</div>)}</li>)}</ul>
    <p><b>Statement sentences:</b> {k.inject4.statements.good.join(" and ")}</p><ul>{k.inject4.statements.bad.map(b => <li key={b.n}>{b.n}: {b.why}</li>)}</ul><p><b>Marking:</b> {k.inject4.split}</p></section>;
}

export function ScriptV2() {
  return <section className="pp-page"><h1>GHOST RETURNS · Case v2 timing script (60 minutes)</h1><p>Start in the control room with the <b>60-minute open-inject</b> format. The format is fixed once started. All injects are open the whole time; the pacing below is advice to read aloud.</p>
    <table className="pp-table"><thead><tr><th>Clock</th><th>Say</th></tr></thead><tbody>
      <tr><td>-10:00</td><td>Phones away. Pens and answer sheets out. All finalists on the stand-by screen.</td></tr>
      {OPEN_PACE.map(p => <tr key={p.n}><td>{p.fromMin}:00</td><td>&quot;Suggested: Inject {p.n}, {p.title}, about {p.toMin - p.fromMin} minutes.&quot;{p.n === 2 ? " Remind teams: four BLOCK attempts per team, every attempt counts, write the IPs on paper." : ""}</td></tr>)}
      <tr><td>{OPEN_BUFFER.fromMin}:00</td><td>&quot;Three minutes left. Finish writing.&quot;</td></tr>
      <tr><td>60:00</td><td>&quot;Pens down.&quot; The screens close and the terminal locks by themselves. Collect sheets.</td></tr>
    </tbody></table><p>Volunteers: a team that has used all four attempts may ask for help. Record any deduction on their sheet; never reset attempts.</p></section>;
}
