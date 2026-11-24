"use client";
import { useState } from "react";
import { CaseBoard } from "./case-board";
import { useChapter, type ChapterState } from "./use-chapter";
import { useDrafts, type ServerDraft } from "./use-drafts";
import { CaseClosed } from "./case-closed";
import { ChainDiagram, ConnectionBanner, DeskFrame, HintBox, ResultStrip, StateBanner, TaskPanel, fieldApi, isEditable, taskOf } from "./workspace";
import { Badge } from "@/components/ui/kit";
import { CategoryBar } from "./case-visuals";
import { useHref } from "@/components/demo/demo-context";
import { OsDesktop, ToolWindow, useOs } from "@/components/os/os-windows";
import { FileText, FolderSearch } from "lucide-react";
import { verdictRoles, type VerdictEvidence, type VerdictRole } from "@/types/verdict";

const ROLE_LABEL: Record<VerdictRole, string> = { entry: "Entry", session: "Session abuse", impact: "Data impact", assistance: "Insider help", response: "Response" };
const TASKS = [
  { id: "verdict.entry", short: "Entry" }, { id: "verdict.session", short: "Session & impact" }, { id: "verdict.insider", short: "Insider" },
  { id: "verdict.evidence", short: "Evidence map" }, { id: "verdict.reasoning", short: "Verdict" },
] as const;
const ROLE_KEYS = verdictRoles as readonly string[];

