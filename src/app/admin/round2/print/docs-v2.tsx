import { caseKey } from "@/lib/round2/paper/private-key.server";
import { terminalReview } from "@/lib/round2/paper/terminal.server";
import { OPEN_BUFFER, OPEN_PACE, POINTS, RULES } from "@/lib/round2/paper/format";

// Printable materials for GHOST RETURNS Part A (the only Round 2 format). Rendered only by the admin-gated print route.
// Keys, slips and scores come from the git-ignored private file and the server's attempt history; nothing secret is in this source file.
export const DOCS_V2 = [
  { slug: "answer-sheet", title: "Team answer sheet", note: "One per team. All four injects." },
  { slug: "key", title: "Organizer answer key and marking rubric", note: "ORGANIZER ONLY. Read from private/round2-key-v2.json.", secret: true },
  { slug: "slips", title: "Kill Switch correct-IP slips (volunteers)", note: "ORGANIZER ONLY. Cut and hand over only after a team's terminal is out of attempts.", secret: true },
  { slug: "terminal", title: "Kill Switch terminal results", note: "Live: every team's attempts and terminal score (0–15)." },
  { slug: "score-sheet", title: "Round 2 score sheet (60)", note: "Terminal score pre-filled; paper marks by the jury." },
  { slug: "script", title: "Organizer timing script (60 minutes)", note: "Suggested pacing; injects are never locked." },
] as const;
const Lines = ({ n = 2 }: { n?: number }) => <>{Array.from({ length: n }, (_, i) => <div key={i} className="pp-line" />)}</>;
const Field = ({ w }: { w: string }) => <span className="pp-field" style={{ width: w }} />;
const head = (n: number, t: string) => { const p = OPEN_PACE[n - 1]; return <header className="pp-ch"><span>INJECT {n}</span><h2>{t}</h2><small>suggested {p.fromMin}:00 – {p.toMin}:00</small></header>; };
const missing = <section className="pp-page"><p className="pp-secret">ORGANIZER ONLY</p><h1>Answer key not installed</h1><p>Place the approved key file at <code>private/round2-key-v2.json</code> on the event server (format in docs/ghost404-round2-open60.md). Until then the Kill Switch terminal stays offline.</p></section>;

export function AnswerSheetV2() {
  return <>
    <section className="pp-page"><h1>GHOST RETURNS · Part A answer sheet</h1><p className="pp-row"><span className="pp-field" style={{ width: "60%" }}>Team name</span><span className="pp-field" style={{ width: "30%" }}>Team ID</span></p>
      <ul className="pp-rules">{RULES.map(r => <li key={r}>{r}</li>)}</ul>
      {head(1, "Alert at 2:14 AM")}
      <p><b>Chosen letter (A–E):</b> <span className="pp-box" /></p>
      <p><b>Evidence 1</b> (tab + what you saw)</p><Lines /><p><b>Evidence 2</b> (a different tab + what you saw)</p><Lines />
      <p><b>Why this decision</b> (one line)</p><Lines n={1} /><p><b>A tempting alternative (letter) and why it fails</b></p><Lines /></section>
    <section className="pp-page">{head(2, "Kill Switch")}
      <p><b>Attacker IP 1:</b> <Field w="45%" /></p><p>Evidence</p><Lines /><p><b>Attacker IP 2:</b> <Field w="45%" /></p><p>Evidence</p><Lines />
      <p><b>A convincing legitimate connection that must NOT be blocked, and why</b></p><Lines n={3} />
      <p><b>IP addresses you blocked in the terminal</b> (in order)</p>{[1, 2, 3, 4].map(n => <p key={n}>{n}. <Field w="45%" /></p>)}
      <p><b>Volunteer only:</b> correct-IP slip handed over? &nbsp; YES / NO &nbsp; · notes</p><Lines n={2} /></section>
    <section className="pp-page">{head(3, "Audit the AI")}
      <table className="pp-table"><thead><tr><th>Claim</th><th>Circle one</th><th>Record IDs</th><th>One line of reasoning</th></tr></thead>
        <tbody>{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <tr key={n}><td>{n}</td><td>TRUE / FALSE / NOT ENOUGH EVIDENCE</td><td>R-___ R-___</td><td /></tr>)}</tbody></table>
      <p><b>The record that contains the planted line:</b> R-<span className="pp-box" /></p></section>
    <section className="pp-page">{head(4, "The Three Calls")}
      {[1, 2, 3].map(n => <div key={n}><p><b>Call {n}:</b> letter <span className="pp-box" /> &nbsp; Reason (one line)</p><Lines n={1} /></div>)}
      <p><b>Public statement:</b> numbers of your two sentences <span className="pp-box" /> <span className="pp-box" /></p>
      <p className="pp-foot">Pens down at 60:00. Hand this sheet to a volunteer.</p></section>
  </>;
}

