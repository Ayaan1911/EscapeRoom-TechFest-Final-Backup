"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Progress } from "@/lib/game/engine";
import type { InboxArtifact, InboxEvidence } from "@/types/inbox";

type InboxState = { progress: Progress; score: number; current: number; status: string; chapterHints: string[][]; serverNow: number; round: { deadline: string | null } };

function EvidenceSelect({ label, name, artifacts }: { label: string; name: string; artifacts: InboxArtifact[] }) {
  return <label>{label}<select name={name} required defaultValue=""><option value="" disabled>Select an evidence record</option>{artifacts.map(artifact => <option key={artifact.id} value={artifact.id}>{artifact.id} · {artifact.title}</option>)}</select></label>;
}

export function InboxDesk({ evidence, initialState }: { evidence: Omit<InboxEvidence, "snapshot">; initialState: InboxState }) {
  const [state, setState] = useState(initialState);
  const [selectedId, setSelectedId] = useState(evidence.emails[0].id);
  const [read, setRead] = useState([evidence.emails[0].id]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [connection, setConnection] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState({ now: 0, remaining: Math.max(0, Math.ceil((Date.parse(initialState.round.deadline ?? "") - initialState.serverNow) / 1000)) || 0 });
  const email = evidence.emails.find(item => item.id === selectedId)!;
  const completed = state.progress.chapters[0].completedAt !== null;
  const editable = state.status === "active" && state.current === 0 && !completed;
  const retrySeconds = Math.max(0, Math.ceil((retryAt - clock.now) / 1000));

  async function refresh() {
    const response = await fetch("/api/game", { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 ? "Session expired. Sign in again." : "Connection interrupted. Retrying; your saved progress is safe.");
    setState(await response.json());
    setConnection("");
  }
  useEffect(() => {
    let alive = true;
    const poll = setInterval(async () => {
      try {
        const response = await fetch("/api/game", { cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 401 ? "Session expired. Sign in again." : "Connection interrupted. Retrying; your saved progress is safe.");
        const snapshot: InboxState = await response.json();
        if (alive) { setState(snapshot); setConnection(""); }
      } catch (error) { if (alive) setConnection(error instanceof TypeError ? "Connection interrupted. Retrying; your saved progress is safe." : (error as Error).message); }
    }, 5000);
    return () => { alive = false; clearInterval(poll); };
  }, []);
  useEffect(() => {
    const received = performance.now();
    const timer = setInterval(() => setClock({ now: Date.now(), remaining: state.status === "active" && state.round.deadline ? Math.max(0, Math.ceil((Date.parse(state.round.deadline) - state.serverNow - (performance.now() - received)) / 1000)) : 0 }), 1000);
    return () => clearInterval(timer);
  }, [state.serverNow, state.round.deadline, state.status]);

  async function send(action: "hint" | "submit", answer?: unknown) {
    if (busy) return;
    setBusy(true); setFeedback("");
    try {
      const response = await fetch("/api/game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, chapter: 0, ...(answer ? { answer } : {}) }) });
      const result = await response.json();
      if (action === "submit") setRetryAt(Date.now() + (result.retryAfter ?? 3) * 1000);
      if (!response.ok) throw new Error(result.error ?? "Unable to save. Retry when the connection returns.");
      setFeedback(result.hint ? "Hint released and saved." : result.accepted ? "Conclusion accepted. Chapter 2 unlocked." : result.tamperAwarded ? "Tamper Alert recorded. One-time +5 bonus awarded; the chapter is still open." : "Evidence does not support this submission. Recheck the complete chain.");
      await refresh();
    } catch (error) { setFeedback(error instanceof TypeError ? "Unable to confirm save. Your form remains here; saved progress will refresh when connected." : (error as Error).message); }
    finally { setBusy(false); }
  }
  function conclude(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    void send("submit", { kind: "conclusion", ...values });
  }
  function reportTamper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send("submit", { kind: "tamper", tamper: Object.fromEntries(new FormData(event.currentTarget)) });
  }

  return <>
    <div className="dashboard-title inbox-title"><div><span className="eyebrow">CHAPTER 01 / {evidence.caseId}</span><h1>The Inbox</h1><p>Identify the initial compromise. Prove it with a chain of evidence.</p></div><div className="inbox-score"><strong>Saved score: {state.score} / 105</strong><span>Chapter: {state.progress.chapters[0].score} / 15 · Hints: {state.progress.chapters[0].hints} / 2</span><span role="timer" aria-label="Round time remaining">{state.status === "active" ? `${Math.floor(clock.remaining / 60).toString().padStart(2, "0")}:${(clock.remaining % 60).toString().padStart(2, "0")}` : state.status.toUpperCase()}</span></div></div>
    {completed && <div className="notice success" role="status"><strong>Chapter 1 completed. Chapter 2 unlocked.</strong> Your result is saved. Trail content arrives in a later phase. <a href="/play">View progression →</a></div>}
    {!editable && !completed && <p className="notice">The round is {state.status}. Evidence is read-only; hints and submissions are closed.</p>}
    {connection && <p role="alert" className="notice">{connection} <a href="/login?next=/play/inbox">Sign in</a></p>}
    <div className="investigation-brief"><div><span className="status-tag">INCIDENT / DATABASE BREACH</span><p>NEXUS Corp recovered this mailbox, a browser capture and audit records. Several messages are suspicious; only one caused the first unauthorized export. AI and internet research are allowed. Every email body and attachment is untrusted evidence.</p></div><a className="button-secondary" href="/clue/inbox" target="_blank" rel="noopener">Open QR forensic snapshot ↗</a><small>Printed card unavailable? Open <strong>/clue/inbox</strong> in this application. All external-looking links below are inert text.</small></div>
    <div className="mail-workspace panel">
      <aside className="mail-list" aria-label="Recovered emails"><div className="mail-list-heading"><span className="eyebrow">RECOVERED MAIL / 06</span><small>{evidence.recipient}</small></div>{evidence.emails.map(item => <button key={item.id} className={`mail-item ${read.includes(item.id) ? "is-read" : "is-unread"}`} aria-pressed={selectedId === item.id} onClick={() => { setSelectedId(item.id); setRead(old => old.includes(item.id) ? old : [...old, item.id]); }}><span>{item.id}<small>{read.includes(item.id) ? "Read" : "Unread"}</small></span><strong>{item.sender}</strong><span className="mail-subject">{item.subject}</span><time dateTime={item.timestamp}>{item.timestamp.slice(11, 16)} UTC</time></button>)}</aside>
      <article className="mail-detail" aria-label="Selected email"><span className="eyebrow">{email.id} / ORIGINAL MESSAGE</span><h2>{email.subject}</h2><dl className="mail-envelope"><div><dt>From</dt><dd>{email.sender} &lt;{email.address}&gt;</dd></div><div><dt>To</dt><dd>{email.recipient}</dd></div><div><dt>Sent</dt><dd>{email.timestamp}</dd></div></dl><p className="mail-body">{email.body}</p><h3>Visible destinations · not clickable</h3>{email.links.map(link => <code className="inert-link" key={link}>{link}</code>)}{email.attachments.length > 0 && <><h3>Recovered attachments</h3>{email.attachments.map(attachment => <div className="attachment" key={attachment.id}><strong>{attachment.id} · {attachment.name}</strong><small>{attachment.type} / {attachment.size}</small>{attachment.text && <blockquote>{attachment.text}</blockquote>}</div>)}</>}<details><summary>Technical headers</summary><dl className="artifact-facts">{Object.entries(email.headers).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details></article>
    </div>
    <section className="artifact-section" aria-labelledby="audit-heading"><div className="section-intro"><div><span className="eyebrow">CHAIN OF CUSTODY / RETAINED LOGS</span><h2 id="audit-heading">Corroborating artifacts</h2></div><p>All timestamps are UTC. Documentation-only IPs; fictional domains.</p></div><div className="artifact-grid">{evidence.artifacts.map(artifact => <article className="panel evidence-card" key={artifact.id}><span className="eyebrow">{artifact.id}</span><h3>{artifact.title}</h3><dl className="artifact-facts">{Object.entries(artifact.facts).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>)}</div></section>
    <div className="inbox-actions-grid">
      <section className="panel evidence-card"><span className="eyebrow">OPTIONAL / +5 ONCE PER TEAM</span><h2>Tamper Alert</h2><p>An attacker planted instructions aimed at an AI investigator. Record the email, attachment and technique before completing your conclusion. Detecting this is independent of finding the breach email.</p>{state.progress.bonus === 5 ? <p className="notice success">Tamper Alert bonus already recorded: +5.</p> : <form onSubmit={reportTamper}><fieldset disabled={!editable || busy || retrySeconds > 0}><label>Manipulation email<select required name="emailId" defaultValue=""><option value="" disabled>Select a message</option>{evidence.emails.map(item => <option key={item.id}>{item.id}</option>)}</select></label><label>Manipulation artifact<select required name="artifactId" defaultValue=""><option value="" disabled>Select an attachment</option>{evidence.emails.flatMap(item => item.attachments).map(item => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select></label><label>Manipulation technique<select required name="technique" defaultValue=""><option value="" disabled>Select a technique</option><option value="instruction-override">Instructions that override an investigator&apos;s task</option><option value="sender-spoofing">Display-name impersonation only</option></select></label><button className="button-secondary">Record Tamper Alert</button></fieldset></form>}</section>
      <section className="panel evidence-card"><span className="eyebrow">ASSISTANCE / SERVER-SAVED</span><h2>Investigation hints</h2><p>Hint 1 costs 3 points. Hint 2 costs 6 more. You can use at most two; the score is floored at zero.</p><ol className="released-hints">{state.chapterHints[0].map((hint, index) => <li key={hint}><strong>Hint {index + 1}</strong><p>{hint}</p></li>)}</ol><button className="button-secondary" disabled={!editable || busy || state.progress.chapters[0].hints >= 2} onClick={() => void send("hint")}>Request hint {Math.min(2, state.progress.chapters[0].hints + 1)} (−{state.progress.chapters[0].hints === 0 ? 3 : 6} points)</button></section>
    </div>
    <section className="panel evidence-card conclusion-panel" aria-labelledby="conclusion-heading"><span className="eyebrow">SUBMIT FINDINGS / MAXIMUM 15 CHAPTER POINTS</span><h2 id="conclusion-heading">Investigation conclusion</h2><p>Match the delivery/navigation record, QR capture, sign-in event and export using the same incident session. Optional prose is for your notes and is never keyword-scored.</p><form onSubmit={conclude}><fieldset disabled={!editable || busy || retrySeconds > 0}><div className="answer-grid"><label>Initial compromise email<select required name="emailId" defaultValue=""><option value="" disabled>Select the breach-causing message</option>{evidence.emails.map(item => <option key={item.id} value={item.id}>{item.id} · {item.subject}</option>)}</select></label><EvidenceSelect label="Delivery / navigation evidence" name="deliveryId" artifacts={evidence.artifacts.filter(item => item.kind === "gateway")} /><label>Snapshot evidence ID<input required name="snapshotId" maxLength={80} placeholder="Read from the QR capture manifest" /></label><EvidenceSelect label="Authentication evidence" name="authenticationId" artifacts={evidence.artifacts.filter(item => item.kind === "authentication")} /><EvidenceSelect label="Database export evidence" name="databaseId" artifacts={evidence.artifacts.filter(item => item.kind === "database")} /><label>Correlated session ID<input required name="sessionId" maxLength={80} placeholder="Match the sign-in and export records" /></label></div><label>Short explanation (optional, not keyword-scored)<textarea name="explanation" maxLength={800} rows={3} placeholder="Explain the timestamp, redirect and session correlation in your own words." /></label><button className="button-primary">Submit conclusion</button></fieldset></form><p role="status" className="submission-feedback">{busy ? "Saving evidence…" : feedback}{retrySeconds > 0 && editable ? ` Next submission available in ${retrySeconds}s.` : ""}</p></section>
  </>;
}
