"use client";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useChapter, type ChapterState } from "./use-chapter";
import { Badge, Card, Feedback, MissionBar, Tabs } from "@/components/ui/kit";
import type { InboxArtifact, InboxEmail, InboxEvidence } from "@/types/inbox";

type Form = { emailId: string; deliveryId: string; snapshotId: string; authenticationId: string; databaseId: string; sessionId: string; explanation: string };
const EMPTY: Form = { emailId: "", deliveryId: "", snapshotId: "", authenticationId: "", databaseId: "", sessionId: "", explanation: "" };
const SLOTS: { key: Exclude<keyof Form, "explanation">; label: string }[] = [
  { key: "emailId", label: "Breach email" }, { key: "deliveryId", label: "Delivery / navigation" }, { key: "snapshotId", label: "Snapshot ID" },
  { key: "authenticationId", label: "Authentication" }, { key: "databaseId", label: "Database export" }, { key: "sessionId", label: "Session ID" },
];
const KIND_FIELD = { gateway: "deliveryId", authentication: "authenticationId", database: "databaseId" } as const;
const KIND_LABEL = { gateway: "Gateway", authentication: "Sign-in", database: "Export" } as const;

function AuthBadges({ value }: { value: string }) {
  return <>{value.split(";").map(part => part.trim()).filter(Boolean).map(part => { const [k, v = ""] = part.split("="); return <Badge key={part} tone={v === "pass" ? "ok" : v === "fail" ? "alert" : "amber"}>{k.toUpperCase()} {v || "?"}</Badge>; })}</>;
}
const time = (iso: string) => iso.slice(11, 16);

