"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useChapter, type ChapterState } from "./use-chapter";
import { Badge, Card, Feedback, MissionBar, ContinueBar } from "@/components/ui/kit";
import type { InsiderDossier, InsiderRecord } from "@/types/insider";

const KIND: Record<InsiderRecord["kind"], { label: string; icon: string; tone: "info" | "amber" | "alert" | "ok" | "neutral" }> = {
  message: { label: "Message", icon: "✉", tone: "info" }, access: { label: "Access", icon: "⎆", tone: "neutral" }, policy: { label: "Policy change", icon: "⌘", tone: "alert" },
  approval: { label: "Approval", icon: "✓", tone: "ok" }, timeline: { label: "Timeline", icon: "◷", tone: "amber" }, custody: { label: "Custody", icon: "⚑", tone: "neutral" },
};
const initials = (name: string) => name.split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();

export function InsiderDesk({ initialDossier, initialState }: { initialDossier: InsiderDossier | null; initialState: ChapterState }) {
  const { state, busy, feedback, connection, send, remaining, retrySeconds } = useChapter(2, initialState);
  const [dossier, setDossier] = useState(initialDossier);
  const [loadError, setLoadError] = useState("");
  const [suspect, setSuspect] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [pinned, setPinned] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState("");
  const completed = state.progress.chapters[2].completedAt !== null;
  const editable = state.status === "active" && state.current === 2 && !completed;
  const locked = !editable || busy || retrySeconds > 0;
  useEffect(() => {
    if (!state.insiderUnlocked || dossier) return;
    let alive = true;
    async function load() {
      try {
        const response = await fetch("/api/game/insider", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load the dossier. Your saved unlock is safe; retrying.");
        const data = await response.json();
        if (alive && data.dossier) { setDossier(data.dossier); setLoadError(""); }
      } catch { if (alive) setLoadError("Unable to load the dossier. Your saved unlock is safe; retrying."); }
    }
    void load(); const retry = setInterval(load, 5000);
    return () => { alive = false; clearInterval(retry); };
  }, [state.insiderUnlocked, dossier]);
  async function copy(id: string) {
    try { await navigator.clipboard.writeText(id); setCopyStatus(`Evidence ID copied: ${id}`); }
    catch { setCopyStatus(`Clipboard unavailable. Select and copy the displayed ID: ${id}`); }
  }
  function unlock(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; void send("unlock", Object.fromEntries(new FormData(form))).finally(() => form.reset()); }
  function conclude(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send("submit", { kind: "conclusion", ...Object.fromEntries(new FormData(event.currentTarget)), supportingEvidenceIds: pinned }); }
  const records = dossier?.records.filter(record => (!suspect || record.employees.includes(suspect)) && (!kind || record.kind === kind) && (!search.trim() || JSON.stringify(record).toLowerCase().includes(search.trim().toLowerCase()))) ?? [];
  const record = dossier?.records.find(item => item.id === selected) ?? records[0];
  const person = dossier?.suspects.find(item => item.id === suspect);
  const nameOf = (id: string) => dossier?.suspects.find(s => s.id === id)?.name ?? id;
  const countFor = (id: string) => dossier?.records.filter(r => r.employees.includes(id)).length ?? 0;

  return <div className="k-desk">
    <MissionBar chapter={2} title="Insider" caseId="PHYSICAL + DIGITAL" state={state} remaining={remaining} objective="A stolen session explains access. Prove who deliberately weakened the controls. Suggested budget: 15 minutes." />
    <p className="k-banner k-banner-warn">The external attacker, the compromised employee and an internal accomplice are distinct roles. Access or proximity alone does not prove intent. Use the retained chronology and approvals.</p>
    {completed && <div className="k-banner k-banner-ok" role="status"><div><strong>Chapter 3 completed. Chapter 4 unlocked.</strong><span>Your result is saved. Continue the incident response in Containment.</span></div><a className="k-btn k-btn-primary" href="/play/containment">Open Chapter 4</a></div>}
    {(connection || loadError) && <p className="k-banner k-banner-warn" role="alert">{connection || loadError} <a href="/login?next=/play/insider">Sign in</a></p>}
    <div className="k-actions"><a className="k-btn" href="/play/inbox">Review Inbox</a><a className="k-btn" href="/play/trail">Review Trail</a></div>

    {!state.insiderUnlocked && <Card id="dossier-gate" className="k-gate" eyebrow="EVIDENCE WALL / DOSSIER SEALED" title="Combine your two physical fragments" aside={<Badge tone="amber">🔒 Sealed</Badge>}>
      <p>Fragment A is inside your team&apos;s registration envelope. Find Fragment B under your exact team ID on the Evidence Wall section printed on that slip. Both pieces belong to your team, even when another team has the same narrative variant. Ask a volunteer to reprint a missing piece.</p>
      {!editable && <p className="k-banner k-banner-warn">This round or chapter is closed. Only previously unlocked historical evidence can be reviewed.</p>}
      <form onSubmit={unlock}><fieldset disabled={locked}><div className="k-answer-grid">
        <label>Fragment A<input name="fragmentA" required maxLength={64} autoComplete="off" spellCheck={false} placeholder="From your private envelope" /></label>
        <label>Fragment B<input name="fragmentB" required maxLength={64} autoComplete="off" spellCheck={false} placeholder="From your team’s wall card" /></label></div>
        <div className="k-submit-row"><button className="k-btn k-btn-primary k-btn-lg">Unlock dossier</button></div></fieldset></form>
    </Card>}
    {state.insiderUnlocked && !dossier && <p role="status" className="k-banner k-banner-ok">Unlock saved. Loading the confidential dossier…</p>}

    {dossier && <>
      <Card id="wall" eyebrow={`CONFIDENTIAL DOSSIER / ${dossier.caseId}`} title="The Evidence Wall" aside={<Badge>{dossier.records.length} records</Badge>}>
        <p>Six staff profiles. Journaled messages, badge/MFA receipts, signed policy commands and independently retained approvals. All timestamps UTC; all material fictional and inert.</p>
        <ul className="k-suspects" aria-label="Staff profiles">{dossier.suspects.map(item => <li key={item.id}><button type="button" className="k-suspect" aria-pressed={suspect === item.id} aria-label={`Filter to ${item.name}`} onClick={() => setSuspect(suspect === item.id ? "" : item.id)}>
          <span className="k-avatar" aria-hidden="true">{initials(item.name)}</span><strong>{item.name}</strong><span className="k-muted">{item.role}</span><Badge>{countFor(item.id)} records</Badge></button></li>)}</ul>
        {person && <dl className="k-facts suspect-profile k-profile"><div><dt>id</dt><dd className="k-mono">{person.id}</dd></div>{Object.entries(person).filter(([k]) => k !== "id").map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      </Card>

      <section className="k-console" aria-label="Dossier filters">
        <div className="k-filterbar k-filterbar-3">
          <label className="k-filter">Search dossier<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Any evidence ID, device, approval or phrase" /></label>
          <label className="k-filter">Suspect profile<select value={suspect} onChange={e => setSuspect(e.target.value)}><option value="">All staff</option>{dossier.suspects.map(item => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select></label>
          <label className="k-filter">Record type<select value={kind} onChange={e => setKind(e.target.value)}><option value="">All records</option>{["message", "access", "policy", "approval", "timeline", "custody"].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <div className="k-toolbar"><strong role="status">{records.length} of {dossier.records.length} records</strong><span className="k-spacer" /><button type="button" className="k-btn" onClick={() => { setSearch(""); setKind(""); setSuspect(""); }}>Reset dossier filters</button></div>
      </section>

      <div className="k-insider-grid">
        <section className="k-reclist" aria-label="Dossier records">
          {records.map(item => <button type="button" className={`k-rec k-rec-${item.kind}`} key={item.id} aria-pressed={record?.id === item.id} onClick={() => setSelected(item.id)}>
            <span className="k-rec-icon" aria-hidden="true">{KIND[item.kind].icon}</span>
            <span className="k-rec-main"><span className="k-mono k-muted">{item.id}</span><strong>{item.title}</strong><span className="k-rec-meta"><Badge tone={KIND[item.kind].tone}>{item.kind}</Badge><time dateTime={item.timestamp}>{item.timestamp.slice(11, 19)} UTC</time>{pinned.includes(item.id) && <Badge tone="amber">★ pinned</Badge>}</span></span></button>)}
          {records.length === 0 && <p className="k-empty k-pad">No matching records. Adjust or reset the filters.</p>}
        </section>

        {record && <article className={`k-recview k-rec-${record.kind}`} aria-label="Evidence detail" key={record.id}>
          <header><span className="k-eyebrow">{record.id} / {record.kind.toUpperCase()}</span><h3>{record.title}</h3><p className="k-mono k-muted">{record.timestamp}</p>
            <div className="k-badges">{record.employees.map(id => <button type="button" key={id} className="k-chip-btn" onClick={() => setSuspect(id)} aria-label={`Show records for ${nameOf(id)}`}>{initials(nameOf(id))} · {nameOf(id)}</button>)}</div></header>
          <p className="k-provenance">Provenance: {record.provenance}</p>
          <dl className="k-facts">{Object.entries(record.facts).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={record.kind === "policy" || record.kind === "access" ? "k-mono" : ""}>{value}</dd></div>)}</dl>
          <footer className="k-actions"><button type="button" className="k-btn k-btn-primary" disabled={pinned.includes(record.id)} onClick={() => setPinned(old => old.includes(record.id) ? old : [...old, record.id])}>Pin evidence ID</button><button type="button" className="k-btn" onClick={() => void copy(record.id)}>Copy evidence ID</button></footer>
        </article>}
      </div>

      <Card id="insider-conclusion" className="k-conclusion" eyebrow="FINDINGS / MAXIMUM 25 RAW POINTS" title="Insider conclusion" aside={<Badge tone={pinned.length >= 3 ? "ok" : "neutral"}>{pinned.length} pinned · need 3</Badge>}>
        {completed && <p className="k-lock">🔒 Findings accepted and locked.</p>}
        <p>Identify the employee and the relevant policy change. Pin at least three corroborating records that establish intent, console access/timing and the contradiction with the original approval. Access or a job title alone is insufficient. Prose is not keyword-scored.</p>
        <div className="k-tray" aria-label="Pinned evidence notebook">{pinned.length === 0 ? <small>No evidence pinned yet.</small> : pinned.map(id => <span className="k-chip" key={id}><span className="k-mono">{id}</span><button type="button" aria-label={`Remove pinned ${id}`} onClick={() => setPinned(old => old.filter(value => value !== id))}>×</button></span>)}</div>
        <form onSubmit={conclude}><fieldset disabled={locked}>
          <div className="k-answer-grid">
            <label>Insider employee<select name="employeeId" required defaultValue=""><option value="" disabled>Select a supported suspect</option>{dossier.suspects.map(item => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select></label>
            <label>Unauthorized policy action<select name="actionId" required defaultValue=""><option value="" disabled>Select the relevant policy command</option>{dossier.records.filter(item => item.kind === "policy").map(item => <option value={item.id} key={item.id}>{item.id} · {item.title}</option>)}</select></label></div>
          <label>Short explanation (optional)<textarea name="explanation" rows={3} maxLength={800} /></label>
          <div className="k-submit-row"><button className="k-btn k-btn-primary k-btn-lg" disabled={pinned.length < 3}>Submit Insider conclusion</button>{pinned.length < 3 && !completed && <small>Pin at least three records to submit.</small>}</div>
        </fieldset></form>
      </Card></>}

    <Card id="insider-hints" eyebrow="ASSISTANCE / AVAILABLE BEFORE DOSSIER UNLOCK" title="Insider hints" className="insider-hints" aside={<Badge tone="amber">{state.progress.chapters[2].hints} / 2 used</Badge>}>
      <p>Hint 1 costs 3 points; hint 2 costs 6 more. The global Tamper Alert bonus remains {state.progress.bonus === 5 ? "recorded at +5" : "available in Inbox or Trail"}; this dossier adds no new bonus claim.</p>
      <ol className="released-hints k-hints">{state.chapterHints[2].map((hint, index) => <li key={hint}><strong>Hint {index + 1}</strong><p>{hint}</p></li>)}</ol>
      <button className="k-btn" disabled={!editable || busy || state.progress.chapters[2].hints >= 2} onClick={() => void send("hint")}>Request Insider hint {Math.min(2, state.progress.chapters[2].hints + 1)} (−{state.progress.chapters[2].hints === 0 ? 3 : 6} points)</button>
    </Card>
    <Feedback busy={busy} text={feedback} extra={retrySeconds > 0 && editable ? `Next submission available in ${retrySeconds}s.` : ""} /><ContinueBar chapter={2} state={state} />
    <p className="k-feedback" role="status">{copyStatus}</p>
  </div>;
}
