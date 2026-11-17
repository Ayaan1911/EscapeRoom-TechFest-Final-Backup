"use client";
import { useState, type FormEvent } from "react";
import { useChapter, type ChapterState } from "./use-chapter";
import { CaseClosed } from "./case-closed";
import { Badge, Card, Feedback, MissionBar } from "@/components/ui/kit";
import { verdictRoles, type VerdictEvidence, type VerdictRole } from "@/types/verdict";

const labels: Record<VerdictRole, string> = { entry: "Entry point", session: "Authentication / session abuse", impact: "Data impact", assistance: "Insider assistance", response: "Containment rationale" };
const CHAIN = ["emailId", "victimAccount", "captureId", "sessionId", "exportId", "insiderId", "policyId"] as const;
type Chain = Record<(typeof CHAIN)[number], string>;
const EMPTY_CHAIN = Object.fromEntries(CHAIN.map(k => [k, ""])) as Chain;
const NEED = 12;

export function VerdictDesk({ evidence, initialState, team }: { evidence: VerdictEvidence; initialState: ChapterState; team: { id: string; name: string } }) {
  const { state, busy, feedback, connection, send, remaining, retrySeconds } = useChapter(4, initialState);
  const [assignments, setAssignments] = useState<Record<string, VerdictRole | "">>({});
  const [counterEvidence, setCounterEvidence] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [chapter, setChapter] = useState("");
  const [chain, setChain] = useState<Chain>(EMPTY_CHAIN);
  const [judgement, setJudgement] = useState({ hypothesisId: "", rejectedHypothesis: "", contradiction: "", attackerAttribution: "", responseStatus: "" });
  const [chronological, setChronological] = useState(false);
  const completed = state.current === -1 && state.progress.completedAt !== null;
  const editable = state.status === "active" && state.current === 4 && !completed;
  const disabled = !editable || busy;
  const capture = evidence.captures.find(item => item.id === chain.captureId);
  const pinned = evidence.records.filter(item => assignments[item.id]);
  const records = evidence.records.filter(item => (!chapter || item.chapter === chapter) && (!search.trim() || JSON.stringify(item).toLowerCase().includes(search.trim().toLowerCase())));
  const timeline = chronological ? [...evidence.timeline].sort((a, b) => a.timestamp.localeCompare(b.timestamp)) : evidence.timeline;
  const chainDone = CHAIN.filter(k => chain[k]).length, judged = Object.values(judgement).filter(Boolean).length;
  const checks = [
    { label: "Causal chain", detail: `${chainDone} of ${CHAIN.length} links chosen`, done: chainDone === CHAIN.length },
    { label: "Hypotheses weighed", detail: `${judged} of 5 judgements made`, done: judged === 5 },
    { label: "Evidence linked", detail: `${pinned.length} of ${NEED} distinct records`, done: pinned.length >= NEED },
    { label: "Counter-evidence", detail: `${counterEvidence.length} of 2 selected`, done: counterEvidence.length === 2 },
  ];
  const setChainKey = (key: keyof Chain) => (value: string) => setChain(old => ({ ...old, [key]: value }));
  const setJ = (key: keyof typeof judgement) => (value: string) => setJudgement(old => ({ ...old, [key]: value }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const evidenceMap = Object.fromEntries(verdictRoles.map(role => [role, Object.entries(assignments).filter(([, value]) => value === role).map(([id]) => id)]));
    void send("submit", { kind: "verdict", chain: { emailId: chain.emailId, victimAccount: chain.victimAccount, sessionId: chain.sessionId, exportId: chain.exportId, insiderId: chain.insiderId, policyId: chain.policyId, captureId: chain.captureId, campaign: capture?.campaign ?? "" }, evidenceMap, hypothesisId: judgement.hypothesisId, rejected: { hypothesisId: judgement.rejectedHypothesis, contradiction: judgement.contradiction, evidenceIds: counterEvidence }, attackerAttribution: judgement.attackerAttribution, responseStatus: judgement.responseStatus, explanation: data.get("explanation") });
  }
  const node = (n: number, label: string, value: string, set: (v: string) => void, placeholder: string, options: { value: string; text: string }[], name?: string) =>
    <div className="k-node" data-step={n}><label>{label}<select name={name} required value={value} onChange={e => set(e.target.value)}><option value="" disabled>{placeholder}</option>{options.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}</select></label></div>;
  const hypothesisOptions = evidence.hypotheses.map(item => ({ value: item.id, text: `${item.id} · ${item.title}` }));

  return <div className="k-desk">
    <MissionBar chapter={4} title="Final Verdict" caseId={evidence.caseId} state={state} remaining={remaining} objective="One case. Independent sources. Build a defensible conclusion from at least twelve linked records." />
    {completed && <CaseClosed teamId={team.id} teamName={team.name} progress={state.progress} />}
    {!editable && !completed && <p className="k-banner k-banner-warn" role="status">The round is {state.status}. Permitted case evidence remains readable; new verdicts and hints are unavailable.</p>}
    {connection && <p className="k-banner k-banner-warn" role="alert">{connection} <a href="/login?next=/play/verdict">Sign in</a></p>}

    <Card id="review" className="verdict-summary" eyebrow="CASE FILE" title="Incident review file" aside={<div className="k-actions"><a className="k-btn k-btn-sm" href="/play/inbox">Review Inbox</a><a className="k-btn k-btn-sm" href="/play/trail">Review Trail</a><a className="k-btn k-btn-sm" href="/play/insider">Review Insider</a><a className="k-btn k-btn-sm" href="/play/containment">Review Containment</a></div>}>
      {evidence.summary.map(text => <p key={text}>{text}</p>)}
    </Card>

    <div className="k-contain-grid">
      <div className="k-plan">
        <Card id="board" className="" eyebrow="TIMELINE" title="Incident summary board" aside={<button type="button" className="k-btn k-btn-sm" onClick={() => setChronological(value => !value)}>{chronological ? "Show retained card arrangement" : "Compare source timestamps"}</button>}>
          <div className="verdict-timeline k-vtl">{timeline.map(item => <article key={item.id}><span className="k-mono k-muted">{item.id}</span><h3>{item.title}</h3><time dateTime={item.timestamp} className="k-mono">{item.timestamp} UTC</time><p>Sources: {item.sourceIds.join(", ")}</p></article>)}</div>
        </Card>

        <form onSubmit={submit} className="k-plan">
          <Card id="chain" eyebrow="STEP 1" title="Causal chain and responsibilities" aside={<Badge tone={chainDone === CHAIN.length ? "ok" : "neutral"}>{chainDone}/{CHAIN.length} links</Badge>}>
            <p>Link the initial lure, captured campaign, exact session, unauthorized impact and separately evidenced accomplice. Select source facts; do not infer intent from a victim account or geography from an IP.</p>
            <fieldset disabled={disabled}><div className="k-chain">
              {node(1, "Initial compromise email", chain.emailId, setChainKey("emailId"), "Select recovered message", evidence.emails.map(i => ({ value: i.id, text: `${i.id} · ${i.subject}` })), "emailId")}
              {node(2, "Victim account", chain.victimAccount, setChainKey("victimAccount"), "Select affected account", evidence.accounts.map(v => ({ value: v, text: v })), "victimAccount")}
              {node(3, "Captured redirect evidence", chain.captureId, setChainKey("captureId"), "Select retained capture", evidence.captures.map(i => ({ value: i.id, text: `${i.id} · ${i.campaign}` })))}
              {node(4, "Replayed incident session", chain.sessionId, setChainKey("sessionId"), "Select exact session", evidence.sessions.map(v => ({ value: v, text: v })), "sessionId")}
              {node(5, "Unauthorized export evidence", chain.exportId, setChainKey("exportId"), "Select database audit", evidence.exports.map(i => ({ value: i.id, text: `${i.id} · ${i.description}` })), "exportId")}
              {node(6, "Internal accomplice", chain.insiderId, setChainKey("insiderId"), "Select evidenced employee", evidence.suspects.map(i => ({ value: i.id, text: `${i.id} · ${i.name} · ${i.role}` })), "insiderId")}
              {node(7, "Unauthorized policy modification", chain.policyId, setChainKey("policyId"), "Select signed policy command", evidence.policies.map(i => ({ value: i.id, text: `${i.id} · ${i.description}` })), "policyId")}
            </div></fieldset>
            {capture && <p className="k-banner k-banner-warn">Selected capture: {capture.id} · Campaign {capture.campaign}<br />Retained redirect: {capture.url} (inert evidence text)</p>}
          </Card>

          <Card id="hypotheses" eyebrow="STEP 2" title="Competing incident explanations" aside={<Badge tone={judged === 5 ? "ok" : "neutral"}>{judged}/5 judgements</Badge>}>
            <div className="k-hyp-grid verdict-hypotheses">{evidence.hypotheses.map(item => <article key={item.id} className={`k-hyp ${judgement.hypothesisId === item.id ? "is-best" : judgement.rejectedHypothesis === item.id ? "is-rejected" : ""}`}><header><span className="k-mono k-muted">{item.id}</span>{judgement.hypothesisId === item.id && <Badge tone="ok">Best supported</Badge>}{judgement.rejectedHypothesis === item.id && <Badge tone="alert">Rejected</Badge>}</header><h3>{item.title}</h3><p>{item.explanation}</p></article>)}</div>
            <fieldset disabled={disabled}><div className="k-answer-grid">
              <label>Best-supported hypothesis<select name="hypothesisId" required value={judgement.hypothesisId} onChange={e => setJ("hypothesisId")(e.target.value)}><option value="" disabled>Select supported interpretation</option>{hypothesisOptions.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}</select></label>
              <label>Rejected competing hypothesis<select name="rejectedHypothesis" required value={judgement.rejectedHypothesis} onChange={e => setJ("rejectedHypothesis")(e.target.value)}><option value="" disabled>Select a contradicted alternative</option>{hypothesisOptions.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}</select></label>
              <label>Contradiction established by records<select name="contradiction" required value={judgement.contradiction} onChange={e => setJ("contradiction")(e.target.value)}><option value="" disabled>Select an evidential contradiction</option><option value="device-and-policy">Changed-device validation and signed policy modification contradict the managed-workstation-only account</option><option value="outside-approved-scope">Customer export principal/session/object are outside the maintenance approval scope</option></select></label>
              <label>External attacker attribution<select name="attackerAttribution" required value={judgement.attackerAttribution} onChange={e => setJ("attackerAttribution")(e.target.value)}><option value="" disabled>Assess the supported attribution limit</option><option value="alias-only">GHOST_404 is an external attacker alias; real identity/location unproven</option><option value="real-identity-proven">Real-world identity established</option><option value="location-proven">Real-world location established from the source IP</option></select></label>
              <label>Response conclusion<select name="responseStatus" required value={judgement.responseStatus} onChange={e => setJ("responseStatus")(e.target.value)}><option value="" disabled>Assess what Chapter 4 established</option><option value="plan-prepared">Evidence-backed response plan prepared; execution/recovery not independently established</option><option value="recovery-executed">Containment executed and recovery independently verified</option></select></label>
            </div></fieldset>
          </Card>

          <Card id="matrix" className="verdict-matrix" eyebrow="STEP 3" title="Evidence matrix and notebook" aside={<Badge tone={pinned.length >= NEED ? "ok" : "neutral"}>{pinned.length} / {NEED} records</Badge>}>
            <p>Assign each supporting record to one causal role. Establish entry using mailbox/gateway/capture, session abuse using issuance/validation, impact using the correct database audit, assistance using policy/intent/access/approval/custody, and response using incident authority. A complete mapping needs at least twelve distinct records across all four chapters.</p>
            <div className="k-meter" role="img" aria-label={`${Math.min(pinned.length, NEED)} of ${NEED} required records linked`}><span style={{ width: `${Math.min(100, (pinned.length / NEED) * 100)}%` }} /></div>
            <div className="k-answer-grid"><label>Search review evidence<input value={search} onChange={e => setSearch(e.target.value)} /></label><label>Filter source chapter<select value={chapter} onChange={e => setChapter(e.target.value)}><option value="">All chapters</option>{["Inbox", "Trail", "Insider", "Containment"].map(value => <option key={value}>{value}</option>)}</select></label></div>
            <p role="status" className="k-feedback">{records.length} review records shown · {pinned.length} evidence IDs pinned</p>
            <div className="verdict-records k-vrecords">{records.map(item => <article className={`verdict-record k-vrec ${assignments[item.id] ? "is-linked" : ""}`} key={item.id}><span className="k-mono k-muted">{item.chapter} / {item.id}</span><h3>{item.title}</h3>
              <details><summary>Inspect {item.id}</summary><p className="k-meta">Source: {item.source}</p><dl className="k-facts">{Object.entries(item.facts).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="k-mono">{value}</dd></div>)}</dl></details>
              <label>Evidence role<select aria-label={`Evidence role for ${item.id}`} value={assignments[item.id] ?? ""} disabled={disabled} onChange={e => setAssignments(old => ({ ...old, [item.id]: e.target.value as VerdictRole | "" }))}><option value="">Not linked</option>{verdictRoles.map(role => <option value={role} key={role}>{labels[role]}</option>)}</select></label></article>)}</div>
            <section aria-label="Verdict evidence notebook" className="k-relations"><h3>Pinned evidence relationships</h3>
              {verdictRoles.map(role => { const ids = pinned.filter(item => assignments[item.id] === role).map(item => item.id); return <p key={role}><strong>{labels[role]}:</strong> {ids.join(", ") || "No evidence linked"}</p>; })}
              <fieldset disabled={disabled}><legend>Select exactly two pinned records that contradict the rejected hypothesis</legend><div className="k-choices">{pinned.map(item => <label key={item.id} className={`k-choice k-choice-sm ${counterEvidence.includes(item.id) ? "is-picked" : ""}`}><input type="checkbox" aria-label={`Counter-evidence ${item.id}`} checked={counterEvidence.includes(item.id)} onChange={() => setCounterEvidence(old => old.includes(item.id) ? old.filter(id => id !== item.id) : [...old, item.id])} /><span><strong className="k-mono">{item.id}</strong><small>{item.title}</small></span></label>)}</div></fieldset>
              <p>Counter-evidence selected: {counterEvidence.length} / 2</p></section>
          </Card>

          <Card id="verdict-submit" className="k-conclusion" eyebrow="STEP 4" title="Submit Final Verdict" aside={<Badge tone={checks.every(c => c.done) ? "ok" : "neutral"}>{checks.filter(c => c.done).length}/4 ready</Badge>}>
            {completed && <p className="k-lock">🔒 Verdict accepted and locked.</p>}
            <p>The server validates the structured claims, independent evidence roles and contradiction. Optional notes are ungraded observations, not verified claims or keyword-scored answers. Review source facts before submitting.</p>
            <fieldset disabled={disabled}><label>Review explanation (optional)<textarea name="explanation" rows={4} maxLength={1000} /></label>
              <div className="k-submit-row"><button className="k-btn k-btn-primary k-btn-lg" disabled={retrySeconds > 0 || pinned.length < NEED || counterEvidence.length !== 2}>Submit Final Verdict</button>{!completed && !checks.every(c => c.done) && <small>Complete the checklist to submit.</small>}</div></fieldset>
            <Feedback busy={busy} text={feedback} extra={retrySeconds > 0 && editable ? `Next submission available in ${retrySeconds}s.` : ""} />
          </Card>
        </form>
      </div>

      <aside className="k-contain-rail" aria-label="Case progress and assistance">
        <Card title="Case progress" eyebrow="LIVE CHECKLIST"><ol className="k-checklist">{checks.map(item => <li key={item.label} className={item.done ? "is-done" : ""}><span aria-hidden="true">{item.done ? "✓" : "○"}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}</ol></Card>
        <Card id="verdict-hints" className="verdict-hints" eyebrow="ASSISTANCE" title="Final Verdict hints" aside={<Badge tone="amber">{state.progress.chapters[4].hints} / 2 used</Badge>}>
          <p>Hint 1 costs 3 points; hint 2 costs 6 more. Maximum two. No new bonus is offered; your saved Tamper Alert remains +{state.progress.bonus}.</p>
          <ol className="released-hints k-hints">{state.chapterHints[4].map((hint, i) => <li key={hint}><strong>Hint {i + 1}</strong><p>{hint}</p></li>)}</ol>
          <button type="button" className="k-btn" disabled={disabled || state.progress.chapters[4].hints >= 2} onClick={() => void send("hint")}>Request Final Verdict hint {Math.min(2, state.progress.chapters[4].hints + 1)}</button>
        </Card>
      </aside>
    </div>
  </div>;
}