export function InboxDesk({ evidence, initialState }: { evidence: Omit<InboxEvidence, "snapshot">; initialState: ChapterState }) {
  const { state, busy, feedback, connection, send, remaining, retrySeconds } = useChapter(0, initialState);
  const [selectedId, setSelectedId] = useState(evidence.emails[0].id);
  const [read, setRead] = useState([evidence.emails[0].id]);
  const [tab, setTab] = useState("message"), [rail, setRail] = useState("artifacts"), [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY), [notes, setNotes] = useState(""), [tamper, setTamper] = useState({ emailId: "", artifactId: "", technique: "" });
  const loaded = useRef(false), list = useRef<HTMLElement>(null);
  const storeKey = `ghost404:inbox:${evidence.caseId}`;
  const email = evidence.emails.find(item => item.id === selectedId)!;
  const completed = state.progress.chapters[0].completedAt !== null;
  const editable = state.status === "active" && state.current === 0 && !completed;
  const tamperDone = state.progress.bonus === 5;
  const ready = SLOTS.filter(slot => form[slot.key].trim()).length;

  // Notebook draft survives reloads in this browser only (selected evidence IDs and notes; never answers from the server).
  useEffect(() => { queueMicrotask(() => { try { const saved = JSON.parse(localStorage.getItem(storeKey) ?? "null"); if (saved) { setForm({ ...EMPTY, ...saved.form }); setNotes(saved.notes ?? ""); } } catch { /* storage unavailable */ } loaded.current = true; }); }, [storeKey]);
  useEffect(() => { if (!loaded.current) return; try { if (completed) localStorage.removeItem(storeKey); else localStorage.setItem(storeKey, JSON.stringify({ form, notes })); } catch { /* ignore */ } }, [form, notes, completed, storeKey]);

  const set = (key: keyof Form, value: string) => setForm(old => ({ ...old, [key]: value }));
  function select(id: string) { setSelectedId(id); setTab("message"); setRead(old => old.includes(id) ? old : [...old, id]); }
  function moveSelection(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>(".k-mail-item") ?? [])], i = buttons.findIndex(b => b === document.activeElement);
    const next = buttons[i + (event.key === "ArrowDown" ? 1 : -1)]; if (next) { event.preventDefault(); next.focus(); }
  }
  function conclude(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send("submit", { kind: "conclusion", ...form, explanation: form.explanation || undefined }); }
  function reportTamper(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send("submit", { kind: "tamper", tamper }); }
  const locked = !editable || busy || retrySeconds > 0;
  const attachments = email.attachments;

  return <div className="k-desk">
    <MissionBar chapter={0} title="The Inbox" caseId={evidence.caseId} state={state} remaining={remaining} objective="Find the one email that caused the first unauthorized export, and prove it with delivery, sign-in, export and session evidence." />
    {completed && <div className="k-banner k-banner-ok" role="status"><div><strong>Chapter 1 completed. Chapter 2 unlocked.</strong><span>Your result is saved. The findings form below is now locked.</span></div><a className="k-btn k-btn-primary" href="/play/trail">Open Chapter 2 →</a></div>}
    {!editable && !completed && <p className="k-banner k-banner-warn">The round is {state.status}. Evidence is read-only; hints and submissions are closed.</p>}
    {connection && <p role="alert" className="k-banner k-banner-warn">{connection} <a href="/login?next=/play/inbox">Sign in</a></p>}

    <div className="k-inbox-grid">
      <aside className="k-mail-list" aria-label="Recovered emails" ref={list} onKeyDown={moveSelection}>
        <div className="k-pane-head"><span className="k-eyebrow">RECOVERED MAIL / {evidence.emails.length}</span><small>{evidence.recipient}</small></div>
        {evidence.emails.map(item => <button key={item.id} type="button" className={`k-mail-item ${read.includes(item.id) ? "is-read" : "is-unread"}`} aria-pressed={selectedId === item.id} onClick={() => select(item.id)}>
          <span className="k-mail-top"><span className="k-mono">{item.id}</span><time dateTime={item.timestamp}>{time(item.timestamp)} UTC</time></span>
          <strong>{item.sender}</strong><span className="k-mail-subject">{item.subject}</span>
          <span className="k-mail-flags">{form.emailId === item.id && <Badge tone="amber">Marked as breach</Badge>}{item.attachments.length > 0 && <Badge>📎 {item.attachments.length}</Badge>}{!read.includes(item.id) && <Badge tone="info">Unread</Badge>}</span>
        </button>)}
      </aside>

      <article className="k-viewer" aria-label="Selected email" key={email.id}>
        <header><span className="k-eyebrow k-mono">{email.id} / ORIGINAL MESSAGE</span><h2>{email.subject}</h2>
          <dl className="k-envelope"><div><dt>From</dt><dd>{email.sender} <span className="k-mono">&lt;{email.address}&gt;</span></dd></div><div><dt>To</dt><dd>{email.recipient}</dd></div><div><dt>Sent</dt><dd className="k-mono">{email.timestamp}</dd></div><div><dt>Auth</dt><dd className="k-badges"><AuthBadges value={email.headers["Authentication-Results"] ?? ""} /></dd></div></dl>
        </header>
        <Tabs label="Message sections" value={tab} onChange={setTab} tabs={[{ id: "message", label: "Message" }, { id: "attachments", label: "Attachments", count: attachments.length }, { id: "headers", label: "Headers" }]}>
          {tab === "message" && <MessageTab email={email} />}
          {tab === "attachments" && (attachments.length ? attachments.map(a => <div className="k-attachment" key={a.id}><div><strong className="k-mono">{a.id}</strong> · {a.name}<small>{a.type} / {a.size}</small></div>{a.text && <blockquote>{a.text}</blockquote>}</div>) : <p className="k-empty">This message has no recovered attachments.</p>)}
          {tab === "headers" && <dl className="k-facts">{Object.entries(email.headers).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="k-mono">{v}</dd></div>)}</dl>}
        </Tabs>
        <footer className="k-viewer-actions"><button type="button" className="k-btn" aria-pressed={form.emailId === email.id} onClick={() => set("emailId", form.emailId === email.id ? "" : email.id)} disabled={completed}>{form.emailId === email.id ? "✓ Marked as breach email" : "Mark as breach email"}</button><span>Marking adds it to your notebook. You still confirm it when you submit.</span></footer>
      </article>

      <aside className="k-rail" aria-label="Case file">
        <Card title="QR forensic snapshot" eyebrow="PHYSICAL EVIDENCE" className="k-qr">
          <p>Scan the printed Chapter 1 card, or open the same capture here. Read its capture ID for your findings.</p>
          <a className="k-btn k-btn-primary" href="/clue/inbox" target="_blank" rel="noopener">Open QR forensic snapshot ↗</a>
          <small>Printed card unavailable? Use <strong>/clue/inbox</strong>. External-looking links are inert text.</small>
        </Card>
        <Tabs label="Case file" value={rail} onChange={setRail} tabs={[{ id: "artifacts", label: "Artifacts", count: evidence.artifacts.length }, { id: "notebook", label: "Notebook", count: ready }]}>
          {rail === "artifacts" && <div className="k-artifacts">{evidence.artifacts.map(a => <ArtifactCard key={a.id} a={a} expanded={open === a.id} toggle={() => setOpen(open === a.id ? null : a.id)} pinned={form[KIND_FIELD[a.kind]] === a.id} pin={() => set(KIND_FIELD[a.kind], form[KIND_FIELD[a.kind]] === a.id ? "" : a.id)} disabled={completed} />)}<small>All timestamps UTC. Documentation-only IPs; fictional domains.</small></div>}
          {rail === "notebook" && <div className="k-notebook"><h3>Selected evidence <span>{ready}/{SLOTS.length}</span></h3><ul>{SLOTS.map(slot => <li key={slot.key} className={form[slot.key] ? "is-filled" : ""}><span>{slot.label}</span><b className="k-mono">{form[slot.key] || "—"}</b>{form[slot.key] && !completed && <button type="button" aria-label={`Clear ${slot.label}`} onClick={() => set(slot.key, "")}>×</button>}</li>)}</ul>
            <label>Scratch notes<textarea value={notes} onChange={e => setNotes(e.target.value.slice(0, 1200))} rows={4} placeholder="Private to this browser. Not submitted." disabled={completed} /></label></div>}
        </Tabs>
      </aside>
    </div>

    <div className="k-two">
      <Card id="tamper" eyebrow="OPTIONAL / +5 ONCE PER TEAM" title="Tamper Alert" aside={tamperDone ? <Badge tone="ok">+5 recorded</Badge> : <Badge>Not recorded</Badge>}>
        <p>An attacker planted instructions aimed at an AI investigator. Report where it is and how it works. This is independent of finding the breach email and leaves the chapter open.</p>
        {tamperDone ? <p className="k-banner k-banner-ok">Tamper Alert bonus already recorded: +5.</p> : <form onSubmit={reportTamper}><fieldset disabled={locked}>
          <ol className="k-steps"><li><label>Manipulation email<select required value={tamper.emailId} onChange={e => setTamper({ ...tamper, emailId: e.target.value })}><option value="" disabled>Select a message</option>{evidence.emails.map(item => <option key={item.id}>{item.id}</option>)}</select></label></li>
            <li><label>Manipulation artifact<select required value={tamper.artifactId} onChange={e => setTamper({ ...tamper, artifactId: e.target.value })}><option value="" disabled>Select an attachment</option>{evidence.emails.flatMap(item => item.attachments).map(item => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select></label></li>
            <li><label>Manipulation technique<select required value={tamper.technique} onChange={e => setTamper({ ...tamper, technique: e.target.value })}><option value="" disabled>Select a technique</option><option value="instruction-override">Instructions that override an investigator&apos;s task</option><option value="sender-spoofing">Display-name impersonation only</option></select></label></li></ol>
          <button className="k-btn">Record Tamper Alert</button></fieldset></form>}
      </Card>
      <Card id="hints" eyebrow="ASSISTANCE / SERVER-SAVED" title="Investigation hints" aside={<Badge tone="amber">{state.progress.chapters[0].hints} / 2 used</Badge>}>
        <p>Hint 1 costs 3 points. Hint 2 costs 6 more. At most two; the score is floored at zero.</p>
        <ol className="released-hints k-hints">{state.chapterHints[0].map((hint, index) => <li key={hint}><strong>Hint {index + 1}</strong><p>{hint}</p></li>)}</ol>
        <button className="k-btn" disabled={!editable || busy || state.progress.chapters[0].hints >= 2} onClick={() => void send("hint")}>Request hint {Math.min(2, state.progress.chapters[0].hints + 1)} (−{state.progress.chapters[0].hints === 0 ? 3 : 6} points)</button>
      </Card>
    </div>

    <Card id="conclusion" className="k-conclusion" eyebrow="SUBMIT FINDINGS / MAXIMUM 15 CHAPTER POINTS" title="Investigation conclusion" aside={<Badge tone={ready === SLOTS.length ? "ok" : "neutral"}>{ready}/{SLOTS.length} evidence slots filled</Badge>}>
      {completed && <p className="k-lock">🔒 Findings accepted and locked.</p>}
      <p>Match the delivery/navigation record, QR capture, sign-in event and export using the same incident session. The explanation is for your notes and is never keyword-scored.</p>
      <form onSubmit={conclude}><fieldset disabled={locked}>
        <div className="k-answer-grid">
          <label>Initial compromise email<select required value={form.emailId} onChange={e => set("emailId", e.target.value)}><option value="" disabled>Select the breach-causing message</option>{evidence.emails.map(item => <option key={item.id} value={item.id}>{item.id} · {item.subject}</option>)}</select></label>
          <EvidenceSelect label="Delivery / navigation evidence" value={form.deliveryId} onChange={v => set("deliveryId", v)} artifacts={evidence.artifacts.filter(i => i.kind === "gateway")} />
          <label>Snapshot evidence ID<input required value={form.snapshotId} onChange={e => set("snapshotId", e.target.value)} maxLength={80} placeholder="Read from the QR capture manifest" autoComplete="off" /></label>
          <EvidenceSelect label="Authentication evidence" value={form.authenticationId} onChange={v => set("authenticationId", v)} artifacts={evidence.artifacts.filter(i => i.kind === "authentication")} />
          <EvidenceSelect label="Database export evidence" value={form.databaseId} onChange={v => set("databaseId", v)} artifacts={evidence.artifacts.filter(i => i.kind === "database")} />
          <label>Correlated session ID<input required value={form.sessionId} onChange={e => set("sessionId", e.target.value)} maxLength={80} placeholder="Match the sign-in and export records" autoComplete="off" /></label>
        </div>
        <label>Short explanation (optional, not keyword-scored)<textarea value={form.explanation} onChange={e => set("explanation", e.target.value)} maxLength={800} rows={3} placeholder="Explain the timestamp, redirect and session correlation in your own words." /></label>
        <div className="k-submit-row"><button className="k-btn k-btn-primary k-btn-lg" disabled={ready < SLOTS.length}>Submit conclusion</button>{ready < SLOTS.length && !completed && <small>Fill all six evidence slots to submit.</small>}</div>
      </fieldset></form>
      <Feedback busy={busy} text={feedback} extra={retrySeconds > 0 && editable ? `Next submission available in ${retrySeconds}s.` : ""} />
    </Card>
  </div>;
}

function MessageTab({ email }: { email: InboxEmail }) {
  return <><p className="k-body">{email.body}</p>{email.links.length > 0 && <><h3 className="k-sub">Visible destinations · not clickable</h3>{email.links.map(link => <code className="k-inert" key={link}>{link}</code>)}</>}</>;
}
function EvidenceSelect({ label, value, onChange, artifacts }: { label: string; value: string; onChange: (value: string) => void; artifacts: InboxArtifact[] }) {
  return <label>{label}<select required value={value} onChange={e => onChange(e.target.value)}><option value="" disabled>Select an evidence record</option>{artifacts.map(a => <option key={a.id} value={a.id}>{a.id} · {a.title}</option>)}</select></label>;
}
function ArtifactCard({ a, expanded, toggle, pinned, pin, disabled }: { a: InboxArtifact; expanded: boolean; toggle: () => void; pinned: boolean; pin: () => void; disabled: boolean }) {
  return <article className={`k-artifact ${pinned ? "is-pinned" : ""}`}>
    <header><button type="button" className="k-artifact-toggle" aria-expanded={expanded} onClick={toggle}><span className="k-mono">{a.id}</span><strong>{a.title}</strong><Badge tone="info">{KIND_LABEL[a.kind]}</Badge></button>
      <button type="button" className="k-pin" aria-pressed={pinned} aria-label={`${pinned ? "Unpin" : "Pin"} ${a.id} ${pinned ? "from" : "to"} notebook`} onClick={pin} disabled={disabled}>{pinned ? "★" : "☆"}</button></header>
    {expanded && <dl className="k-facts">{Object.entries(a.facts).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="k-mono">{v}</dd></div>)}</dl>}
  </article>;
}
