import { KEY, PART_A_MAX, PART_B_MAX, PART_B_RUBRIC, TIMING_SCRIPT, TOTAL_MAX } from "@/lib/round2/paper/key.server";

// Server components for the printable jury materials. Rendered only by admin-gated pages (requireAdmin runs before any of these).
export const DOCS = [
  { slug: "answer-sheet", title: "Team answer sheet", note: "Print one set per team (4 pages)." },
  { slug: "key", title: "Organizer answer key", note: "ORGANIZER ONLY. Never hand to teams.", secret: true },
  { slug: "rubric-a", title: "Part A marking rubric (60)", note: "Marking grid per chapter." },
  { slug: "rubric-b", title: "Boardroom Verdict rubric (40)", note: "One per team per judge." },
  { slug: "score-sheet", title: "Combined paper score sheet (100)", note: "One per panel or one for the room." },
  { slug: "script", title: "Organizer timing script", note: "Read from this during the 40 minutes." },
] as const;
const Lines = ({ n = 3 }: { n?: number }) => <>{Array.from({ length: n }, (_, i) => <div key={i} className="pp-line" />)}</>;
const Field = ({ label, w }: { label: string; w?: string }) => <span className="pp-field" style={w ? { width: w } : undefined}>{label}</span>;
const Banner = ({ children }: { children: React.ReactNode }) => <p className="pp-secret">{children}</p>;

export function AnswerSheet() {
  const head = (n: number, t: string, min: string) => <header className="pp-ch"><span>CHAPTER {n}</span><h2>{t}</h2><small>{min}</small></header>;
  return <>
    <section className="pp-page"><h1>GHOST RETURNS · Answer sheet</h1><p className="pp-row"><Field label="Team name" w="60%" /><Field label="Team ID" w="30%" /></p>
      <p className="pp-rules">Write everything on this paper. No phones. No AI. The screen is for reading only; nothing is submitted online. When a chapter closes you cannot go back to it on screen.</p>
      {head(1, "Alert at 2:14 AM", "0:00 – 8:00")}
      <p><b>Your action (letter A–E):</b> <span className="pp-box" /></p><p><b>Evidence 1</b> (tab name + what you saw)</p><Lines n={2} /><p><b>Evidence 2</b> (tab name + what you saw)</p><Lines n={2} /><p><b>Why this action?</b> (one line)</p><Lines n={2} /></section>
    <section className="pp-page">{head(2, "Kill Switch", "8:00 – 20:00")}
      <p><b>Attacker IP 1:</b> <Field label="" w="50%" /></p><p>Evidence</p><Lines n={3} /><p><b>Attacker IP 2:</b> <Field label="" w="50%" /></p><p>Evidence</p><Lines n={3} />
      <p><b>One convincing legitimate connection that must NOT be blocked, and why:</b></p><Lines n={4} /></section>
    <section className="pp-page">{head(3, "Audit the AI", "20:00 – 30:00")}
      <table className="pp-table"><thead><tr><th>Claim</th><th>Circle one</th><th>One clue or explanation</th></tr></thead><tbody>{[1, 2, 3, 4, 5].map(n => <tr key={n}><td>{n}</td><td>TRUE &nbsp; / &nbsp; FALSE</td><td className="pp-tall" /></tr>)}</tbody></table></section>
    <section className="pp-page">{head(4, "The Three Calls", "30:00 – 40:00")}
      {[1, 2, 3].map(n => <div key={n}><p><b>Call {n}:</b> letter <span className="pp-box" /> &nbsp; Reason (one line)</p><Lines n={2} /></div>)}
      <p><b>Public statement:</b> the numbers of your two sentences <span className="pp-box" /> <span className="pp-box" /></p>
      <p className="pp-foot">Total pens-down at 40:00. Hand this sheet to a volunteer.</p></section>
  </>;
}

export function AnswerKey() {
  const k = KEY;
  return <section className="pp-page"><Banner>ORGANIZER ONLY — ANSWER KEY — DO NOT SHARE WITH TEAMS</Banner><h1>GHOST RETURNS · Answer key</h1>
    <h2>Chapter 1 · Alert at 2:14 AM ({k.ch1.max})</h2><p><b>Correct:</b> {k.ch1.answer}</p><ul>{k.ch1.why.map(x => <li key={x}>{x}</li>)}</ul><p><b>Good evidence:</b></p><ul>{k.ch1.evidence.map(x => <li key={x}>{x}</li>)}</ul><p>Split: {k.ch1.split}</p>
    <h2>Chapter 2 · Kill Switch ({k.ch2.max})</h2><p><b>Attacker-controlled:</b></p><ul>{k.ch2.rogue.map(x => <li key={x}>{x}</li>)}</ul><p><b>Legitimate look-alikes (must not be named as attacker):</b></p><ul>{k.ch2.decoys.map(x => <li key={x}>{x}</li>)}</ul><p>Split: {k.ch2.split}</p><p><i>{k.ch2.note}</i></p>
    <h2>Chapter 3 · Audit the AI ({k.ch3.max})</h2><table className="pp-table"><thead><tr><th>#</th><th>Verdict</th><th>Accept a clue like</th></tr></thead><tbody>{k.ch3.claims.map(c => <tr key={c.n}><td>{c.n}</td><td><b>{c.verdict}</b></td><td>{c.clue}</td></tr>)}</tbody></table><p>{k.ch3.planted}</p><p>Split: {k.ch3.split}</p>
    <h2>Chapter 4 · The Three Calls ({k.ch4.max})</h2><ul>{k.ch4.calls.map(c => <li key={c.n}>Call {c.n}: <b>{c.correct}</b> — {c.text}</li>)}</ul><p>Statements: choose <b>1</b> and <b>3</b>. Wrong: {k.ch4.statements.bad.map(b => `${b.n} (${b.why})`).join(", ")}.</p><p>Split: {k.ch4.split}</p></section>;
}

