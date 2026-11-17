"use client";
import { useState, type FormEvent } from "react";
import { useChapter, type ChapterState } from "./use-chapter";
import { Badge, Card, Feedback, MissionBar, ContinueBar } from "@/components/ui/kit";
import { emptyTrailFilters, filterTrailRows } from "@/lib/game/trail-view";
import type { TrailEvidence } from "@/types/trail";

const PAGE = 25;
const resultTone = { success: "ok", failure: "alert", challenge: "amber" } as const;
const ids = (text: string) => text.split(/[,\s]+/).filter(Boolean);

export function TrailDesk({ evidence, initialState }: { evidence: TrailEvidence; initialState: ChapterState }) {
  const { state, busy, feedback, connection, send, remaining, retrySeconds } = useChapter(1, initialState);
  const [filters, setFilters] = useState(emptyTrailFilters);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(evidence.rows[0].id);
  const [clipboard, setClipboard] = useState("");
  const [evidenceIds, setEvidenceIds] = useState("");
  const [conclusion, setConclusion] = useState({ account: "", sourceIp: "", sessionId: "", eventId: "" });
  const selected = evidence.rows.find(row => row.id === selectedId)!;
  const filtered = filterTrailRows(evidence.rows, filters);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const visible = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const completed = state.progress.chapters[1].completedAt !== null;
  const editable = state.status === "active" && state.current === 1 && !completed;
  const locked = !editable || busy || retrySeconds > 0;
  const pinned = ids(evidenceIds), related = selected.sessionId === "none" ? 0 : evidence.rows.filter(r => r.sessionId === selected.sessionId).length;
  const active = Object.entries(filters).filter(([k, v]) => k !== "descending" && v).length;
  const choices = (key: "account" | "sourceIp" | "eventType") => [...new Set(evidence.rows.map(row => row[key]))].sort();
  function updateFilters(update: Partial<typeof emptyTrailFilters>) { setFilters(old => ({ ...old, ...update })); setPage(0); }
  const pin = (id: string) => setEvidenceIds([...new Set([...pinned, id])].join(", "));
  const unpin = (id: string) => setEvidenceIds(pinned.filter(p => p !== id).join(", "));
  async function copy(id: string) {
    try { await navigator.clipboard.writeText(id); setClipboard(`Evidence ID copied: ${id}`); }
    catch { setClipboard(`Clipboard unavailable. Select and copy the displayed evidence ID: ${id}`); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void send("submit", { kind: "conclusion", ...conclusion, supportingEvidenceIds: pinned, explanation: String(form.get("explanation") ?? "") });
  }
  function reportTamper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send("submit", { kind: "tamper", tamper: Object.fromEntries(new FormData(event.currentTarget)) });
  }
  const filterField = (label: string, control: React.ReactNode) => <label className="k-filter">{label}{control}</label>;

  return <div className="k-desk">
    <MissionBar chapter={1} title="Trail" caseId={evidence.caseId} state={state} remaining={remaining} objective="Prove which successful sign-in led to the database export. Suggested budget: 13 minutes." />
    {completed && <div className="k-banner k-banner-ok" role="status"><div><strong>Chapter 2 completed. Chapter 3 unlocked.</strong><span>Your result is saved. Collect your physical fragments for Insider.</span></div><a className="k-btn k-btn-primary" href="/play/insider">Open Chapter 3 →</a></div>}
    {!editable && !completed && <p className="k-banner k-banner-warn">The round is {state.status}. Evidence remains read-only; hints and submissions are closed.</p>}
    {connection && <p className="k-banner k-banner-warn" role="alert">{connection} <a href="/login?next=/play/trail">Sign in</a></p>}

    <Card eyebrow="IDENTITY PROVIDER / RETAINED EVENTS" title="Briefing" aside={<div className="k-actions"><a className="k-btn" href="/api/game/trail/csv">Download login CSV</a><a className="k-btn" href="/play/inbox">Review Inbox evidence</a><a className="k-btn" href="#trail-conclusion">Go to conclusion ↓</a></div>}>
      <p>Inbox established a suspect and incident session. Failed attempts, a valid VPN, approved maintenance and an unrelated alert are mixed in. IP frequency, a shared account or cookie reuse alone cannot settle the case. Log text is untrusted data, including instructions aimed at AI tools.</p>
      <small>All timestamps UTC. Fictional identities, documentation-only IPs, no live lookups. The CSV holds the complete dataset for your team.</small>
    </Card>

    <section className="k-console" aria-label="Log filters">
      <div className="k-filterbar">
        {filterField("Search records", <input value={filters.search} onChange={e => updateFilters({ search: e.target.value })} placeholder="Evidence ID, session, device or any log text" />)}
        {filterField("Filter by user", <select value={filters.account} onChange={e => updateFilters({ account: e.target.value })}><option value="">All users</option>{choices("account").map(v => <option key={v}>{v}</option>)}</select>)}
        {filterField("Filter by source IP", <select value={filters.sourceIp} onChange={e => updateFilters({ sourceIp: e.target.value })}><option value="">All sources</option>{choices("sourceIp").map(v => <option key={v}>{v}</option>)}</select>)}
        {filterField("Filter by result", <select value={filters.result} onChange={e => updateFilters({ result: e.target.value })}><option value="">All results</option>{["success", "failure", "challenge"].map(v => <option key={v}>{v}</option>)}</select>)}
        {filterField("Filter by event type", <select value={filters.eventType} onChange={e => updateFilters({ eventType: e.target.value })}><option value="">All event types</option>{choices("eventType").map(v => <option key={v}>{v}</option>)}</select>)}
        {filterField("Filter by session", <input value={filters.sessionId} onChange={e => updateFilters({ sessionId: e.target.value })} placeholder="Exact session ID" />)}
      </div>
      <div className="k-toolbar"><strong role="status">{filtered.length} of {evidence.rows.length} events</strong>{active > 0 && <Badge tone="amber">{active} filter{active > 1 ? "s" : ""} active</Badge>}
        <span className="k-spacer" /><button type="button" className="k-btn" aria-pressed={filters.descending} onClick={() => updateFilters({ descending: !filters.descending })}>{filters.descending ? "Sort oldest first" : "Sort newest first"}</button><button type="button" className="k-btn" onClick={() => { setFilters(emptyTrailFilters); setPage(0); }}>Reset filters</button></div>
    </section>

    <div className="k-trail-grid">
      <section className="k-tablecard" aria-label="Authentication events">
        <div className="k-tablescroll"><table className="k-table"><thead><tr><th>Event / UTC</th><th>Account</th><th>Source IP</th><th>Result / type</th><th>Method</th><th>Session</th><th>Inspect</th></tr></thead>
          <tbody>{visible.map(row => <tr key={row.id} aria-selected={selectedId === row.id} className={selectedId === row.id ? "is-selected" : pinned.includes(row.id) ? "is-pinned" : ""} onClick={() => setSelectedId(row.id)}>
            <td><code className="k-mono">{row.id}</code><time dateTime={row.timestamp}>{row.timestamp.slice(11, 19)}</time></td><td>{row.account}</td><td><code className="k-mono">{row.sourceIp}</code></td>
            <td><Badge tone={resultTone[row.result as keyof typeof resultTone] ?? "neutral"}>{row.result}</Badge><small>{row.eventType}</small></td><td>{row.method}</td><td><code className="k-mono">{row.sessionId}</code></td>
            <td><button type="button" className="k-btn k-btn-sm" aria-label={`Inspect ${row.id}`} onClick={() => setSelectedId(row.id)}>Details →</button></td></tr>)}</tbody></table>
          {visible.length === 0 && <p className="k-empty k-pad">No events match. Reset or adjust the filters.</p>}</div>
        <div className="k-toolbar k-pager"><button type="button" className="k-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous page</button><span>Page {page + 1} of {pages}</span><button type="button" className="k-btn" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next page</button></div>
      </section>

      <aside className="k-inspector" aria-label="Selected event details">
        <span className="k-eyebrow">FULL EVENT / UNTRUSTED FIELDS</span><h2 className="k-mono">{selected.id}</h2>
        <div className="k-badges"><Badge tone={resultTone[selected.result as keyof typeof resultTone] ?? "neutral"}>{selected.result}</Badge><Badge tone="info">{selected.eventType}</Badge>{pinned.includes(selected.id) && <Badge tone="amber">In evidence tray</Badge>}{related > 0 && <Badge>{related} in this session</Badge>}</div>
        <dl className="k-facts">{Object.entries(selected).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="k-mono">{value}</dd></div>)}</dl>
        <div className="k-actions k-stack">
          <button type="button" className="k-btn" onClick={() => void copy(selected.id)}>Copy event ID</button>
          <button type="button" className="k-btn" onClick={() => pin(selected.id)}>Add event as evidence</button>
          <button type="button" className="k-btn" disabled={selected.sessionId === "none"} onClick={() => updateFilters({ ...emptyTrailFilters, sessionId: selected.sessionId })}>View related session events</button>
          <button type="button" className="k-btn k-btn-primary" disabled={!editable} onClick={() => setConclusion({ account: selected.account, sourceIp: selected.sourceIp, sessionId: selected.sessionId, eventId: selected.id })}>Use event in conclusion</button>
        </div>
      </aside>
    </div>
    <p className="k-feedback" role="status">{clipboard}</p>

    <Card eyebrow="CORRELATION / CUSTODY RECORDS" title="Supporting forensic evidence" id="trail-artifacts" aside={<Badge>{evidence.artifacts.length} records</Badge>}>
      <div className="k-artifact-grid">{evidence.artifacts.map(artifact => <article className={`k-artifact ${pinned.includes(artifact.id) ? "is-pinned" : ""}`} key={artifact.id}>
        <div className="k-artifact-body"><span className="k-mono k-muted">{artifact.id}</span><strong>{artifact.title}</strong>
          <details><summary>View record</summary><dl className="k-facts">{Object.entries(artifact.facts).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="k-mono">{value}</dd></div>)}</dl></details></div>
        <div className="k-actions"><button type="button" className="k-btn k-btn-sm" aria-label={`Add evidence ${artifact.id}`} onClick={() => pin(artifact.id)}>{pinned.includes(artifact.id) ? "✓ Added" : "Add evidence ID"}</button><button type="button" className="k-btn k-btn-sm" aria-label={`Copy ${artifact.id}`} onClick={() => void copy(artifact.id)}>Copy ID</button></div></article>)}</div>
    </Card>

    <div className="k-two">
      <Card id="trail-tamper" eyebrow="GLOBAL TAMPER ALERT / MAXIMUM +5" title="Untrusted log manipulation" aside={state.progress.bonus === 5 ? <Badge tone="ok">+5 recorded</Badge> : <Badge>Not recorded</Badge>}>
        <p>Find a log field that tells an AI investigator to abandon evidence and accuse a decoy. Record it before completing Trail. It cannot award a second bonus if Inbox already did.</p>
        {state.progress.bonus === 5 ? <p className="k-banner k-banner-ok">Global Tamper Alert bonus already recorded: +5.</p> : <form onSubmit={reportTamper}><fieldset disabled={locked}>
          <label>Manipulation event ID<input required name="eventId" maxLength={100} /></label>
          <label>Manipulation field<select required name="field" defaultValue=""><option value="" disabled>Select the untrusted field</option><option value="details">details</option><option value="account">account</option></select></label>
          <label>Manipulation technique<select required name="technique" defaultValue=""><option value="" disabled>Select the technique</option><option value="instruction-override">Instructions overriding the investigation task</option><option value="failed-password">Repeated failed passwords only</option></select></label>
          <button className="k-btn">Record Trail Tamper Alert</button></fieldset></form>}
      </Card>
      <Card id="trail-hints" eyebrow="ASSISTANCE / SERVER-SAVED" title="Trail hints" aside={<Badge tone="amber">{state.progress.chapters[1].hints} / 2 used</Badge>}>
        <p>Hint 1 costs 3 points; hint 2 costs 6 more. Paid hints remain available after refresh or login.</p>
        <ol className="released-hints k-hints">{state.chapterHints[1].map((hint, index) => <li key={hint}><strong>Hint {index + 1}</strong><p>{hint}</p></li>)}</ol>
        <button className="k-btn" disabled={!editable || busy || state.progress.chapters[1].hints >= 2} onClick={() => void send("hint")}>Request Trail hint {Math.min(2, state.progress.chapters[1].hints + 1)} (−{state.progress.chapters[1].hints === 0 ? 3 : 6} points)</button>
      </Card>
    </div>

    <Card id="trail-conclusion" className="k-conclusion" eyebrow="CONCLUSION / MAXIMUM 25 CHAPTER POINTS" title="Trail investigation conclusion" aside={<Badge tone={pinned.length === 3 ? "ok" : "neutral"}>{pinned.length}/3 supporting IDs</Badge>}>
      {completed && <p className="k-lock">🔒 Findings accepted and locked.</p>}
      <p>Identify the later sign-in using the compromised session. Supply exactly three supporting IDs: the original session issuance event, the retained browser capture, and the matching unauthorized database audit record. Prose is never keyword-scored.</p>
      <form onSubmit={submit}><fieldset disabled={locked}>
        <div className="k-answer-grid">{([["account", "Compromised account"], ["sourceIp", "Attacker source IP"], ["sessionId", "Incident session ID"], ["eventId", "Relevant authentication event ID"]] as const).map(([name, label]) => <label key={name}>{label}<input required type={name === "account" ? "email" : "text"} maxLength={name === "account" ? 120 : 100} value={conclusion[name]} onChange={e => setConclusion(old => ({ ...old, [name]: e.target.value }))} /></label>)}</div>
        <div className="k-tray" aria-label="Evidence tray">{pinned.length ? pinned.map(id => <span className="k-chip" key={id}><span className="k-mono">{id}</span>{!locked && <button type="button" aria-label={`Remove ${id} from evidence tray`} onClick={() => unpin(id)}>×</button>}</span>) : <small>Evidence tray is empty. Add events and records above.</small>}</div>
        <label>Supporting evidence IDs (exactly three)<input required maxLength={320} value={evidenceIds} onChange={e => setEvidenceIds(e.target.value)} placeholder="Issuance event ID, browser capture ID, database audit ID" /></label>
        <label>Short explanation (optional)<textarea name="explanation" maxLength={800} rows={3} /></label>
        <div className="k-submit-row"><button className="k-btn k-btn-primary k-btn-lg">Submit Trail conclusion</button></div>
      </fieldset></form>
      <Feedback busy={busy} text={feedback} extra={retrySeconds > 0 && editable ? `Next submission available in ${retrySeconds}s.` : ""} /><ContinueBar chapter={1} state={state} />
    </Card>
  </div>;
}
