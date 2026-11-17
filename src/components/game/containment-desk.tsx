"use client";
import { useState, type FormEvent } from "react";
import { useChapter, type ChapterState } from "./use-chapter";
import { ContainmentCctv } from "./containment-cctv";
import { Badge, Card, Feedback, MissionBar } from "@/components/ui/kit";
import type { ContainmentCctv as Snapshot, ContainmentEvidence } from "@/types/containment";

type Option = { id: string; title: string; detail: string };

export function ContainmentDesk({ evidence, initialCctv, initialState }: { evidence: ContainmentEvidence; initialCctv: Snapshot | null; initialState: ChapterState }) {
  const { state, busy, feedback, connection, send, remaining, retrySeconds } = useChapter(3, initialState);
  const [eventOrder, setEventOrder] = useState(evidence.events.map(event => event.id));
  const [immediate, setImmediate] = useState<string[]>([]);
  const [recovery, setRecovery] = useState<string[]>([]);
  const [support, setSupport] = useState<string[]>([]);
  const [movement, setMovement] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [cctv, setCctv] = useState(initialCctv);
  const [copyStatus, setCopyStatus] = useState("");
  const completed = state.progress.chapters[3].completedAt !== null;
  const editable = state.status === "active" && state.current === 3 && !completed;
  const disabled = !editable || busy;
  const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
  const checks = [
    { label: "Timeline arranged", detail: `${eventOrder.length} of ${eventOrder.length} cards placed`, done: true },
    { label: "Evidence pinned", detail: `${support.length} of 5 minimum`, done: support.length >= 5 },
    { label: "Immediate batch", detail: `${immediate.length} selected`, done: immediate.length > 0 },
    { label: "Recovery sequence", detail: `${recovery.length} ordered`, done: recovery.length > 0 },
  ];
  const ready = checks.every(item => item.done);

  function move(ids: string[], setOrder: (order: string[]) => void, id: string, delta: number) {
    const index = ids.indexOf(id), target = index + delta;
    if (disabled || index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids]; [next[index], next[target]] = [next[target], next[index]];
    setOrder(next); setMovement(`${id} moved to position ${target + 1} of ${ids.length}.`);
  }
  function dropOn(ids: string[], setOrder: (order: string[]) => void, targetId: string) {
    if (!dragging || disabled || dragging === targetId) return setDragging(null);
    const next = ids.filter(id => id !== dragging); next.splice(ids.indexOf(targetId), 0, dragging);
    setOrder(next); setMovement(`${dragging} moved to position ${next.indexOf(dragging) + 1} of ${ids.length}.`); setDragging(null);
  }
  async function checkCopy() {
    setCopyStatus("Checking organizer authorization…");
    try { const response = await fetch("/api/game/containment", { cache: "no-store" }); if (!response.ok) throw new Error(); const data = await response.json(); setCctv(data.fallbackCctv); setCopyStatus(data.fallbackCctv ? "Authorized accessible copy loaded. No hint charge or progression change." : "No accessible-copy grant is recorded. Ask the organizer to verify your team and authorize a copy."); }
    catch { setCopyStatus("Unable to check the copy. Reconnect or sign in and retry; no game progress was changed."); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void send("submit", { kind: "plan", eventOrder, account: data.get("account"), sessionId: data.get("sessionId"), immediateActions: immediate, recoveryOrder: recovery, supportingEvidenceIds: support, explanation: data.get("explanation") });
  }
  function controls(ids: string[], setOrder: (order: string[]) => void, id: string, label: string) {
    const index = ids.indexOf(id);
    return <div className="k-order-controls"><button type="button" className="k-btn k-btn-sm" disabled={disabled || index === 0} aria-label={`Move ${label} ${id} up`} onClick={() => move(ids, setOrder, id, -1)}>↑ Move up</button><button type="button" className="k-btn k-btn-sm" disabled={disabled || index === ids.length - 1} aria-label={`Move ${label} ${id} down`} onClick={() => move(ids, setOrder, id, 1)}>↓ Move down</button></div>;
  }
  const choice = (item: Option, picked: boolean, change: () => void, aria: string) => <label key={item.id} className={`k-choice ${picked ? "is-picked" : ""}`}><input type="checkbox" checked={picked} onChange={change} aria-label={aria} /><span><strong>{item.id} · {item.title}</strong><small>{item.detail}</small></span></label>;

  return <div className="k-desk">
    <MissionBar chapter={3} title="Containment" caseId={evidence.caseId} state={state} remaining={remaining} objective="Stop the breach, keep the evidence, restore safely. Suggested budget: 12 minutes." />
    <p className="k-banner k-banner-warn">FICTIONAL SIMULATION ONLY. Every action is an inert decision submitted for scoring. No account, network, notification, log or server is operated. Student timing is unverified.</p>
    {completed && <div className="k-banner k-banner-ok" role="status"><div><strong>Chapter 4 completed. Final Verdict unlocked.</strong><span>Your plan and score are saved. Continue to the final incident review.</span></div><a className="k-btn k-btn-primary" href="/play/verdict">Open Chapter 5</a></div>}
    {!editable && !completed && <p className="k-banner k-banner-warn" role="status">The round is {state.status}. This permitted historical evidence is read-only; new plans and hints are unavailable.</p>}
    {connection && <p className="k-banner k-banner-warn" role="alert">{connection} <a href="/login?next=/play/containment">Sign in</a></p>}
    <div className="k-actions"><a href="/play/inbox" className="k-btn">Review Inbox</a><a href="/play/trail" className="k-btn">Review Trail</a><a href="/play/insider" className="k-btn">Review Insider</a></div>

    <Card id="checkpoint" className="containment-brief" eyebrow="INCIDENT COMMAND" title="Response checkpoint" aside={<Badge tone="alert">Data already exfiltrated</Badge>}>
      <div className="k-badges"><Badge tone="info">{evidence.checkpoint} UTC</Badge><Badge>{evidence.account}</Badge><Badge className="k-mono">{evidence.sessionId}</Badge></div>
      <p>Treat this session as still usable until targeted containment is verified. A password reset alone is not proof that a stolen session was revoked.</p>
      <p>Keep customer support and approved archive/maintenance workloads available. Read the incident-lead constraints in the evidence drawer before choosing. The four urgent decisions form a parallel batch; later recovery steps require a defensible sequence.</p>
    </Card>

    {cctv && <ContainmentCctv snapshot={cctv} />}

    <div className="k-contain-grid">
      <form onSubmit={submit} id="containment-plan" className="k-plan">
        <input type="hidden" name="eventOrder" value={JSON.stringify(eventOrder)} /><input type="hidden" name="immediateActions" value={JSON.stringify(immediate)} /><input type="hidden" name="recoveryOrder" value={JSON.stringify(recovery)} /><input type="hidden" name="supportingEvidenceIds" value={JSON.stringify(support)} />

        <Card id="timeline" className="containment-timeline" eyebrow="STEP 1" title="Seven-event reconstruction" aside={<Badge tone="ok">✓ placed</Badge>}>
          <p>Arrange all seven cards from earliest to latest using the cited sources and causal links. Card IDs and starting positions are not ranks. Drag cards, or use the move buttons (Tab, Enter, Space). Two supporting observations belong outside this chain.</p>
          <ol className="k-timeline containment-order" aria-label="Seven-event timeline">{eventOrder.map((id, index) => { const event = evidence.events.find(item => item.id === id)!; return <li key={id} data-event-id={id} draggable={!disabled} className={dragging === id ? "is-dragging" : ""} onDragStart={e => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; setDragging(id); }} onDragEnd={() => setDragging(null)} onDragOver={e => e.preventDefault()} onDrop={() => dropOn(eventOrder, setEventOrder, id)}>
            <span className="k-tl-pos" aria-hidden="true">{index + 1}</span>
            <div className="k-tl-card"><header><span className="k-mono k-muted">{event.id}</span><time dateTime={event.timestamp} className="k-mono">{event.timestamp} UTC</time></header><h3>{event.title}</h3><p>{event.description}</p>
              <p className="k-meta">Principal: {event.principal}<br />Session: {event.sessionId}<br />Sources: {event.sourceIds.join(", ")}<br />Confidence: {event.confidence}</p>{controls(eventOrder, setEventOrder, id, "event")}</div></li>; })}</ol>
          <p role="status" aria-live="polite" className="k-feedback">{movement}</p>
        </Card>

        <Card id="support" className="containment-support" eyebrow="STEP 2" title="Supporting evidence drawer" aside={<Badge tone={support.length >= 5 ? "ok" : "neutral"}>{support.length} pinned · need 5</Badge>}>
          <p>Compare the seven cards with these retained records. Pin at least five relevant IDs, including the physical or authorized CCTV reference. Approved workload observations are separate from the incident chain.</p>
          <div className="k-drawer">{evidence.observations.map(item => <details key={item.id}><summary>{item.id} · {item.title} · Supporting observation</summary><p>{item.timestamp} UTC · {item.principal} · {item.sessionId}</p><p>{item.description}</p><p>Sources: {item.sourceIds.join(", ")} · {item.confidence}</p></details>)}
            {evidence.artifacts.map(item => <details key={item.id}><summary>{item.id} · {item.title}</summary><dl className="k-facts">{Object.entries(item.facts).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="k-mono">{value}</dd></div>)}</dl></details>)}</div>
          <fieldset disabled={disabled}><legend>Supporting evidence notebook</legend><div className="k-choices">{[...evidence.artifacts.map(item => ({ id: item.id, title: item.title })), { id: evidence.cctvReference.id, title: "Physical / authorized security-room snapshot" }].map(item => <label key={item.id} className={`k-choice k-choice-sm ${support.includes(item.id) ? "is-picked" : ""}`}><input type="checkbox" checked={support.includes(item.id)} onChange={() => setSupport(toggle(support, item.id))} aria-label={`Pin evidence ${item.id}`} /><span><strong className="k-mono">{item.id}</strong><small>{item.title}</small></span></label>)}</div></fieldset>
        </Card>

        <Card id="immediate" eyebrow="STEP 3" title="Immediate containment batch" aside={<Badge tone={immediate.length ? "ok" : "neutral"}>{immediate.length} selected</Badge>}>
          <p>Select the scoped urgent decisions. Evidence preservation can begin in parallel with revocation, export restriction and internal escalation. Complete this batch before entering the recovery sequence.</p>
          <fieldset disabled={disabled}><legend>Simulated immediate actions</legend><div className="k-choices">{evidence.immediateOptions.map(item => choice(item, immediate.includes(item.id), () => setImmediate(toggle(immediate, item.id)), `Select immediate ${item.id}`))}</div></fieldset>
        </Card>

        <Card id="recovery" eyebrow="STEP 4" title="Recovery plan" aside={<Badge tone={recovery.length ? "ok" : "neutral"}>{recovery.length} ordered</Badge>}>
          <p>Select supported recovery steps, then order them. Equivalent safe sequences are accepted; independent work need not have one arbitrary order. All selections remain simulated.</p>
          <fieldset disabled={disabled}><legend>Available recovery decisions</legend><div className="k-choices">{evidence.recoveryOptions.map(item => choice(item, recovery.includes(item.id), () => setRecovery(toggle(recovery, item.id)), `Select recovery ${item.id}`))}</div></fieldset>
          <ol className="k-timeline k-timeline-recovery containment-order recovery-order" aria-label="Ordered recovery plan">{recovery.map((id, index) => { const item = evidence.recoveryOptions.find(option => option.id === id)!; return <li key={id} data-recovery-id={id} draggable={!disabled} className={dragging === id ? "is-dragging" : ""} onDragStart={e => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; setDragging(id); }} onDragEnd={() => setDragging(null)} onDragOver={e => e.preventDefault()} onDrop={() => dropOn(recovery, setRecovery, id)}>
            <span className="k-tl-pos" aria-hidden="true">{index + 1}</span><div className="k-tl-card"><h3>{item.id} · {item.title}</h3><p>{item.detail}</p>{controls(recovery, setRecovery, id, "recovery")}</div></li>; })}</ol>
          {recovery.length === 0 && <p className="k-empty">No recovery steps chosen yet.</p>}
        </Card>

        <Card id="submit" className="k-conclusion" eyebrow="STEP 5" title="Submit the simulated response plan" aside={<Badge tone={ready ? "ok" : "neutral"}>{checks.filter(c => c.done).length}/4 ready</Badge>}>
          {completed && <p className="k-lock">🔒 Plan accepted and locked.</p>}
          <p>The server checks the chronology, affected identity/session, action scope, preserved evidence and recovery dependencies. Explanations are optional and never keyword-scored. Incorrect plans award no chapter points.</p>
          <fieldset disabled={disabled || retrySeconds > 0}>
            <div className="k-answer-grid"><label>Affected account<input name="account" type="email" required maxLength={120} /></label><label>Affected session<input name="sessionId" required maxLength={100} /></label></div>
            <label>Response explanation (optional)<textarea name="explanation" maxLength={1000} rows={4} /></label>
            <div className="k-submit-row"><button className="k-btn k-btn-primary k-btn-lg" disabled={support.length < 5 || immediate.length === 0 || recovery.length === 0}>Submit containment plan</button>{!ready && !completed && <small>Complete steps 2–4 to submit.</small>}</div>
          </fieldset>
          <Feedback busy={busy} text={feedback} extra={retrySeconds > 0 && editable ? `Next submission available in ${retrySeconds}s.` : ""} />
        </Card>
      </form>

      <aside className="k-contain-rail" aria-label="Plan status and assistance">
        <Card title="Plan progress" eyebrow="LIVE CHECKLIST"><ol className="k-checklist">{checks.map(item => <li key={item.label} className={item.done ? "is-done" : ""}><span aria-hidden="true">{item.done ? "✓" : "○"}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}</ol></Card>
        <Card id="physical" className="containment-physical" eyebrow="PHYSICAL SECURITY-ROOM CLUE" title={evidence.cctvReference.id}>
          <p>{evidence.cctvReference.placement}</p>
          <p>Use the printed clue or an organizer-authorized accessible copy. Its badge/console observation corroborates opportunity; it does not prove intent or dictate a plan.</p>
          <button type="button" className="k-btn" onClick={() => void checkCopy()}>Check authorized CCTV copy</button><p role="status" className="k-feedback">{copyStatus}</p>
        </Card>
        <Card id="contain-hints" className="containment-hints" eyebrow="ASSISTANCE" title="Containment hints" aside={<Badge tone="amber">{state.progress.chapters[3].hints} / 2 used</Badge>}>
          <p>First hint −3 points; second −6 more. The global Tamper Alert is {state.progress.bonus ? "recorded at +5" : "not claimed in earlier chapters"}; Containment grants no new bonus.</p>
          <ol className="released-hints k-hints">{state.chapterHints[3].map((hint, i) => <li key={hint}><strong>Hint {i + 1}</strong><p>{hint}</p></li>)}</ol>
          <button type="button" className="k-btn" disabled={disabled || state.progress.chapters[3].hints >= 2} onClick={() => void send("hint")}>Request Containment hint {Math.min(2, state.progress.chapters[3].hints + 1)}</button>
        </Card>
      </aside>
    </div>
  </div>;
}