export function KeyV2() {
  const k = caseKey();
  if (!k) return missing;
  return <section className="pp-page"><p className="pp-secret">ORGANIZER ONLY — ANSWER KEY — DO NOT SHARE WITH TEAMS</p><h1>GHOST RETURNS · Answer key and rubric ({POINTS.total} points)</h1>
    <h2>Inject 1 · Alert at 2:14 AM ({POINTS.inject1}, paper)</h2><p><b>Correct:</b> {k.inject1.answer}</p><p>{k.inject1.rationale}</p><p><b>Accept as evidence:</b></p><ul>{k.inject1.evidence.map(x => <li key={x}>{x}</li>)}</ul><p><b>Decoys:</b></p><ul>{k.inject1.decoys.map(x => <li key={x}>{x}</li>)}</ul><p><b>Marking:</b> {k.inject1.split}</p>
    <h2>Inject 2 · Kill Switch ({POINTS.inject2}, terminal + paper check · key {k.inject2.status})</h2><p><b>Attacker connections:</b> {k.inject2.malicious.join(", ")}</p><p><b>Legitimate:</b> {k.inject2.cleared.join(", ")}</p><p><b>Why:</b> {k.inject2.hints}</p><p><b>Marking:</b> {k.inject2.split}</p><p><b>Source:</b> {k.inject2.source}</p>
    <h2>Inject 3 · Audit the AI ({POINTS.inject3}, paper)</h2><table className="pp-table"><thead><tr><th>#</th><th>Classification</th><th>Accept reasoning like</th></tr></thead><tbody>{k.inject3.claims.map(c => <tr key={c.n}><td>{c.n}</td><td>{c.verdict}</td><td>{c.reason}</td></tr>)}</tbody></table><p>{k.inject3.planted}</p><p><b>Marking:</b> {k.inject3.split}</p>
    <h2>Inject 4 · The Three Calls ({POINTS.inject4}, paper)</h2><ul>{k.inject4.calls.map(c => <li key={c.n}><b>Call {c.n}: {c.correct}</b>{Object.entries(c.flaws).map(([l, w]) => <div key={l}>{l}: {w}</div>)}</li>)}</ul>
    <p><b>Statement sentences:</b> {k.inject4.statements.good.join(" and ")}</p><ul>{k.inject4.statements.bad.map(b => <li key={b.n}>{b.n}: {b.why}</li>)}</ul><p><b>Marking:</b> {k.inject4.split}</p></section>;
}

export function VolunteerSlips() {
  const k = caseKey();
  if (!k) return missing;
  return <section className="pp-page"><p className="pp-secret">ORGANIZER ONLY — hand a slip to a team only after its terminal shows OUT OF ATTEMPTS</p><h1>Kill Switch · correct-IP slips</h1>
    <p>The slip lets the team finish its paper reasoning. Revealed IPs earn no terminal credit; the terminal score already counts only what the team blocked itself. Never reset a team&apos;s attempts.</p>
    <div className="pp-slips">{Array.from({ length: 12 }, (_, i) => <div key={i} className="pp-slip"><b>KILL SWITCH · ATTACKER CONNECTIONS</b><span>{k.inject2.malicious.join("   ·   ")}</span><small>Team: ____________ · Volunteer: ________ · Time: ______</small></div>)}</div></section>;
}

