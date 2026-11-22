"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useChapter, type ChapterState } from "./use-chapter";
import { useDrafts, type ServerDraft } from "./use-drafts";
import { ChainDiagram, ConnectionBanner, DeskFrame, HintBox, ResultStrip, StateBanner, TaskPanel, fieldApi, isEditable, taskOf } from "./workspace";
import { Badge } from "@/components/ui/kit";
import { ActivityTimeline } from "./case-visuals";
import type { InsiderDossier, InsiderRecord } from "@/types/insider";

const KIND: Record<InsiderRecord["kind"], { label: string; icon: string; tone: "info" | "amber" | "alert" | "ok" | "neutral" }> = {
  message: { label: "Message", icon: "✉", tone: "info" }, access: { label: "Access", icon: "⎆", tone: "neutral" }, policy: { label: "Policy change", icon: "⌘", tone: "alert" },
  approval: { label: "Approval", icon: "✓", tone: "ok" }, timeline: { label: "Timeline", icon: "◷", tone: "amber" }, custody: { label: "Custody", icon: "⚑", tone: "neutral" },
};
const initials = (name: string) => name.split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();

export function InsiderDesk({ initialDossier, initialState, initialDrafts }: { initialDossier: InsiderDossier | null; initialState: ChapterState; initialDrafts: ServerDraft[] }) {
  const { state, busy, feedback, result, connection, send, submitTask, remaining, retrySeconds } = useChapter(2, initialState);
  const editable = isEditable(state, 2);
  const drafts = useDrafts(2, initialDrafts, editable && state.insiderUnlocked === true), f = fieldApi(drafts);
  const [dossier, setDossier] = useState(initialDossier), [loadError, setLoadError] = useState("");
  const [suspect, setSuspect] = useState(""), [kind, setKind] = useState(""), [search, setSearch] = useState(""), [selected, setSelected] = useState(""), [copyStatus, setCopyStatus] = useState("");
  const pinned = f.arr("insider.corroboration", "supportingEvidenceIds");
  const sealed = !state.insiderUnlocked;
  useEffect(() => {
    if (!state.insiderUnlocked || dossier) return;
    let alive = true;
    async function load() {
      try { const response = await fetch("/api/game/insider", { cache: "no-store" }); if (!response.ok) throw new Error(); const data = await response.json(); if (alive && data.dossier) { setDossier(data.dossier); setLoadError(""); } }
      catch { if (alive) setLoadError("Unable to load the dossier. Your unlock is saved; retrying."); }
    }
    void load(); const retry = setInterval(load, 5000);
    return () => { alive = false; clearInterval(retry); };
  }, [state.insiderUnlocked, dossier]);
  async function copy(id: string) { try { await navigator.clipboard.writeText(id); setCopyStatus(`Copied ${id}`); } catch { setCopyStatus(`Select and copy ${id}`); } }
  function unlock(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; void send("unlock", Object.fromEntries(new FormData(form))).finally(() => form.reset()); }
  async function submit(task: string) {
    await drafts.flush();
    await submitTask(task, task === "insider.suspect" ? { employeeId: f.str(task, "employeeId") } : task === "insider.action" ? { actionId: f.str(task, "actionId") } : { supportingEvidenceIds: pinned });
  }
  const records = dossier?.records.filter(record => (!suspect || record.employees.includes(suspect)) && (!kind || record.kind === kind) && (!search.trim() || JSON.stringify(record).toLowerCase().includes(search.trim().toLowerCase()))) ?? [];
  const record = dossier?.records.find(item => item.id === selected) ?? records[0];
  const person = dossier?.suspects.find(item => item.id === suspect);
  const nameOf = (id: string) => dossier?.suspects.find(s => s.id === id)?.name ?? id;
  const countFor = (id: string) => dossier?.records.filter(r => r.employees.includes(id)).length ?? 0;

  return <DeskFrame chapter={2} title="Insider" caseId="PHYSICAL + DIGITAL" state={state} remaining={remaining} drafts={drafts} result={result} connection={connection} objective="Who deliberately weakened the controls? Access shows opportunity, not intent." banner={<><StateBanner state={state} chapter={2} /><ConnectionBanner text={connection || loadError} next="/play/insider" /></>}>
    {sealed && <section className="pg-gate-card k-gate" aria-labelledby="gate-h">
      <div><span className="k-eyebrow">DOSSIER SEALED</span><h2 id="gate-h">Combine your two physical fragments</h2><p>Fragment A: your registration envelope. Fragment B: your team’s card on the Evidence Wall. Ask a volunteer if one is missing.</p></div>
      <form onSubmit={unlock}><fieldset disabled={!editable || busy || retrySeconds > 0}><div className="pg-fields">
        <label>Fragment A<input name="fragmentA" required maxLength={64} autoComplete="off" spellCheck={false} /></label>
        <label>Fragment B<input name="fragmentB" required maxLength={64} autoComplete="off" spellCheck={false} /></label></div>
        <button className="k-btn k-btn-primary">Unlock dossier</button></fieldset></form>
      <p role="status" className="pg-live">{feedback}</p>
    </section>}
    {!sealed && !dossier && <p role="status" className="k-banner k-banner-ok">Unlock saved. Loading dossier…</p>}

    {dossier && <>
      <ChainDiagram label="Your insider case so far" nodes={[
        { id: "who", label: "Employee", value: f.str("insider.suspect", "employeeId") && `${f.str("insider.suspect", "employeeId")} · ${nameOf(f.str("insider.suspect", "employeeId"))}` },
        { id: "act", label: "Policy action", value: f.str("insider.action", "actionId") }, { id: "ev", label: "Evidence pinned", value: pinned.length ? `${pinned.length}` : "", note: "need 3+" }]} />

      <section className="pg-board" aria-label="Staff profiles">
        <h2 className="pg-h">The Evidence Wall</h2><p className="pg-hint-line">Selecting a profile only filters records. It is not a verdict.</p>
        <ul className="k-suspects">{dossier.suspects.map(item => <li key={item.id}><button type="button" className="k-suspect" aria-pressed={suspect === item.id} aria-label={`Filter to ${item.name}`} onClick={() => setSuspect(suspect === item.id ? "" : item.id)}>
          <span className="k-avatar" aria-hidden="true">{initials(item.name)}</span><strong>{item.name}</strong><span className="k-muted">{item.role}</span><Badge>{countFor(item.id)} records</Badge></button></li>)}</ul>
        {person && <dl className="pg-profile suspect-profile"><div><dt>ID</dt><dd className="k-mono">{person.id}</dd></div><div><dt>Role</dt><dd>{person.role}</dd></div><div><dt>Privileges</dt><dd>{person.privileges}</dd></div><div><dt>Responsibilities</dt><dd>{person.responsibilities}</dd></div><div><dt>Device</dt><dd className="k-mono">{person.device}</dd></div></dl>}
      </section>

      <section className="pg-console" aria-label="Dossier explorer">
        <div className="k-filterbar k-filterbar-3">
          <label className="k-filter">Search dossier<input value={search} onChange={e => setSearch(e.target.value)} placeholder="ID, device, phrase" /></label>
          <label className="k-filter">Suspect profile<select value={suspect} onChange={e => setSuspect(e.target.value)}><option value="">All</option>{dossier.suspects.map(item => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select></label>
          <label className="k-filter">Record type<select value={kind} onChange={e => setKind(e.target.value)}><option value="">All</option>{Object.keys(KIND).map(value => <option key={value}>{value}</option>)}</select></label></div>
        <div className="k-toolbar"><strong role="status">{records.length} of {dossier.records.length} records</strong><span className="k-spacer" /><button type="button" className="k-btn k-btn-sm" onClick={() => { setSearch(""); setKind(""); setSuspect(""); }}>Reset dossier filters</button></div>
        <ActivityTimeline label="Dossier timeline" items={records.map(r => ({ id: r.id, at: r.timestamp, lane: KIND[r.kind].label, tone: KIND[r.kind].tone }))} selectedId={record?.id} marked={pinned} linked={pinned}
          highlight={suspect ? records.filter(r => r.employees.includes(suspect)).map(r => r.id) : []} onSelect={setSelected} note="Colour = record type. Ringed = pinned. The line joins only the records you pinned." />
        <div className="k-insider-grid">
          <div className="k-reclist" role="region" aria-label="Dossier records" tabIndex={0}>{records.map(item => <button type="button" className={`k-rec k-rec-${item.kind}`} key={item.id} aria-pressed={record?.id === item.id} onClick={() => setSelected(item.id)}>
            <span className="k-rec-icon" aria-hidden="true">{KIND[item.kind].icon}</span>
            <span className="k-rec-main"><span className="k-mono k-muted">{item.id}</span><strong>{item.title}</strong><span className="k-rec-meta"><Badge tone={KIND[item.kind].tone}>{KIND[item.kind].label}</Badge><time dateTime={item.timestamp}>{item.timestamp.slice(11, 19)}</time>{pinned.includes(item.id) && <Badge tone="amber">★ pinned</Badge>}</span></span></button>)}
            {records.length === 0 && <p className="k-empty k-pad">No matching records.</p>}</div>
          {record && <article className={`k-recview k-rec-${record.kind}`} aria-label="Evidence detail" key={record.id}>
            <header><span className="k-eyebrow">{record.id} · {KIND[record.kind].label}</span><h3>{record.title}</h3><p className="k-mono k-muted">{record.timestamp}</p>
              <div className="k-badges">{record.employees.map(id => <button type="button" key={id} className="k-chip-btn" onClick={() => setSuspect(id)} aria-label={`Show records for ${nameOf(id)}`}>{initials(nameOf(id))} · {nameOf(id)}</button>)}</div></header>
            <p className="k-provenance">Source: {record.provenance}</p>
            <dl className="k-facts">{Object.entries(record.facts).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={record.kind === "policy" || record.kind === "access" ? "k-mono" : ""}>{value}</dd></div>)}</dl>
            <footer className="pg-actions"><button type="button" className="k-btn k-btn-sm k-btn-primary" disabled={!editable || pinned.length >= 8 && !pinned.includes(record.id)} onClick={() => f.toggle("insider.corroboration", "supportingEvidenceIds", record.id, 8)}>{pinned.includes(record.id) ? "★ Unpin evidence" : "☆ Pin evidence ID"}</button><button type="button" className="k-btn k-btn-sm" onClick={() => void copy(record.id)}>Copy ID</button>
              {record.kind === "policy" && <button type="button" className="k-btn k-btn-sm" disabled={!editable} onClick={() => f.set("insider.action", "actionId", record.id)}>Use as policy action</button>}</footer>
            <p role="status" className="pg-live">{copyStatus}</p>
          </article>}
        </div>
      </section>

      <section className="pg-tasks" aria-label="Scored tasks">
        <h2 className="pg-h">Tasks <small>Scored one by one</small></h2>
        <TaskPanel step={1} task={taskOf(state, 2, "insider.suspect")} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={!!f.str("insider.suspect", "employeeId")} why="Choose the employee." onSubmit={() => void submit("insider.suspect")}>
          <div className="pg-fields"><label>Insider employee<select disabled={!editable} value={f.str("insider.suspect", "employeeId")} onChange={e => f.set("insider.suspect", "employeeId", e.target.value)}><option value="">Select…</option>{dossier.suspects.map(item => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select></label></div></TaskPanel>
        <TaskPanel step={2} task={taskOf(state, 2, "insider.action")} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={!!f.str("insider.action", "actionId")} why="Choose the policy command." onSubmit={() => void submit("insider.action")}>
          <div className="pg-fields"><label>Unauthorized policy action<select disabled={!editable} value={f.str("insider.action", "actionId")} onChange={e => f.set("insider.action", "actionId", e.target.value)}><option value="">Select…</option>{dossier.records.filter(item => item.kind === "policy").map(item => <option value={item.id} key={item.id}>{item.id} · {item.title}</option>)}</select></label></div></TaskPanel>
        <TaskPanel step={3} task={taskOf(state, 2, "insider.corroboration")} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={pinned.length >= 3} why="Pin 3 to 8 records: intent, console access, approval." onSubmit={() => void submit("insider.corroboration")}>
          <div className="k-tray" aria-label="Pinned evidence">{pinned.length ? pinned.map(id => <span className="k-chip" key={id}><span className="k-mono">{id}</span>{editable && <button type="button" aria-label={`Unpin ${id}`} onClick={() => f.toggle("insider.corroboration", "supportingEvidenceIds", id)}>×</button>}</span>) : <small>Pin records from the dossier.</small>}</div></TaskPanel>
        <ResultStrip result={result} /><p role="status" className="pg-live">{feedback}</p>
      </section></>}

    <div className="pg-aux">
      <HintBox chapter={2} state={state} editable={editable} busy={busy} onHint={() => void send("hint")} />
      {dossier && <details className="pg-hints"><summary>Notes <span className="pg-chip">private to your team</span></summary><label>Scratchpad<textarea rows={4} maxLength={900} disabled={!editable} value={f.str("notes", "text")} onChange={e => f.set("notes", "text", e.target.value)} /></label></details>}
    </div>
  </DeskFrame>;
}