function VerdictWorkspace({ evidence, initialState, initialDrafts, team }: { evidence: VerdictEvidence; initialState: ChapterState; initialDrafts: ServerDraft[]; team: { id: string; name: string } }) {
  const { state, busy, feedback, result, connection, send, submitTask, remaining, retrySeconds } = useChapter(4, initialState);
  const editable = isEditable(state, 4), href = useHref(), os = useOs();
  const drafts = useDrafts(4, initialDrafts, editable), f = fieldApi(drafts);
  const [active, setActive] = useState<(typeof TASKS)[number]["id"]>("verdict.entry");
  const [search, setSearch] = useState(""), [chapter, setChapter] = useState("");
  const closed = state.progress.completedAt !== null;
  const role = (id: string) => ROLE_KEYS.find(r => f.arr("verdict.evidence", r).includes(id)) as VerdictRole | undefined;
  const mapped = Object.fromEntries(verdictRoles.map(r => [r, f.arr("verdict.evidence", r)])) as Record<VerdictRole, string[]>;
  const pinnedIds = verdictRoles.flatMap(r => mapped[r]);
  const records = evidence.records.filter(item => (!chapter || item.chapter === chapter) && (!search.trim() || JSON.stringify(item).toLowerCase().includes(search.trim().toLowerCase())));
  const capture = evidence.captures.find(item => item.id === f.str("verdict.entry", "captureId"));
  const rejectedEvidence = f.arr("verdict.reasoning", "evidenceIds");

  function assign(id: string, next: VerdictRole | "") {
    drafts.update("verdict.evidence", Object.fromEntries(verdictRoles.map(r => [r, mapped[r].filter(x => x !== id).concat(r === next ? [id] : [])])));
    if (next === "" && rejectedEvidence.includes(id)) f.set("verdict.reasoning", "evidenceIds", rejectedEvidence.filter(x => x !== id));
  }
  async function submit(task: (typeof TASKS)[number]["id"]) {
    await drafts.flush();
    const s = (t: string, k: string) => f.str(t, k).trim();
    const answer = task === "verdict.entry" ? { emailId: s(task, "emailId"), captureId: s(task, "captureId"), campaign: capture?.campaign ?? s(task, "campaign") }
      : task === "verdict.session" ? { victimAccount: s(task, "victimAccount"), sessionId: s(task, "sessionId"), exportId: s(task, "exportId") }
      : task === "verdict.insider" ? { insiderId: s(task, "insiderId"), policyId: s(task, "policyId") }
      : task === "verdict.evidence" ? { evidenceMap: mapped }
      : { hypothesisId: s(task, "hypothesisId"), attackerAttribution: s(task, "attackerAttribution"), responseStatus: s(task, "responseStatus"), rejected: { hypothesisId: s(task, "rejectedHypothesis"), contradiction: s(task, "contradiction"), evidenceIds: rejectedEvidence } };
    await submitTask(task, answer);
  }
  const sel = (task: string, key: string, label: string, options: { value: string; text: string }[], onPick?: (v: string) => void) =>
    <label>{label}<select disabled={!editable} value={f.str(task, key)} onChange={e => { f.set(task, key, e.target.value); onPick?.(e.target.value); }}><option value="">Select…</option>{options.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}</select></label>;
  const hyp = evidence.hypotheses.map(o => ({ value: o.id, text: `${o.id} · ${o.title}` }));
  const filled = (id: string) => ({ "verdict.entry": ["emailId", "captureId"].every(k => f.str(id, k)), "verdict.session": ["victimAccount", "sessionId", "exportId"].every(k => f.str(id, k)), "verdict.insider": ["insiderId", "policyId"].every(k => f.str(id, k)), "verdict.evidence": verdictRoles.every(r => mapped[r].length > 0), "verdict.reasoning": ["hypothesisId", "rejectedHypothesis", "contradiction", "attackerAttribution", "responseStatus"].every(k => f.str(id, k)) && rejectedEvidence.length === 2 }[id] ?? false);
  const panel = (id: (typeof TASKS)[number]["id"], ready: boolean, why: string, body: React.ReactNode, step: number) =>
    <TaskPanel step={step} task={taskOf(state, 4, id)} editable={editable} busy={busy} retrySeconds={retrySeconds} result={result} ready={ready} why={why} onSubmit={() => void submit(id)}>{body}</TaskPanel>;

  return <DeskFrame chapter={4} title="Final Verdict" caseId={evidence.caseId} state={state} remaining={remaining} drafts={drafts} result={result} connection={connection} objective="One causal chain, independent sources, one rejected alternative." banner={<><StateBanner state={state} chapter={4} /><ConnectionBanner text={connection} next="/play/verdict" /></>}>
    {closed && <CaseClosed teamId={team.id} teamName={team.name} progress={state.progress} />}


    <ToolWindow id="casefile" title="Case file" icon={FileText} side="right" size={{ w: 460, h: 460 }}>
      <div>{evidence.summary.map(text => <p key={text}>{text}</p>)}
      <div className="pg-actions">{["inbox", "trail", "insider", "containment"].map((c, i) => state.unlocked[i] ? <a key={c} className="k-btn k-btn-sm" href={href(`/play/${c}`)}>Review {c}</a> : null)}</div></div>
    </ToolWindow>
    <ToolWindow id="board" title="Evidence board" icon={FolderSearch} size={{ w: 900, h: 600 }}>
    <div className="pg-fields"><label>Search records<input value={search} onChange={e => setSearch(e.target.value)} /></label><label>Chapter<select value={chapter} onChange={e => setChapter(e.target.value)}><option value="">All</option>{["Inbox", "Trail", "Insider", "Containment"].map(v => <option key={v}>{v}</option>)}</select></label></div>
    <div className="pg-recgrid">{records.map(item => <article key={item.id} className={`pg-rec ${role(item.id) ? "is-linked" : ""}`}><span className="k-mono k-muted">{item.chapter} / {item.id}</span><h4>{item.title}</h4>
      <details><summary>Inspect {item.id}</summary><p className="k-meta">Source: {item.source}</p><dl className="k-facts">{Object.entries(item.facts).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="k-mono">{v}</dd></div>)}</dl></details>
      <label>Role<select aria-label={`Evidence role for ${item.id}`} disabled={!editable} value={role(item.id) ?? ""} onChange={e => assign(item.id, e.target.value as VerdictRole | "")}><option value="">Not linked</option>{verdictRoles.map(r => <option value={r} key={r}>{ROLE_LABEL[r]}</option>)}</select></label></article>)}</div>
    </ToolWindow>

    {!closed && <ChainDiagram label="Case reconstruction so far" nodes={[
      { id: "lure", label: "Lure", value: f.str("verdict.entry", "emailId") }, { id: "cap", label: "Capture", value: f.str("verdict.entry", "captureId") }, { id: "ses", label: "Session", value: f.str("verdict.session", "sessionId") },
      { id: "exp", label: "Export", value: f.str("verdict.session", "exportId") }, { id: "ins", label: "Insider", value: f.str("verdict.insider", "insiderId") },
      { id: "ev", label: "Evidence roles", value: verdictRoles.some(r => mapped[r].length) ? `${verdictRoles.filter(r => mapped[r].length).length}/5` : "" }, { id: "hyp", label: "Best hypothesis", value: f.str("verdict.reasoning", "hypothesisId") }]}/>}
    <CategoryBar label="Evidence you linked, by chapter" cats={["Inbox", "Trail", "Insider", "Containment"].map(name => ({ name, used: pinnedIds.filter(id => evidence.records.find(r => r.id === id)?.chapter === name).length, total: evidence.records.filter(r => r.chapter === name).length }))} />
    <CaseBoard lure={f.str("verdict.entry", "emailId")} capture={f.str("verdict.entry", "captureId")} session={f.str("verdict.session", "sessionId")} exportId={f.str("verdict.session", "exportId")} insider={f.str("verdict.insider", "insiderId")} linked={`${pinnedIds.length} rec`.replace("0 rec", "")} hypothesis={f.str("verdict.reasoning", "hypothesisId")} onPick={step => setActive(step as (typeof TASKS)[number]["id"])} />
    <nav className="pg-causal" aria-label="Causal chain: choose a step">
      <ol>{TASKS.map((t, i) => { const row = taskOf(state, 4, t.id), done = row.earned >= row.max;
        return <li key={t.id}><button type="button" aria-pressed={active === t.id} className={`${done ? "is-done" : row.earned > 0 ? "is-partial" : filled(t.id) ? "is-filled" : ""}`} onClick={() => setActive(t.id)}>
          <span className="pg-causal-n" aria-hidden="true">{done ? "✓" : i + 1}</span><strong>{t.short}</strong><small>{row.earned}/{row.max} pts{filled(t.id) && !done ? " · filled" : ""}</small></button>{i < TASKS.length - 1 && <span className="pg-chain-link" aria-hidden="true">→</span>}</li>; })}</ol>
    </nav>

    <div className="pg-verdict-grid">
      <div className="pg-tasks" aria-label="Active step">
        {active === "verdict.entry" && panel("verdict.entry", !!(f.str("verdict.entry", "emailId") && f.str("verdict.entry", "captureId")), "Choose the lure email and the retained capture.", <div className="pg-fields">
          {sel("verdict.entry", "emailId", "Initial compromise email", evidence.emails.map(i => ({ value: i.id, text: `${i.id} · ${i.subject}` })))}
          {sel("verdict.entry", "captureId", "Captured redirect", evidence.captures.map(i => ({ value: i.id, text: `${i.id} · ${i.campaign}` })), v => f.set("verdict.entry", "campaign", evidence.captures.find(c => c.id === v)?.campaign ?? ""))}
          {capture && <p className="pg-hint-line k-mono">Campaign {capture.campaign} · {capture.url} (inert text)</p>}</div>, 1)}
        {active === "verdict.session" && panel("verdict.session", !!(f.str("verdict.session", "victimAccount") && f.str("verdict.session", "sessionId") && f.str("verdict.session", "exportId")), "Choose the victim account, replayed session and export.", <div className="pg-fields">
          {sel("verdict.session", "victimAccount", "Victim account", evidence.accounts.map(v => ({ value: v, text: v })))}
          {sel("verdict.session", "sessionId", "Replayed session", evidence.sessions.map(v => ({ value: v, text: v })))}
          {sel("verdict.session", "exportId", "Unauthorized export", evidence.exports.map(i => ({ value: i.id, text: `${i.id} · ${i.description}` })))}</div>, 2)}
        {active === "verdict.insider" && panel("verdict.insider", !!(f.str("verdict.insider", "insiderId") && f.str("verdict.insider", "policyId")), "Choose the evidenced employee and policy command.", <div className="pg-fields">
          {sel("verdict.insider", "insiderId", "Internal accomplice", evidence.suspects.map(i => ({ value: i.id, text: `${i.id} · ${i.name} · ${i.role}` })))}
          {sel("verdict.insider", "policyId", "Policy modification", evidence.policies.map(i => ({ value: i.id, text: `${i.id} · ${i.description}` })))}</div>, 3)}

        {active === "verdict.evidence" && panel("verdict.evidence", filled("verdict.evidence"), "Give every role at least one record.", <>
          <div className="pg-rolemap" role="group" aria-label="Evidence map">{verdictRoles.map(r => <div key={r} className={mapped[r].length ? "is-set" : ""}><b>{ROLE_LABEL[r]}</b><span>{mapped[r].length ? mapped[r].map(id => <code key={id} className="k-mono">{id}</code>) : <em>none yet</em>}</span></div>)}</div>
          <p role="status" className="pg-live">{records.length} records · {pinnedIds.length} linked</p>
          <button type="button" className="k-btn k-btn-primary" onClick={() => os.open("board")}>Open evidence board</button></>, 4)}

        {active === "verdict.reasoning" && panel("verdict.reasoning", filled("verdict.reasoning"), "Pick a best hypothesis, one to reject, the contradiction and two counter-records.", <>
          <div className="pg-hyps">{evidence.hypotheses.map(h => { const best = f.str("verdict.reasoning", "hypothesisId") === h.id, rej = f.str("verdict.reasoning", "rejectedHypothesis") === h.id;
            return <article key={h.id} className={best ? "is-best" : rej ? "is-rejected" : ""}><span className="k-mono k-muted">{h.id}</span>{best && <Badge tone="ok">✓ Best supported</Badge>}{rej && <Badge tone="alert">✕ Rejected</Badge>}<h4>{h.title}</h4><details><summary>Details</summary><p>{h.explanation}</p></details></article>; })}</div>
          <div className="pg-fields">
            {sel("verdict.reasoning", "hypothesisId", "Best-supported", hyp)}{sel("verdict.reasoning", "rejectedHypothesis", "Reject", hyp)}
            {sel("verdict.reasoning", "contradiction", "Contradiction", [{ value: "device-and-policy", text: "Changed-device session + signed policy change" }, { value: "outside-approved-scope", text: "Export outside the maintenance approval" }])}
            {sel("verdict.reasoning", "attackerAttribution", "Attacker attribution", [{ value: "alias-only", text: "GHOST_404 is an alias; identity/location unproven" }, { value: "real-identity-proven", text: "Real identity established" }, { value: "location-proven", text: "Location established from IP" }])}
            {sel("verdict.reasoning", "responseStatus", "Response status", [{ value: "plan-prepared", text: "Plan prepared; execution not verified" }, { value: "recovery-executed", text: "Recovery executed and verified" }])}</div>
          <fieldset disabled={!editable}><legend>Two linked records that contradict the rejected hypothesis ({rejectedEvidence.length}/2)</legend>
            {pinnedIds.length === 0 ? <p className="k-empty">Link records in the Evidence map step first.</p> : <div className="k-choices">{pinnedIds.map(id => <label key={id} className={`k-choice k-choice-sm ${rejectedEvidence.includes(id) ? "is-picked" : ""}`}><input type="checkbox" aria-label={`Counter-evidence ${id}`} checked={rejectedEvidence.includes(id)} onChange={() => f.toggle("verdict.reasoning", "evidenceIds", id, 2)} /><span><strong className="k-mono">{id}</strong><small>{evidence.records.find(r => r.id === id)?.title}</small></span></label>)}</div>}</fieldset></>, 5)}
        <ResultStrip result={result} /><p role="status" className="pg-live">{feedback}</p>
      </div>

      <aside className="pg-preview" aria-label="Final report preview">
        <h2 className="pg-rail-h">Report preview</h2>
        <dl>
          <div><dt>Lure</dt><dd className="k-mono">{f.str("verdict.entry", "emailId") || "—"}</dd></div>
          <div><dt>Capture</dt><dd className="k-mono">{f.str("verdict.entry", "captureId") || "—"}</dd></div>
          <div><dt>Session</dt><dd className="k-mono">{f.str("verdict.session", "sessionId") || "—"}</dd></div>
          <div><dt>Export</dt><dd className="k-mono">{f.str("verdict.session", "exportId") || "—"}</dd></div>
          <div><dt>Insider</dt><dd className="k-mono">{f.str("verdict.insider", "insiderId") || "—"}</dd></div>
          <div><dt>Evidence linked</dt><dd>{pinnedIds.length} records · {verdictRoles.filter(r => mapped[r].length).length}/5 roles</dd></div>
          <div><dt>Best hypothesis</dt><dd className="k-mono">{f.str("verdict.reasoning", "hypothesisId") || "—"}</dd></div>
        </dl>
        <small>Preview shows your drafts. Only submitted tasks score.</small>
      </aside>
    </div>

    <div className="pg-aux">
      <HintBox chapter={4} state={state} editable={editable} busy={busy} onHint={() => void send("hint")} />
      <details className="pg-hints"><summary>Notes <span className="pg-chip">private to your team</span></summary><label>Scratchpad<textarea rows={4} maxLength={900} disabled={!editable} value={f.str("notes", "text")} onChange={e => f.set("notes", "text", e.target.value)} /></label></details>
    </div>
  </DeskFrame>;
}

export function VerdictDesk(props: Parameters<typeof VerdictWorkspace>[0]) { return <OsDesktop scope="verdict"><VerdictWorkspace {...props} /></OsDesktop>; }
