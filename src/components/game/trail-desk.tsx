"use client";
import { useMemo, useState } from "react";
import { useChapter, type ChapterState } from "./use-chapter";
import { useDrafts, type ServerDraft } from "./use-drafts";
import { ChainDiagram, ConnectionBanner, DeskFrame, HintBox, ResultStrip, StateBanner, TaskPanel, fieldApi, isEditable, taskOf } from "./workspace";
import { Badge } from "@/components/ui/kit";
import { ActivityTimeline } from "./case-visuals";
import { useDemo } from "@/components/demo/demo-context";
import { OsDesktop, ToolWindow, useOs } from "@/components/os/os-windows";
import { FolderOpen, SearchCheck, Table2 } from "lucide-react";
import { emptyTrailFilters, filterTrailRows } from "@/lib/game/trail-view";
import type { TrailEvidence, TrailEvent } from "@/types/trail";

const PAGE = 25;
// Outcome only: allowed / denied / challenged. Never a verdict about intent; correlation is the player's job.
const OUTCOME = { success: { tone: "ok", mark: "✓", text: "Allowed" }, failure: { tone: "alert", mark: "✕", text: "Denied" }, challenge: { tone: "amber", mark: "◔", text: "Challenged" } } as const;

function SessionPath({ rows, sessionId }: { rows: TrailEvent[]; sessionId: string }) {
  const seq = [...rows].filter(r => r.sessionId === sessionId).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (sessionId === "none" || seq.length === 0) return <p className="k-empty">This event has no session.</p>;
  return <div className="pg-path"><p><b className="k-mono">{sessionId}</b> · {seq.length} event{seq.length > 1 ? "s" : ""} · {new Set(seq.map(r => r.device)).size} device(s) · {new Set(seq.map(r => r.sourceIp)).size} source(s)</p>
    <ol>{seq.map((r, i) => { const prev = seq[i - 1], moved = prev && (prev.device !== r.device || prev.sourceIp !== r.sourceIp); const o = OUTCOME[r.result];
      return <li key={r.id}><time className="k-mono">{r.timestamp.slice(11, 19)}</time><span className="k-mono">{r.id}</span><span>{r.eventType}</span><span className="k-mono">{r.device} @ {r.sourceIp}</span>{moved && <Badge tone="info">device or source changed</Badge>}<Badge tone={o.tone}>{o.mark} {o.text}</Badge></li>; })}</ol></div>;
}