const Grid = ({ rows, max }: { rows: [string, number][]; max: number }) => <table className="pp-table"><thead><tr><th>Item</th><th>Max</th><th>Awarded</th></tr></thead><tbody>{rows.map(([t, m]) => <tr key={t}><td>{t}</td><td>{m}</td><td /></tr>)}<tr className="pp-sum"><td>Chapter total</td><td>{max}</td><td /></tr></tbody></table>;
export function RubricA() {
  return <section className="pp-page"><Banner>ORGANIZER ONLY — use with the answer key</Banner><h1>Part A marking rubric ({PART_A_MAX})</h1><p className="pp-row"><Field label="Team" w="50%" /><Field label="Marked by" w="35%" /></p>
    <h2>Chapter 1 (15)</h2><Grid max={15} rows={[["Correct action (A)", 5], ["Evidence point 1 (tab + what was seen)", 3], ["Evidence point 2", 3], ["Reasoning", 4]]} />
    <h2>Chapter 2 (15)</h2><Grid max={15} rows={[["Attacker IP 1 + supporting evidence", 5], ["Attacker IP 2 + supporting evidence", 5], ["Why a convincing legitimate connection must not be blocked", 5], ["Minus 2 per legitimate connection named as attacker (not below 0)", 0]]} />
    <h2>Chapter 3 (15)</h2><Grid max={15} rows={[1, 2, 3, 4, 5].map(n => [`Claim ${n}: TRUE/FALSE (1) + clue and reasoning (2)`, 3] as [string, number])} />
    <h2>Chapter 4 (15)</h2><Grid max={15} rows={[["Call 1: letter (3) + reasoning (1)", 4], ["Call 2: letter (3) + reasoning (1)", 4], ["Call 3: letter (3) + reasoning (1)", 4], ["Both correct statements (1 and 3)", 3]]} />
    <p className="pp-total"><b>PART A TOTAL ____ / {PART_A_MAX}</b></p></section>;
}
export function RubricB() {
  return <section className="pp-page"><h1>Boardroom Verdict rubric ({PART_B_MAX})</h1><p className="pp-row"><Field label="Team" w="40%" /><Field label="Panel" w="15%" /><Field label="Judge" w="30%" /></p>
    <p className="pp-rules">About 4 minutes per team. Devices away. Every member speaks and answers at least one question. Use the team&apos;s paper notes.</p>
    <table className="pp-table"><thead><tr><th>Criterion</th><th>Look for</th><th>Max</th><th>Mark</th></tr></thead><tbody>{PART_B_RUBRIC.map(r => <tr key={r.criterion}><td><b>{r.criterion}</b></td><td>{r.look}</td><td>{r.max}</td><td /></tr>)}<tr className="pp-sum"><td colSpan={2}>Boardroom total</td><td>{PART_B_MAX}</td><td /></tr></tbody></table>
    <p>Question asked / notes:</p><Lines n={5} /><p className="pp-rules">Two judges per panel: each marks independently, then agree one final mark per criterion.</p></section>;
}
export function ScoreSheet() {
  return <section className="pp-page pp-wide"><h1>Combined score sheet ({TOTAL_MAX})</h1><p className="pp-row"><Field label="Panel / room" w="40%" /><Field label="Totalled by" w="30%" /></p>
    <table className="pp-table"><thead><tr><th>Team</th><th>Ch 1<br />(15)</th><th>Ch 2<br />(15)</th><th>Ch 3<br />(15)</th><th>Ch 4<br />(15)</th><th>Part A<br />({PART_A_MAX})</th><th>Part B<br />({PART_B_MAX})</th><th>TOTAL<br />({TOTAL_MAX})</th><th>Rank</th></tr></thead><tbody>{Array.from({ length: 10 }, (_, i) => <tr key={i}><td className="pp-tall">{i + 1}.</td><td /><td /><td /><td /><td /><td /><td /><td /></tr>)}</tbody></table>
    <p className="pp-rules">All points are added by hand. Top 3 totals win. Tie: higher Boardroom score first; any remaining tie is decided by the jury (Part A is fixed-time for every team, so there is no finish-time tiebreak).</p></section>;
}
export function Script() {
  return <section className="pp-page"><h1>Organizer timing script</h1><table className="pp-table"><thead><tr><th>Clock</th><th>Say / do</th></tr></thead><tbody>{TIMING_SCRIPT.map(s => <tr key={s.clock}><td><b>{s.clock}</b></td><td>{s.say}</td></tr>)}</tbody></table>
    <p className="pp-rules">Chapters switch on the server clock; the projector shows the countdown and a GHOST_404 taunt at each switch. If something goes wrong, use “End investigation now” in the control room and announce PENS DOWN.</p></section>;
}
