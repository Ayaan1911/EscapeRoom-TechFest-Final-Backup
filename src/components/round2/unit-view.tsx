"use client";
import { useMemo } from "react";
import { EvidenceBrowser } from "./evidence";
import { ComparePanel } from "./briefing";
import { EvidenceProvider } from "./fields";
import { TaskCard } from "./task-card";
import { AiReportPanel, DependencyChain, ForensicLanes, HypothesisMatrix, IntelBoard, NetworkMap, ReportPreview } from "./visuals";
import { useDrafts } from "./use-draft-store";
import { effectiveAvailability } from "@/lib/round2/client-clock";
import { getAt, type Answer, type Field } from "@/lib/round2/form-types";
import type { Bundle, ClockView, R2Record, StatusPayload, SubmitOutcome, UnitContent } from "./types";

const timeKey = (t: string) => { const m = /^(\d\d):(\d\d)(?::(\d\d))?/.exec(t); return m ? +m[1] * 3600 + +m[2] * 60 + +(m[3] ?? 0) : null; };
/** Incident 1: the alert, then every record that carries a plain UTC time on a rail. Reference records (no time) are listed after it. */
function AlertHeader({ records }: { records: R2Record[] }) {
  const timed = records.filter(r => timeKey(r.time) !== null).sort((a, b) => timeKey(a.time)! - timeKey(b.time)!);
  return <section className="r2-alert" aria-label="Alert"><div className="r2-alert-head"><span className="r2-sev" role="img" aria-label="Severity high">HIGH</span><div><b>02:14 · Finance laptop outbound anomaly</b><p className="r2-meta">Host FIN-LT-07 · user p.okafor · plus an &quot;impossible travel&quot; identity alert</p></div></div>
    <ol className="r2-rail" aria-label="Records with UTC times, earliest first">{timed.map(r => <li key={r.id}><time className="r2-mono">{r.time.slice(0, 5)}</time><span className={`r2-dot src-${r.source}`} aria-hidden="true" /><span><b className="r2-id">{r.id}</b> {r.title}</span></li>)}</ol></section>;
}

export function UnitView({ unit, bundle, status, clock, now, onScored, onNeedRefresh }: { unit: UnitContent; bundle: Bundle; status: StatusPayload; clock: ClockView; now: number; onScored: (taskId: string, o: SubmitOutcome) => void; onNeedRefresh: () => void }) {
  const store = useDrafts();
  const allRecords = useMemo(() => [...new Map(bundle.units.flatMap(u => u.records).map(r => [r.id, r])).values()], [bundle]);
  const fieldsOf = (id: string): Field[] => unit.tasks.find(t => t.id === id)?.fields ?? [];
  const working = (id: string): Answer => store.entry(id).working;
  const closesAt = unit.part === "A" ? clock.partAClosesAt : clock.endsAt;
  const avail = (id: string) => effectiveAvailability(status.tasks.find(t => t.id === id)?.availability ?? "closed", closesAt, now);
  const referenced = useMemo(() => { const own = new Set(unit.records.map(r => r.id)), ids = new Set(unit.tasks.flatMap(t => t.fields.flatMap(f => [...(f.options ?? []), ...(f.keys ?? [])].map(o => o.id)))); return allRecords.filter(r => ids.has(r.id) && !own.has(r.id)); }, [unit, allRecords]);
  const edit = (task: string, path: string[], v: unknown) => store.edit(task, fieldsOf(task), path, v, avail(task) === "open");
  const toggle = (task: string, path: string[], id: string, max: number) => { const cur = (getAt(working(task), path) as string[] | undefined) ?? []; edit(task, path, cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id].slice(0, max)); };
  const key = `${unit.part}${unit.unit}`;
  const connRecs = unit.records.filter(r => r.id.startsWith("C-")), otherRecs = unit.records.filter(r => !r.id.startsWith("C-") && r.id !== "AI-REPORT");
  const seq = fieldsOf("i4.sequence")[0], order = getAt(working("i4.sequence"), ["order"]) as string[] | undefined;

  const visual = key === "A1" ? <AlertHeader records={unit.records} />
    : key === "A2" ? <NetworkMap records={connRecs} disabled={avail("i2.identify") !== "open"} malicious={(getAt(working("i2.identify"), ["connectionIds"]) as string[] | undefined) ?? []} blocked={(getAt(working("i2.block"), ["blocks"]) as string[] | undefined) ?? []} onMark={id => toggle("i2.identify", ["connectionIds"], id, 10)} onBlock={id => toggle("i2.block", ["blocks"], id, 10)} />
    : key === "A3" ? <AiReportPanel working={working("i3.verdicts")} verdictFields={fieldsOf("i3.verdicts")} />
    : key === "A4" ? <><section className="r2-pressure" aria-label="Executive pressure"><span className="r2-tag r2-tag-warn">EXECUTIVE PRESSURE</span><p>{unit.records.find(r => r.id === "D-401")?.detail}</p></section><DependencyChain order={order} labelOf={id => seq?.options?.find(o => o.id === id)?.text ?? id} /></>
    : key === "B1" ? <ForensicLanes records={unit.records} order={getAt(working("b1.order"), ["order"]) as string[] | undefined} />
    : key === "B2" ? <HypothesisMatrix working={{ ...working("b2.best"), eliminate: getAt(working("b2.eliminate"), ["eliminate"]) }} bestField={fieldsOf("b2.best")[0]} elimFields={fieldsOf("b2.eliminate")} />
    : key === "B3" ? <IntelBoard working={{ ...working("b3.classify"), refutations: getAt(working("b3.verify"), ["refutations"]) }} gradeFields={fieldsOf("b3.classify")} />
    : <ReportPreview fieldsByTask={Object.fromEntries(unit.tasks.map(t => [t.id, t.fields]))} workingByTask={Object.fromEntries(unit.tasks.map(t => [t.id, working(t.id)]))} />;
  const browser = <EvidenceBrowser title={unit.part === "A" ? "Retained evidence" : "Evidence and revealed records"} records={[...otherRecs.filter(r => !r.id.startsWith("EV-")), ...referenced]} />;

  return <EvidenceProvider records={allRecords}>
    <div className="r2-unit" data-unit={key}>
      <header className="r2-unit-head"><span className="r2-eyebrow">{unit.part === "A" ? `PART A · INCIDENT ${unit.unit}` : `PART B · CHALLENGE ${unit.unit}`}</span><h2>{unit.title}</h2><p className="r2-story">{unit.story}</p></header>
      <div className={`r2-unit-grid ${key === "A3" ? "is-split" : ""} ${key === "A2" ? "is-stacked" : ""}`}>
        <div className="r2-unit-visual">{visual}{unit.part === "B" && <ComparePanel records={[...otherRecs, ...referenced]} />}{key !== "A3" && browser}</div>
        <div className="r2-unit-main">{key === "A3" && browser}
          <section className="r2-tasks" aria-label={`Tasks for ${unit.title}`}><h3 className="r2-h">Tasks <small>Scored one by one</small></h3>
            {unit.tasks.map((t, i) => { const st = status.tasks.find(x => x.id === t.id)!, a = avail(t.id);
              return <TaskCard key={t.id} index={i + 1} task={t} status={st} editable={a === "open"} closedReason={a === "not_released" ? "Not released yet" : "Closed: read-only"} onScored={onScored} onNeedRefresh={onNeedRefresh} />; })}</section></div></div></div>
  </EvidenceProvider>;
}