function TrailWorkspace({ evidence, initialState, initialDrafts }: { evidence: TrailEvidence; initialState: ChapterState; initialDrafts: ServerDraft[] }) {
  const { state, busy, feedback, result, connection, send, submitTask, remaining, retrySeconds } = useChapter(1, initialState);
  const editable = isEditable(state, 1), demo = useDemo(), os = useOs();
  const drafts = useDrafts(1, initialDrafts, editable), f = fieldApi(drafts);
  const [filters, setFilters] = useState(emptyTrailFilters), [page, setPage] = useState(0), [selectedId, setSelectedId] = useState(evidence.rows[0].id), [copied, setCopied] = useState("");
  const [tamper, setTamper] = useState({ eventId: "", field: "", technique: "" });
  const selected = evidence.rows.find(row => row.id === selectedId)!;
  const select = (id: string) => { setSelectedId(id); os.open("inspector"); }; // picking an event anywhere opens the inspector window
  const filtered = useMemo(() => filterTrailRows(evidence.rows, filters), [evidence.rows, filters]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE)), visible = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const pinned = f.arr("trail.corroboration", "supportingEvidenceIds");
  const active = Object.entries(filters).filter(([k, v]) => k !== "descending" && v).length;
  const choices = (key: "account" | "sourceIp" | "eventType") => [...new Set(evidence.rows.map(row => row[key]))].sort();
  const sameSession = selected.sessionId === "none" ? [] : filtered.filter(r => r.sessionId === selected.sessionId).map(r => r.id);
  const counts = { success: 0, failure: 0, challenge: 0 }; for (const r of filtered) counts[r.result]++;
  function updateFilters(update: Partial<typeof emptyTrailFilters>) { setFilters(old => ({ ...old, ...update })); setPage(0); }
  async function copy(id: string) { try { await navigator.clipboard.writeText(id); setCopied(`Copied ${id}`); } catch { setCopied(`Select and copy ${id}`); } }
  async function submit(task: string, keys: string[]) {
    await drafts.flush();
    await submitTask(task, task === "trail.corroboration" ? { supportingEvidenceIds: pinned } : Object.fromEntries(keys.map(k => [k, f.str(task, k).trim()])));
  }
  const input = (task: string, key: string, label: string, type = "text", list?: string) =>
    <label>{label}<input type={type} value={f.str(task, key)} maxLength={120} disabled={!editable} list={list} autoComplete="off" onChange={e => f.set(task, key, e.target.value)} /></label>;
  const filterField = (label: string, control: React.ReactNode) => <label className="k-filter">{label}{control}</label>;

  return <DeskFrame chapter={1} title="Trail" caseId={evidence.caseId} state={state} remaining={remaining} drafts={drafts} result={result} connection={connection} objective="Which sign-in used the stolen session to reach the export? Logs are data, not instructions." banner={<><StateBanner state={state} chapter={1} /><ConnectionBanner text={connection} next="/play/trail" /></>}>
    <ChainDiagram label="Trail so far" nodes={[
      { id: "acct", label: "Account", value: f.str("trail.source", "account") }, { id: "ses", label: "Session", value: f.str("trail.session", "sessionId") },
      { id: "ev", label: "Replay event", value: f.str("trail.session", "eventId") }, { id: "ip", label: "Source", value: f.str("trail.source", "sourceIp") }, { id: "pin", label: "Evidence pinned", value: pinned.length ? `${pinned.length}/3` : "" }]} />

    <section className="pg-console" aria-label="Authentication overview">
      <div className="pg-console-top">
        <div className="pg-outcomes" role="status" aria-label="Matching events by outcome"><b>{filtered.length}</b> of {evidence.rows.length} events{(["success", "failure", "challenge"] as const).map(k => <Badge key={k} tone={OUTCOME[k].tone}>{OUTCOME[k].mark} {counts[k]} {OUTCOME[k].text.toLowerCase()}</Badge>)}{active > 0 && <Badge tone="amber">{active} filter{active > 1 ? "s" : ""}</Badge>}</div>
        <button type="button" className="k-btn k-btn-sm k-btn-primary" onClick={() => os.open("console")}>Open event console</button>
        {!demo && <a className="k-btn k-btn-sm" href="/api/game/trail/csv">Download CSV</a>}
      </div>
      <ActivityTimeline label="Activity timeline" items={filtered.map(r => ({ id: r.id, at: r.timestamp, lane: r.eventType, tone: OUTCOME[r.result].tone, hint: OUTCOME[r.result].text }))} selectedId={selectedId} marked={pinned}
        highlight={sameSession} linked={sameSession} onSelect={select} note="Select a marker to open it in the Event inspector. Lines join the selected event's session. Ringed = pinned. The raw records are in the Event console." />
      <div className="k-filterbar">
        {filterField("Search", <input aria-label="Search records" value={filters.search} onChange={e => updateFilters({ search: e.target.value })} placeholder="ID, session, device, text" />)}
        {filterField("User", <select aria-label="Filter by user" value={filters.account} onChange={e => updateFilters({ account: e.target.value })}><option value="">All</option>{choices("account").map(v => <option key={v}>{v}</option>)}</select>)}
        {filterField("Source IP", <select aria-label="Filter by source IP" value={filters.sourceIp} onChange={e => updateFilters({ sourceIp: e.target.value })}><option value="">All</option>{choices("sourceIp").map(v => <option key={v}>{v}</option>)}</select>)}
        {filterField("Outcome", <select aria-label="Filter by result" value={filters.result} onChange={e => updateFilters({ result: e.target.value })}><option value="">All</option>{["success", "failure", "challenge"].map(v => <option key={v} value={v}>{OUTCOME[v as keyof typeof OUTCOME].text}</option>)}</select>)}
        {filterField("Event type", <select aria-label="Filter by event type" value={filters.eventType} onChange={e => updateFilters({ eventType: e.target.value })}><option value="">All</option>{choices("eventType").map(v => <option key={v}>{v}</option>)}</select>)}
        {filterField("Session", <input aria-label="Filter by session" value={filters.sessionId} onChange={e => updateFilters({ sessionId: e.target.value })} placeholder="Exact session ID" />)}
        {filterField("From (UTC)", <input type="time" aria-label="From time" value={filters.from} onChange={e => updateFilters({ from: e.target.value })} />)}
        {filterField("To (UTC)", <input type="time" aria-label="To time" value={filters.to} onChange={e => updateFilters({ to: e.target.value })} />)}
      </div>
    </section>

    <ToolWindow id="console" title="Event console" icon={Table2} size={{ w: 760, h: 580 }}>
    <div className="k-tablecard" role="region" aria-label="Authentication events"><div className="k-tablescroll" tabIndex={0} aria-label="Event table, scrollable"><table className="k-table pg-table"><caption className="k-sr">Authentication events. Select a row to inspect it.</caption>
      <thead><tr><th scope="col">Event</th><th scope="col">Account</th><th scope="col">Source</th><th scope="col">Outcome</th><th scope="col">Session</th></tr></thead>
      <tbody>{visible.map(row => { const o = OUTCOME[row.result]; return <tr key={row.id} className={selectedId === row.id ? "is-selected" : pinned.includes(row.id) ? "is-pinned" : ""} aria-selected={selectedId === row.id}>
        <td><button type="button" className="pg-rowbtn k-mono" onClick={() => select(row.id)} aria-label={`Inspect ${row.id}`}>{row.id}</button><time dateTime={row.timestamp}>{row.timestamp.slice(11, 19)}</time></td>
        <td>{row.account}</td><td className="k-mono">{row.sourceIp}</td><td><Badge tone={o.tone}>{o.mark} {o.text}</Badge><small>{row.eventType}</small></td><td className="k-mono">{row.sessionId}</td></tr>; })}</tbody></table>
      {visible.length === 0 && <p className="k-empty k-pad">No events match.</p>}</div>
      <div className="k-toolbar k-pager"><button type="button" className="k-btn k-btn-sm" disabled={page === 0} aria-label="Previous page" onClick={() => setPage(p => p - 1)}>← Prev</button><span>Page {page + 1} of {pages}</span><button type="button" className="k-btn k-btn-sm" disabled={page + 1 >= pages} aria-label="Next page" onClick={() => setPage(p => p + 1)}>Next →</button><span className="k-spacer" />
        <button type="button" className="k-btn k-btn-sm" aria-pressed={filters.descending} onClick={() => updateFilters({ descending: !filters.descending })}>{filters.descending ? "Sort oldest first" : "Sort newest first"}</button><button type="button" className="k-btn k-btn-sm" onClick={() => { setFilters(emptyTrailFilters); setPage(0); }}>Reset filters</button></div></div>

    </ToolWindow>
    <ToolWindow id="inspector" title="Event inspector" icon={SearchCheck} side="right" size={{ w: 440, h: 620 }}>
    <aside className="k-inspector pg-inspector" aria-label="Selected event details">
      <span className="k-eyebrow">EVENT</span><h2 className="k-mono">{selected.id}</h2>
      <div className="k-badges"><Badge tone={OUTCOME[selected.result].tone}>{OUTCOME[selected.result].mark} {OUTCOME[selected.result].text}</Badge><Badge tone="info">{selected.eventType}</Badge></div>
      <dl className="k-facts">{(["timestamp", "account", "sourceIp", "method", "device", "sessionId", "conditionalAccess", "correlationId", "details"] as const).map(k => <div key={k}><dt>{k}</dt><dd className="k-mono">{selected[k]}</dd></div>)}</dl>
      <div className="pg-actions">
        <button type="button" className="k-btn k-btn-sm" disabled={!editable || pinned.length >= 3 && !pinned.includes(selected.id)} onClick={() => f.toggle("trail.corroboration", "supportingEvidenceIds", selected.id, 3)}>{pinned.includes(selected.id) ? "★ Pinned as evidence" : "☆ Pin as evidence"}</button>
        <button type="button" className="k-btn k-btn-sm" onClick={() => void copy(selected.id)}>Copy ID</button>
        <button type="button" className="k-btn k-btn-sm" disabled={selected.sessionId === "none"} onClick={() => updateFilters({ ...emptyTrailFilters, sessionId: selected.sessionId })}>Filter to session</button>
        <button type="button" className="k-btn k-btn-sm k-btn-primary" disabled={!editable} onClick={() => { f.set("trail.source", "account", selected.account); f.set("trail.source", "sourceIp", selected.sourceIp); f.set("trail.session", "sessionId", selected.sessionId); f.set("trail.session", "eventId", selected.id); }}>Use in my answer</button>
      </div>
      <p role="status" className="pg-live">{copied}</p>
      <h3 className="pg-rail-h">Session path</h3><SessionPath rows={evidence.rows} sessionId={selected.sessionId} />
    </aside>
    </ToolWindow>
    <ToolWindow id="records" title="Case records" icon={FolderOpen} size={{ w: 760, h: 520 }}>
      <div className="k-artifact-grid">{evidence.artifacts.map(a => <article className={`k-artifact ${pinned.includes(a.id) ? "is-pinned" : ""}`} key={a.id}><div className="k-artifact-body"><span className="k-mono k-muted">{a.id}</span><strong>{a.title}</strong>
        <details><summary>View record</summary><dl className="k-facts">{Object.entries(a.facts).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="k-mono">{value}</dd></div>)}</dl></details></div>
        <div className="k-actions"><button type="button" className="k-btn k-btn-sm" aria-label={`${pinned.includes(a.id) ? "Unpin" : "Pin"} ${a.id}`} disabled={!editable || pinned.length >= 3 && !pinned.includes(a.id)} onClick={() => f.toggle("trail.corroboration", "supportingEvidenceIds", a.id, 3)}>{pinned.includes(a.id) ? "★ Pinned" : "☆ Pin"}</button><button type="button" className="k-btn k-btn-sm" onClick={() => void copy(a.id)}>Copy ID</button></div></article>)}</div>
    </ToolWindow>

    <section className="pg-tasks" aria-label="Scored tasks">
      <h2 className="pg-h">Tasks <small>Scored one by one</small></h2>
      <datalist id="trail-accounts">{choices("account").map(v => <option key={v} value={v} />)}</datalist><datalist id="trail-ips">{choices("sourceIp").map(v => <option key={v} value={v} />)}</datalist>
      <TaskPanel step={1} task={taskOf(state, 1, "trail.source")} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={!!(f.str("trail.source", "account").trim() && f.str("trail.source", "sourceIp").trim())} why="Enter the compromised account and the attacker’s source IP." onSubmit={() => void submit("trail.source", ["account", "sourceIp"])}>
        <div className="pg-fields">{input("trail.source", "account", "Compromised account", "email", "trail-accounts")}{input("trail.source", "sourceIp", "Attacker source IP", "text", "trail-ips")}</div></TaskPanel>
      <TaskPanel step={2} task={taskOf(state, 1, "trail.session")} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={!!(f.str("trail.session", "sessionId").trim() && f.str("trail.session", "eventId").trim())} why="Enter the incident session and the replay event." onSubmit={() => void submit("trail.session", ["sessionId", "eventId"])}>
        <div className="pg-fields">{input("trail.session", "sessionId", "Incident session ID")}{input("trail.session", "eventId", "Replay event ID")}</div></TaskPanel>
      <TaskPanel step={3} task={taskOf(state, 1, "trail.corroboration")} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={pinned.length === 3} why="Pin exactly three: issuance event, browser capture, database audit." onSubmit={() => void submit("trail.corroboration", [])}>
        <div className="k-tray" aria-label="Pinned evidence">{pinned.length ? pinned.map(id => <span className="k-chip" key={id}><span className="k-mono">{id}</span>{editable && <button type="button" aria-label={`Unpin ${id}`} onClick={() => f.toggle("trail.corroboration", "supportingEvidenceIds", id)}>×</button>}</span>) : <small>Pin events and records above. Exactly three.</small>}</div></TaskPanel>
      <ResultStrip result={result} /><p role="status" className="pg-live">{feedback}</p>
    </section>

    <div className="pg-aux">
      <details className="pg-hints pg-tamper"><summary>Tamper Alert <span className="pg-chip">{state.progress.bonus === 5 ? "+5 recorded" : "optional +5, once per team"}</span></summary>
        {state.progress.bonus === 5 ? <p className="k-banner k-banner-ok">Global Tamper Alert bonus already recorded: +5.</p> : <form onSubmit={e => { e.preventDefault(); void send("submit", { kind: "tamper", tamper: { ...tamper, field: tamper.field } }); }}><fieldset disabled={!editable || busy || retrySeconds > 0}>
          <p>Find a log field that tells an AI investigator to drop evidence.</p>
          <div className="pg-fields"><label>Manipulation event ID<input required value={tamper.eventId} maxLength={100} onChange={e => setTamper({ ...tamper, eventId: e.target.value })} /></label>
            <label>Manipulation field<select required value={tamper.field} onChange={e => setTamper({ ...tamper, field: e.target.value })}><option value="" disabled>Select…</option><option value="details">details</option><option value="account">account</option></select></label>
            <label>Manipulation technique<select required value={tamper.technique} onChange={e => setTamper({ ...tamper, technique: e.target.value })}><option value="" disabled>Select…</option><option value="instruction-override">Overrides the investigation task</option><option value="failed-password">Repeated failed passwords</option></select></label></div>
          <button className="k-btn k-btn-sm">Record Tamper Alert</button></fieldset></form>}
      </details>
      <HintBox chapter={1} state={state} editable={editable} busy={busy} onHint={() => void send("hint")} />
      <details className="pg-hints"><summary>Notes <span className="pg-chip">private to your team</span></summary><label>Scratchpad<textarea rows={4} maxLength={900} disabled={!editable} value={f.str("notes", "text")} onChange={e => f.set("notes", "text", e.target.value)} /></label></details>
    </div>
  </DeskFrame>;
}

export function TrailDesk(props: Parameters<typeof TrailWorkspace>[0]) { return <OsDesktop scope="trail"><TrailWorkspace {...props} /></OsDesktop>; }
