"use client";
import { useState } from "react";
import { useChapter, type ChapterState } from "./use-chapter";
import { useDrafts, type ServerDraft } from "./use-drafts";
import { ContainmentCctv } from "./containment-cctv";
import { ChainDiagram, ConnectionBanner, DeskFrame, HintBox, ResultStrip, StateBanner, TaskNav, TaskPanel, fieldApi, isEditable, taskOf } from "./workspace";
import { Badge } from "@/components/ui/kit";
import type { ContainmentCctv as Snapshot, ContainmentEvidence } from "@/types/containment";

type Option = { id: string; title: string; detail: string };
const DRAFT = { timeline: "containment.timeline", identity: "containment.identity", immediate: "containment.immediate", recovery: "containment.recovery", evidence: "containment.evidence" } as const;

export function ContainmentDesk({ evidence, initialCctv, initialState, initialDrafts }: { evidence: ContainmentEvidence; initialCctv: Snapshot | null; initialState: ChapterState; initialDrafts: ServerDraft[] }) {
  const { state, busy, feedback, result, connection, send, submitTask, remaining, retrySeconds } = useChapter(3, initialState);
  const editable = isEditable(state, 3);
  const drafts = useDrafts(3, initialDrafts, editable), f = fieldApi(drafts);
  const [movement, setMovement] = useState(""), [dragging, setDragging] = useState<string | null>(null), [cctv, setCctv] = useState(initialCctv), [copyStatus, setCopyStatus] = useState("");
  const knownEvents = new Set(evidence.events.map(e => e.id));
  const saved = f.arr(DRAFT.timeline, "eventOrder").filter(id => knownEvents.has(id));
  const eventOrder = saved.length === evidence.events.length ? saved : evidence.events.map(e => e.id);
  const immediate = f.arr(DRAFT.immediate, "immediateActions"), recovery = f.arr(DRAFT.recovery, "recoveryOrder"), support = f.arr(DRAFT.evidence, "supportingEvidenceIds");
  const optionById = (list: Option[], id: string) => list.find(o => o.id === id);

  function reorder(key: string, task: string, ids: string[], id: string, delta: number) {
    const index = ids.indexOf(id), target = index + delta;
    if (!editable || index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids]; [next[index], next[target]] = [next[target], next[index]];
    f.set(task, key, next); setMovement(`${id} moved to position ${target + 1} of ${ids.length}.`);
  }
  function dropOn(key: string, task: string, ids: string[], targetId: string) {
    if (!dragging || !editable || dragging === targetId) return setDragging(null);
    const next = ids.filter(id => id !== dragging); next.splice(ids.indexOf(targetId), 0, dragging);
    f.set(task, key, next); setMovement(`${dragging} moved to position ${next.indexOf(dragging) + 1} of ${ids.length}.`); setDragging(null);
  }
  const controls = (key: string, task: string, ids: string[], id: string, label: string) => { const index = ids.indexOf(id);
    return <div className="k-order-controls"><button type="button" className="k-btn k-btn-sm" disabled={!editable || index === 0} aria-label={`Move ${label} ${id} up`} onClick={() => reorder(key, task, ids, id, -1)}>↑</button><button type="button" className="k-btn k-btn-sm" disabled={!editable || index === ids.length - 1} aria-label={`Move ${label} ${id} down`} onClick={() => reorder(key, task, ids, id, 1)}>↓</button></div>; };
  const drag = (key: string, task: string, ids: string[], id: string) => ({ draggable: editable, className: dragging === id ? "is-dragging" : "", onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; setDragging(id); }, onDragEnd: () => setDragging(null), onDragOver: (e: React.DragEvent) => e.preventDefault(), onDrop: () => dropOn(key, task, ids, id) });
  async function submit(task: string) {
    await drafts.flush();
    const answer = task === DRAFT.timeline ? { eventOrder } : task === DRAFT.identity ? { account: f.str(task, "account").trim(), sessionId: f.str(task, "sessionId").trim() } : task === DRAFT.immediate ? { immediateActions: immediate } : task === DRAFT.recovery ? { recoveryOrder: recovery } : { supportingEvidenceIds: support };
    await submitTask(task, answer);
  }
  async function checkCopy() {
    setCopyStatus("Checking…");
    try { const response = await fetch("/api/game/containment", { cache: "no-store" }); if (!response.ok) throw new Error(); const data = await response.json(); setCctv(data.fallbackCctv); setCopyStatus(data.fallbackCctv ? "Accessible copy loaded. No hint charge." : "No accessible copy granted. Ask the organizer."); }
    catch { setCopyStatus("Unable to check. Retry; nothing changed."); }
  }
  const choice = (item: Option, picked: boolean, change: () => void, aria: string) => <label key={item.id} className={`k-choice ${picked ? "is-picked" : ""}`}><input type="checkbox" checked={picked} disabled={!editable} onChange={change} aria-label={aria} /><span><strong>{item.id} · {item.title}</strong><small>{item.detail}</small></span></label>;
  const evidenceItems = [...evidence.artifacts.map(item => ({ id: item.id, title: item.title })), { id: evidence.cctvReference.id, title: "Security-room snapshot" }];

  return <DeskFrame chapter={3} title="Containment" caseId={evidence.caseId} state={state} remaining={remaining} drafts={drafts} objective="Stop it, keep the evidence, restore safely. All actions are fictional decisions." banner={<><StateBanner state={state} chapter={3} /><ConnectionBanner text={connection} next="/play/containment" /></>}>
    <section className="pg-command" aria-label="Response checkpoint">
      <Badge tone="alert">Data already exfiltrated</Badge><Badge tone="info">{evidence.checkpoint} UTC</Badge><Badge>{evidence.account}</Badge><Badge className="k-mono">{evidence.sessionId}</Badge>
      <p>Treat the session as usable until revocation is verified. Keep support and approved archive/maintenance jobs running.</p>
    </section>
    <ChainDiagram label="Response stages" nodes={[
      { id: "t", label: "1 · Reconstruct", value: "7 events", note: "order below" }, { id: "i", label: "2 · Immediate (parallel)", value: immediate.length ? `${immediate.length} chosen` : "", note: "no order needed" },
      { id: "r", label: "3 · Recovery (ordered)", value: recovery.length ? `${recovery.length} steps` : "", note: "dependencies matter" }, { id: "e", label: "Evidence kept", value: support.length ? `${support.length} pinned` : "", note: "need 5" }]} />
    {cctv && <ContainmentCctv snapshot={cctv} />}

    <section className="pg-tasks" aria-label="Scored tasks">
      <h2 className="pg-h">Tasks <small>Submit each one when ready. Points are saved per task.</small></h2>
      <TaskNav tasks={state.tasks[3]} />

      <TaskPanel step={1} task={taskOf(state, 3, DRAFT.timeline)} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready onSubmit={() => void submit(DRAFT.timeline)}>
        <p className="pg-hint-line">Earliest first. Use cited timestamps and causal links, not card order. Drag, or use ↑ ↓.</p>
        <ol className="k-timeline containment-order pg-order" aria-label="Seven-event timeline">{eventOrder.map((id, index) => { const event = evidence.events.find(item => item.id === id)!, d = drag("eventOrder", DRAFT.timeline, eventOrder, id);
          return <li key={id} data-event-id={id} {...d}><span className="k-tl-pos" aria-hidden="true">{index + 1}</span>
            <div className="k-tl-card"><header><span className="k-mono k-muted">{event.id}</span><time dateTime={event.timestamp} className="k-mono">{event.timestamp} UTC</time></header><h4>{event.title}</h4><p>{event.description}</p>
              <details><summary>Sources</summary><p className="k-meta">Principal: {event.principal}<br />Session: {event.sessionId}<br />Sources: {event.sourceIds.join(", ")}<br />Confidence: {event.confidence}</p></details>{controls("eventOrder", DRAFT.timeline, eventOrder, id, "event")}</div></li>; })}</ol>
        <p role="status" aria-live="polite" className="pg-live">{movement}</p>
      </TaskPanel>

      <TaskPanel step={2} task={taskOf(state, 3, DRAFT.identity)} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={!!(f.str(DRAFT.identity, "account").trim() && f.str(DRAFT.identity, "sessionId").trim())} why="Enter the affected account and session." onSubmit={() => void submit(DRAFT.identity)}>
        <div className="pg-fields"><label>Affected account<input type="email" maxLength={120} disabled={!editable} value={f.str(DRAFT.identity, "account")} onChange={e => f.set(DRAFT.identity, "account", e.target.value)} /></label>
          <label>Affected session<input maxLength={100} disabled={!editable} value={f.str(DRAFT.identity, "sessionId")} onChange={e => f.set(DRAFT.identity, "sessionId", e.target.value)} /></label></div>
      </TaskPanel>

      <TaskPanel step={3} task={taskOf(state, 3, DRAFT.immediate)} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={immediate.length > 0} why="Choose the scoped urgent actions." onSubmit={() => void submit(DRAFT.immediate)}>
        <p className="pg-hint-line">Urgent steps run in parallel. Over-broad actions score nothing for this task.</p>
        <fieldset disabled={!editable}><legend className="k-sr">Immediate actions</legend><div className="k-choices">{evidence.immediateOptions.map(item => choice(item, immediate.includes(item.id), () => f.toggle(DRAFT.immediate, "immediateActions", item.id, 10), `Select immediate ${item.id}`))}</div></fieldset>
      </TaskPanel>

      <TaskPanel step={4} task={taskOf(state, 3, DRAFT.recovery)} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={recovery.length > 0} why="Choose recovery steps, then order them." onSubmit={() => void submit(DRAFT.recovery)}>
        <p className="pg-hint-line">Pick supported steps, then order them. Close the weakness before the barrier check; verify before restoring.</p>
        <fieldset disabled={!editable}><legend className="k-sr">Recovery decisions</legend><div className="k-choices">{evidence.recoveryOptions.map(item => choice(item, recovery.includes(item.id), () => f.toggle(DRAFT.recovery, "recoveryOrder", item.id, 9), `Select recovery ${item.id}`))}</div></fieldset>
        {recovery.length > 0 ? <ol className="k-timeline k-timeline-recovery containment-order recovery-order pg-order pg-flow" aria-label="Ordered recovery plan">{recovery.map((id, index) => { const item = optionById(evidence.recoveryOptions, id)!, d = drag("recoveryOrder", DRAFT.recovery, recovery, id);
          return <li key={id} data-recovery-id={id} {...d}><span className="k-tl-pos" aria-hidden="true">{index + 1}</span><div className="k-tl-card"><h4>{item.id} · {item.title}</h4>{controls("recoveryOrder", DRAFT.recovery, recovery, id, "recovery")}</div></li>; })}</ol> : <p className="k-empty">No recovery steps chosen yet.</p>}
      </TaskPanel>

      <TaskPanel step={5} task={taskOf(state, 3, DRAFT.evidence)} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={support.length >= 5} why="Pin at least five records (include the security-room snapshot)." onSubmit={() => void submit(DRAFT.evidence)}>
        <div className="pg-preserve" aria-label="Evidence preservation">{evidenceItems.map(item => { const on = support.includes(item.id); return <label key={item.id} className={`k-choice k-choice-sm ${on ? "is-picked" : ""}`}><input type="checkbox" checked={on} disabled={!editable} onChange={() => f.toggle(DRAFT.evidence, "supportingEvidenceIds", item.id, 10)} aria-label={`Pin evidence ${item.id}`} /><span><strong className="k-mono">{item.id}</strong><small>{item.title}</small></span><span className="pg-preserved" aria-hidden="true">{on ? "preserved" : ""}</span></label>; })}</div>
        <details className="pg-hints"><summary>Read the records</summary><div className="k-drawer">{evidence.observations.map(item => <details key={item.id}><summary>{item.id} · {item.title} · observation</summary><p>{item.timestamp} UTC · {item.principal} · {item.sessionId}</p><p>{item.description}</p><p>Sources: {item.sourceIds.join(", ")} · {item.confidence}</p></details>)}
          {evidence.artifacts.map(item => <details key={item.id}><summary>{item.id} · {item.title}</summary><dl className="k-facts">{Object.entries(item.facts).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="k-mono">{value}</dd></div>)}</dl></details>)}</div></details>
      </TaskPanel>
      <ResultStrip result={result} /><p role="status" className="pg-live">{feedback}</p>
    </section>

    <div className="pg-aux">
      <details className="pg-hints"><summary>Security-room clue <span className="pg-chip">{evidence.cctvReference.id}</span></summary><p>{evidence.cctvReference.placement}</p>
        <button type="button" className="k-btn k-btn-sm" onClick={() => void checkCopy()}>Check authorized CCTV copy</button><p role="status" className="pg-live">{copyStatus}</p></details>
      <HintBox chapter={3} state={state} editable={editable} busy={busy} onHint={() => void send("hint")} />
      <details className="pg-hints"><summary>Notes <span className="pg-chip">private to your team</span></summary><label>Scratchpad<textarea rows={4} maxLength={900} disabled={!editable} value={f.str("notes", "text")} onChange={e => f.set("notes", "text", e.target.value)} /></label></details>
    </div>
  </DeskFrame>;
}
