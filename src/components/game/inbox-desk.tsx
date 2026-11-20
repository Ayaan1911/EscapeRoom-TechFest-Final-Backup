"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import { useChapter, type ChapterState } from "./use-chapter";
import { useDrafts, type ServerDraft } from "./use-drafts";
import { ChainDiagram, ConnectionBanner, DeskFrame, HintBox, ResultStrip, StateBanner, TaskPanel, fieldApi, isEditable, taskOf } from "./workspace";
import { Badge, Tabs } from "@/components/ui/kit";
import type { InboxArtifact, InboxEvidence } from "@/types/inbox";

const KIND_LABEL = { gateway: "Gateway", authentication: "Sign-in", database: "Export" } as const;
const KIND_TASK = { gateway: ["inbox.entry", "deliveryId"], authentication: ["inbox.identity", "authenticationId"], database: ["inbox.impact", "databaseId"] } as const;
const time = (iso: string) => iso.slice(11, 16);

function AuthBadges({ value }: { value: string }) {
  return <>{value.split(";").map(part => part.trim()).filter(Boolean).map(part => { const [k, v = ""] = part.split("="); return <Badge key={part} tone={v === "pass" ? "ok" : v === "fail" ? "alert" : "amber"}>{k.toUpperCase()} {v === "pass" ? "✓" : v === "fail" ? "✕" : "?"} {v || "?"}</Badge>; })}</>;
}