export async function TerminalResults() {
  const r = await terminalReview();
  return <section className="pp-page"><h1>Kill Switch · terminal results</h1><p>{r.keyReady ? `Key ${r.keyStatus}. ` : "KEY NOT INSTALLED: scores unavailable. "}Score = +5 per attacker connection blocked, +5 if no legitimate connection blocked, −2 per legitimate connection blocked, 0–15. {r.open ? "Round 2 is still running; figures can change." : ""}</p>
    <table className="pp-table"><thead><tr><th>Team</th><th>Attempts (IP · result)</th><th>Left</th><th>State</th><th>Score</th></tr></thead>
      <tbody>{r.teams.map(t => <tr key={t.teamId}><td>{t.teamId}<br /><small>{t.name}</small></td><td>{t.attempts.length ? t.attempts.map(a => <div key={a.seq}>{a.seq}. {a.ip} · {a.result === "caught" ? "attacker" : "legitimate"}</div>) : <i>no attempt{t.untouched ? " (untouched: see note)" : ""}</i>}</td><td>{t.remaining}</td><td>{t.lockReason}</td><td><b>{t.score ?? "—"}</b></td></tr>)}</tbody></table>
    <p className="pp-foot">Untouched terminal: the formula as written gives 5 (no legitimate block). This edge case is flagged for the organizer; see docs/ghost404-round2-open60.md.</p></section>;
}

export async function ScoreSheet60() {
  const r = await terminalReview();
  return <section className="pp-page"><h1>GHOST RETURNS · Round 2 score sheet ({POINTS.total})</h1>
    <table className="pp-table"><thead><tr><th>Team</th><th>Inject 1 (/{POINTS.inject1})</th><th>Inject 2 terminal (/{POINTS.inject2})</th><th>Inject 2 paper check ✓</th><th>Inject 3 (/{POINTS.inject3})</th><th>Inject 4 (/{POINTS.inject4})</th><th>Total (/{POINTS.total})</th></tr></thead>
      <tbody>{r.teams.map(t => <tr key={t.teamId}><td>{t.teamId}</td><td /><td>{t.score ?? ""}</td><td /><td /><td /><td /></tr>)}</tbody></table>
    <p>The Inject 2 terminal score is computed by the portal and is not changed by hand. The paper check confirms the team&apos;s written evidence and adds no points.</p></section>;
}

export function ScriptV2() {
  return <section className="pp-page"><h1>GHOST RETURNS · Timing script (60 minutes)</h1><p>Press <b>Start Round 2</b> in the control room. All injects are open the whole time; the pacing below is advice to read aloud.</p>
    <table className="pp-table"><thead><tr><th>Clock</th><th>Say</th></tr></thead><tbody>
      <tr><td>-10:00</td><td>Phones away. No AI tools. Pens and answer sheets out. All finalists on the stand-by screen.</td></tr>
      {OPEN_PACE.map(p => <tr key={p.n}><td>{p.fromMin}:00</td><td>&quot;Suggested: Inject {p.n}, {p.title}, about {p.toMin - p.fromMin} minutes.&quot;{p.n === 2 ? " Remind teams: four BLOCK attempts per team, every first block counts, write the IPs on paper." : ""}</td></tr>)}
      <tr><td>{OPEN_BUFFER.fromMin}:00</td><td>&quot;Three minutes left. Finish writing.&quot;</td></tr>
      <tr><td>60:00</td><td>&quot;Pens down.&quot; Screens close and the terminal locks by themselves. Collect sheets. Print the terminal results.</td></tr>
    </tbody></table><p>Volunteers: when a team&apos;s terminal says OUT OF ATTEMPTS, hand over one correct-IP slip and tick it on the team&apos;s sheet. Never reset attempts; there is no reset.</p></section>;
}