export function InboxDesk({ evidence, initialState, initialDrafts }: { evidence: Omit<InboxEvidence, "snapshot">; initialState: ChapterState; initialDrafts: ServerDraft[] }) {
  const { state, busy, feedback, result, connection, send, submitTask, remaining, retrySeconds } = useChapter(0, initialState);
  const editable = isEditable(state, 0);
  const drafts = useDrafts(0, initialDrafts, editable), f = fieldApi(drafts);
  const [selectedId, setSelectedId] = useState(evidence.emails[0].id);
  const [read, setRead] = useState([evidence.emails[0].id]);
  const [tab, setTab] = useState("message"), [open, setOpen] = useState<string | null>(null);
  const [tamper, setTamper] = useState({ emailId: "", artifactId: "", technique: "" });
  const list = useRef<HTMLElement>(null);
  const email = evidence.emails.find(item => item.id === selectedId)!;
  const marked = f.str("inbox.entry", "emailId");
  const tamperDone = state.progress.bonus === 5;

  function select(id: string) { setSelectedId(id); setTab("message"); setRead(old => old.includes(id) ? old : [...old, id]); }
  function moveSelection(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>(".k-mail-item") ?? [])], i = buttons.findIndex(b => b === document.activeElement);
    const next = buttons[i + (event.key === "ArrowDown" ? 1 : -1)]; if (next) { event.preventDefault(); next.focus(); }
  }
  async function submit(task: string, keys: string[]) {
    await drafts.flush();
    await submitTask(task, Object.fromEntries(keys.map(k => [k, f.str(task, k).trim()])));
  }
  const pick = (kind: InboxArtifact["kind"]) => { const [task, key] = KIND_TASK[kind]; return f.str(task, key); };
  const sessionId = f.str("inbox.identity", "sessionId");

  const select3 = (task: string, key: string, label: string, options: { value: string; text: string }[]) =>
    <label>{label}<select value={f.str(task, key)} disabled={!editable} onChange={e => f.set(task, key, e.target.value)}><option value="">Select…</option>{options.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}</select></label>;
  const art = (kind: InboxArtifact["kind"]) => evidence.artifacts.filter(a => a.kind === kind).map(a => ({ value: a.id, text: `${a.id} · ${a.title}` }));

  return <DeskFrame chapter={0} title="The Inbox" caseId={evidence.caseId} state={state} remaining={remaining} drafts={drafts} objective="Which email started it? Prove it: delivery → capture → sign-in → export, all on one session." banner={<><StateBanner state={state} chapter={0} /><ConnectionBanner text={connection} next="/play/inbox" /></>}>
    <ChainDiagram label="Evidence chain so far" nodes={[
      { id: "mail", label: "Email", value: marked }, { id: "nav", label: "Navigation", value: pick("gateway") }, { id: "cap", label: "Capture", value: f.str("inbox.entry", "snapshotId") },
      { id: "auth", label: "Sign-in", value: pick("authentication") }, { id: "ses", label: "Session", value: sessionId }, { id: "db", label: "Export", value: pick("database") }]} />

    <div className="k-inbox-grid pg-bench">
      <aside className="k-mail-list" aria-label="Recovered emails" ref={list} onKeyDown={moveSelection}>
        <div className="k-pane-head"><span className="k-eyebrow">MAILBOX · {evidence.emails.length}</span><small>{evidence.recipient}</small></div>
        {evidence.emails.map(item => <button key={item.id} type="button" className={`k-mail-item ${read.includes(item.id) ? "is-read" : "is-unread"}`} aria-pressed={selectedId === item.id} onClick={() => select(item.id)}>
          <span className="k-mail-top"><span className="k-mono">{item.id}</span><time dateTime={item.timestamp}>{time(item.timestamp)} UTC</time></span>
          <strong>{item.sender}</strong><span className="k-mail-subject">{item.subject}</span>
          <span className="k-mail-flags">{marked === item.id && <Badge tone="amber">★ Breach email</Badge>}{item.attachments.length > 0 && <Badge>📎 {item.attachments.length}</Badge>}{!read.includes(item.id) && <Badge tone="info">Unread</Badge>}</span>
        </button>)}
      </aside>

      <article className="k-viewer" aria-label="Selected email" key={email.id}>
        <header><span className="k-eyebrow k-mono">{email.id}</span><h2>{email.subject}</h2>
          <dl className="k-envelope"><div><dt>From</dt><dd>{email.sender} <span className="k-mono">&lt;{email.address}&gt;</span></dd></div><div><dt>Sent</dt><dd className="k-mono">{email.timestamp}</dd></div><div><dt>Auth</dt><dd className="k-badges"><AuthBadges value={email.headers["Authentication-Results"] ?? ""} /></dd></div></dl>
        </header>
        <Tabs label="Message sections" value={tab} onChange={setTab} tabs={[{ id: "message", label: "Message" }, { id: "attachments", label: "Attachments", count: email.attachments.length }, { id: "headers", label: "Headers" }]}>
          {tab === "message" && <><p className="k-body">{email.body}</p>{email.links.length > 0 && <>{email.links.map(link => <code className="k-inert" key={link}>{link}</code>)}<small className="k-muted">Links are inert text.</small></>}</>}
          {tab === "attachments" && (email.attachments.length ? email.attachments.map(a => <div className="k-attachment" key={a.id}><div><strong className="k-mono">{a.id}</strong> · {a.name}<small>{a.type} / {a.size}</small></div>{a.text && <blockquote>{a.text}</blockquote>}</div>) : <p className="k-empty">No attachments.</p>)}
          {tab === "headers" && <dl className="k-facts">{Object.entries(email.headers).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="k-mono">{v}</dd></div>)}</dl>}
        </Tabs>
        <footer className="k-viewer-actions"><button type="button" className="k-btn" aria-pressed={marked === email.id} disabled={!editable} onClick={() => f.set("inbox.entry", "emailId", marked === email.id ? "" : email.id)}>{marked === email.id ? "★ Marked as breach email" : "☆ Mark as breach email"}</button></footer>
      </article>

      <aside className="k-rail pg-rail" aria-label="Case file">
        <div className="pg-qr"><strong>QR forensic snapshot</strong><span>Printed card → capture ID.</span><a className="k-btn k-btn-primary k-btn-sm" href="/clue/inbox" target="_blank" rel="noopener">Open QR forensic snapshot ↗</a></div>
        <h2 className="pg-rail-h">Records <span className="pg-chip">{evidence.artifacts.length}</span></h2>
        <div className="k-artifacts">{evidence.artifacts.map(a => { const [task, key] = KIND_TASK[a.kind], pinned = f.str(task, key) === a.id, expanded = open === a.id;
          return <article key={a.id} className={`k-artifact ${pinned ? "is-pinned" : ""}`}>
            <header><button type="button" className="k-artifact-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : a.id)}><span className="k-mono">{a.id}</span><strong>{a.title}</strong><Badge tone="info">{KIND_LABEL[a.kind]}</Badge></button>
              <button type="button" className="k-pin" aria-pressed={pinned} aria-label={`${pinned ? "Unpin" : "Use"} ${a.id} as ${KIND_LABEL[a.kind]} evidence`} disabled={!editable} onClick={() => f.set(task, key, pinned ? "" : a.id)}>{pinned ? "★" : "☆"}</button></header>
            {expanded && <dl className="k-facts">{Object.entries(a.facts).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="k-mono">{v}</dd></div>)}</dl>}
          </article>; })}</div>
      </aside>
    </div>

    <section className="pg-tasks" aria-label="Scored tasks">
      <h2 className="pg-h">Tasks <small>Submit each one when ready. Points are saved per task.</small></h2>
      <TaskPanel step={1} task={taskOf(state, 0, "inbox.entry")} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={!!(marked && f.str("inbox.entry", "deliveryId") && f.str("inbox.entry", "snapshotId").trim())} why="Mark the breach email, pick the delivery record, enter the capture ID." onSubmit={() => void submit("inbox.entry", ["emailId", "deliveryId", "snapshotId"])}>
        <div className="pg-fields"><label>Breach email<input readOnly value={marked ? `${marked}` : ""} placeholder="Mark one in the mailbox" /></label>
          {select3("inbox.entry", "deliveryId", "Delivery / navigation record", art("gateway"))}
          <label>Capture ID<input value={f.str("inbox.entry", "snapshotId")} maxLength={80} disabled={!editable} autoComplete="off" placeholder="From the QR snapshot" onChange={e => f.set("inbox.entry", "snapshotId", e.target.value)} /></label></div>
      </TaskPanel>
      <TaskPanel step={2} task={taskOf(state, 0, "inbox.identity")} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={!!(f.str("inbox.identity", "authenticationId") && sessionId.trim())} why="Pick the sign-in record and enter its session ID." onSubmit={() => void submit("inbox.identity", ["authenticationId", "sessionId"])}>
        <div className="pg-fields">{select3("inbox.identity", "authenticationId", "Sign-in record", art("authentication"))}
          <label>Session ID<input value={sessionId} maxLength={80} disabled={!editable} autoComplete="off" placeholder="Same session as the export" onChange={e => f.set("inbox.identity", "sessionId", e.target.value)} /></label></div>
      </TaskPanel>
      <TaskPanel step={3} task={taskOf(state, 0, "inbox.impact")} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={!!f.str("inbox.impact", "databaseId")} why="Pick the unauthorized export." onSubmit={() => void submit("inbox.impact", ["databaseId"])}>
        <div className="pg-fields">{select3("inbox.impact", "databaseId", "Database export record", art("database"))}</div>
      </TaskPanel>
      <ResultStrip result={result} />
      <p role="status" className="pg-live">{feedback}</p>
    </section>

    <div className="pg-aux">
      <details className="pg-hints pg-tamper"><summary>Tamper Alert <span className="pg-chip">{tamperDone ? "+5 recorded" : "optional +5"}</span></summary>
        {tamperDone ? <p className="k-banner k-banner-ok">Tamper Alert bonus already recorded: +5.</p> : <form onSubmit={e => { e.preventDefault(); void send("submit", { kind: "tamper", tamper }); }}><fieldset disabled={!editable || busy || retrySeconds > 0}>
          <p>Find the planted instructions aimed at an AI investigator.</p>
          <div className="pg-fields"><label>Manipulation email<select required value={tamper.emailId} onChange={e => setTamper({ ...tamper, emailId: e.target.value })}><option value="" disabled>Select…</option>{evidence.emails.map(item => <option key={item.id}>{item.id}</option>)}</select></label>
            <label>Manipulation artifact<select required value={tamper.artifactId} onChange={e => setTamper({ ...tamper, artifactId: e.target.value })}><option value="" disabled>Select…</option>{evidence.emails.flatMap(item => item.attachments).map(item => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select></label>
            <label>Manipulation technique<select required value={tamper.technique} onChange={e => setTamper({ ...tamper, technique: e.target.value })}><option value="" disabled>Select…</option><option value="instruction-override">Overrides an investigator’s task</option><option value="sender-spoofing">Display-name impersonation only</option></select></label></div>
          <button className="k-btn k-btn-sm">Record Tamper Alert</button></fieldset></form>}
      </details>
      <HintBox chapter={0} state={state} editable={editable} busy={busy} onHint={() => void send("hint")} />
      <details className="pg-hints"><summary>Notes <span className="pg-chip">private to your team</span></summary>
        <label>Scratchpad<textarea rows={4} maxLength={900} disabled={!editable} value={f.str("notes", "text")} onChange={e => f.set("notes", "text", e.target.value)} placeholder="Saved with your drafts. Not scored." /></label></details>
    </div>
  </DeskFrame>;
}
