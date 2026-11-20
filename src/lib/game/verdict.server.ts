import "server-only";
import { z } from "zod";
import { inboxEvidence, inboxSolution } from "./inbox.server";
import { trailEvidence, trailSolution } from "./trail.server";
import { insiderDossier, insiderSolution } from "./insider.server";
import { containmentEvidence } from "./containment.server";
import type { ChapterValidator } from "./engine";
import { earnedIds, gradeAll, type TaskDef } from "./scoring";
import type { VerdictEvidence, VerdictRecord } from "@/types/verdict";

const hypotheses = { A: { replay: "27", employee: "64", maintenance: "91" }, B: { replay: "83", employee: "16", maintenance: "42" }, C: { replay: "38", employee: "72", maintenance: "15" } } as const;
function context(variant: string) {
  if (!Object.hasOwn(hypotheses, variant)) throw new Error("Unsupported Verdict variant");
  return { inbox: inboxEvidence(variant), entry: inboxSolution(variant), trail: trailEvidence(variant), replay: trailSolution(variant), insider: insiderDossier(variant), accomplice: insiderSolution(variant), containment: containmentEvidence(variant), hypotheses: hypotheses[variant as keyof typeof hypotheses] };
}
export function verdictEvidence(variant: string): VerdictEvidence {
  const c = context(variant), records: VerdictRecord[] = [];
  const add = (chapter: string, source: string, item: { id: string; title: string; facts: Record<string, string> }) => records.push({ chapter, source, ...item });
  const email = c.inbox.emails.find(item => item.id === c.entry.emailId)!;
  add("Inbox", "Recovered mailbox", { id: email.id, title: email.subject, facts: { Time: email.timestamp, From: email.address, Recipient: email.recipient, Links: email.links.join("; "), Handling: "Recovered untrusted message; provenance and gateway records must corroborate its role" } });
  for (const item of c.inbox.artifacts.filter(item => [c.entry.deliveryId, `GW-${variant}-01`].includes(item.id))) add("Inbox", "Independent mail/web gateway", item);
  add("Inbox", "Retained browser capture", { id: c.inbox.snapshot.id, title: c.inbox.snapshot.title, facts: { Time: c.inbox.snapshot.capturedAt, Campaign: c.inbox.snapshot.campaign, Recipient: c.inbox.snapshot.recipient, "Redirect from": c.inbox.snapshot.redirectFrom, Destination: c.inbox.snapshot.url, Handling: "Inert captured page; do not follow its fictional destination" } });
  for (const row of c.trail.rows.filter(row => [c.replay.supportingEvidenceIds[0], c.replay.eventId].includes(row.id))) add("Trail", "Identity-provider audit", { id: row.id, title: `${row.eventType} / ${row.account}`, facts: { Time: row.timestamp, Principal: row.account, Source: row.sourceIp, Device: row.device, Session: row.sessionId, Method: row.method, Result: row.result, "Conditional access": row.conditionalAccess, Correlation: row.correlationId } });
  for (const item of c.inbox.artifacts.filter(item => item.kind === "database" || item.kind === "authentication" && item.id !== c.entry.authenticationId)) add("Inbox", item.kind === "database" ? "Database audit" : "Identity-provider audit", item);
  for (const item of c.insider.records.filter(item => [c.accomplice.actionId, ...c.accomplice.supportingEvidenceIds, `CUST-${variant}-01`, `POL-${variant}-STAFF-3`].includes(item.id))) add("Insider", item.provenance, { id: item.id, title: item.title, facts: { Time: item.timestamp, ...item.facts } });
  for (const item of c.trail.artifacts.filter(item => [ `CHG-${variant}-219`, `DB-${variant}-MAINT` ].includes(item.id))) add("Trail", item.id.startsWith("CHG") ? "Original approved change ticket" : "Database audit", item);
  add("Containment", "Incident lead / response authority", c.containment.artifacts.find(item => item.id === `IR-${variant}-11`)!);
  const ids = c.hypotheses;
  return {
    caseId: `NEXUS-VERDICT-${variant}`,
    summary: ["Synthesize the retained mailbox/gateway, identity-provider, database, internal command/message and response-authority records. A single suspicious row does not establish the complete case.", "Distinguish the replayed employee victim, the separately evidenced internal accomplice and external attacker alias GHOST_404. The records do not establish GHOST_404's real-world identity, location or psychological motive.", "Chapter 4 prepared an evidence-preserving response plan. Game completion is not proof that real containment actions ran or that a fictional recovery was independently verified."],
    records: records.sort((a, b) => a.id.localeCompare(b.id)),
    emails: c.inbox.emails.map(item => ({ id: item.id, subject: item.subject, sender: item.sender })),
    accounts: [...c.insider.suspects.map(person => person.email), `maintenance.${variant.toLowerCase()}@nexus.example`, "svc-archive@nexus.example"],
    sessions: [...new Set([c.entry.sessionId, `nx-${variant.toLowerCase()}-managed`, `maint-${variant}-219`, `archive-${variant}-06`, `alert-${variant}-88`])].sort(),
    captures: [{ id: c.inbox.snapshot.id, campaign: c.inbox.snapshot.campaign, url: c.inbox.snapshot.url }],
    exports: [...c.inbox.artifacts.filter(item => item.kind === "database"), c.trail.artifacts.find(item => item.id === `DB-${variant}-MAINT`)!].map(item => ({ id: item.id, description: `${item.facts.Principal}; ${item.facts.Session}; ${item.facts.Operation}` })),
    suspects: c.insider.suspects.map(({ id, name, role }) => ({ id, name, role })),
    policies: c.insider.records.filter(item => item.kind === "policy").map(item => ({ id: item.id, description: `${item.facts.Employee}; ${item.facts.Operation}; ${item.facts.Scope ?? item.facts.After}` })),
    hypotheses: [
      { id: `HYP-${variant}-${ids.replay}`, title: "Redirect-linked session abuse with internal policy assistance", explanation: `The ${c.inbox.snapshot.campaign} capture, later use of ${c.entry.sessionId} and customer audit may form a connected chain. Separately attribute the policy command and journaled intent; account ownership alone does not prove employee intent.` },
      { id: `HYP-${variant}-${ids.employee}`, title: "Victim alone exported from a registered workstation", explanation: `${c.inbox.recipient} appears on the export. This account proposes an intentional export on the employee's registered device, with no changed-device session abuse and no relevant internal policy modification. Compare it against both identity and policy records.` },
      { id: `HYP-${variant}-${ids.maintenance}`, title: "Authorized maintenance or routine archive activity", explanation: `CHG-${variant}-219 and CHG-204 authorize other exports. This account proposes that the customer export was within those scopes. Check the exact principal, session, object and approving authority rather than treating all exports as equivalent.` },
    ].sort((a, b) => a.id.localeCompare(b.id)),
    timeline: c.containment.events.map(({ id, timestamp, title, sourceIds }) => ({ id, timestamp, title, sourceIds })),
  };
}
export function verdictSolution(variant: string, reject: "employee" | "maintenance" = "employee") {
  const c = context(variant);
  return {
    kind: "verdict" as const,
    chain: { emailId: c.entry.emailId, victimAccount: c.inbox.recipient, captureId: c.inbox.snapshot.id, campaign: c.inbox.snapshot.campaign, sessionId: c.entry.sessionId, exportId: c.entry.databaseId, insiderId: c.accomplice.employeeId, policyId: c.accomplice.actionId },
    hypothesisId: `HYP-${variant}-${c.hypotheses.replay}`,
    evidenceMap: { entry: [c.entry.emailId, c.entry.deliveryId, c.entry.snapshotId], session: [c.replay.supportingEvidenceIds[0], c.replay.eventId], impact: [c.entry.databaseId], assistance: [c.accomplice.actionId, ...c.accomplice.supportingEvidenceIds, `CUST-${variant}-01`], response: [`IR-${variant}-11`] },
    rejected: reject === "employee" ? { hypothesisId: `HYP-${variant}-${c.hypotheses.employee}`, contradiction: "device-and-policy", evidenceIds: [c.replay.eventId, c.accomplice.actionId] } : { hypothesisId: `HYP-${variant}-${c.hypotheses.maintenance}`, contradiction: "outside-approved-scope", evidenceIds: [c.entry.databaseId, `CHG-${variant}-219`] },
    attackerAttribution: "alias-only", responseStatus: "plan-prepared",
  };
}
const id = z.string().trim().min(3).max(100);
const distinct = (min: number, max: number) => z.array(id).min(min).max(max).refine(ids => new Set(ids).size === ids.length);
const schema = z.object({
  kind: z.literal("verdict"),
  chain: z.object({ emailId: id, victimAccount: z.string().trim().toLowerCase().max(120).pipe(z.email()), captureId: id, campaign: id, sessionId: id, exportId: id, insiderId: id, policyId: id }).strict(),
  hypothesisId: id,
  evidenceMap: z.object({ entry: distinct(1, 5), session: distinct(1, 5), impact: distinct(1, 5), assistance: distinct(1, 7), response: distinct(1, 5) }).strict(),
  rejected: z.object({ hypothesisId: id, contradiction: z.enum(["device-and-policy", "outside-approved-scope"]), evidenceIds: distinct(2, 2) }).strict(),
  attackerAttribution: z.literal("alias-only"), responseStatus: z.literal("plan-prepared"), explanation: z.string().trim().max(1000).optional(),
}).strict();
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(x => b.includes(x));
const roleSchema = distinct(1, 7);
export const verdictTasks: Record<string, TaskDef> = {
  "verdict.entry": { schema: z.object({ emailId: id, captureId: id, campaign: id }).strict(), grade: (a, variant) => { const c = verdictSolution(variant).chain; return earnedIds("verdict.entry", { emailId: a.emailId === c.emailId, captureId: a.captureId === c.captureId, campaign: a.campaign === c.campaign }); } },
  "verdict.session": { schema: z.object({ victimAccount: z.string().trim().toLowerCase().max(120).pipe(z.email()), sessionId: id, exportId: id }).strict(), grade: (a, variant) => { const c = verdictSolution(variant).chain; return earnedIds("verdict.session", { victimAccount: a.victimAccount === c.victimAccount, sessionId: a.sessionId === c.sessionId, exportId: a.exportId === c.exportId }); } },
  "verdict.insider": { schema: z.object({ insiderId: id, policyId: id }).strict(), grade: (a, variant) => { const c = verdictSolution(variant).chain; return earnedIds("verdict.insider", { insiderId: a.insiderId === c.insiderId, policyId: a.policyId === c.policyId }); } },
  "verdict.evidence": { schema: z.object({ evidenceMap: z.object({ entry: roleSchema, session: roleSchema, impact: roleSchema, assistance: roleSchema, response: roleSchema }).strict() }).strict(), grade: (a, variant) => {
    const expected = verdictSolution(variant).evidenceMap, mapped = Object.values(a.evidenceMap as Record<string, string[]>).flat(), disjoint = new Set(mapped).size === mapped.length;
    const role = (name: keyof typeof expected) => { const required = expected[name], actual: string[] = a.evidenceMap[name], extras = name === "entry" ? [`GW-${variant}-01`] : name === "assistance" ? [`CHG-${variant}-219`] : []; return disjoint && required.every(x => actual.includes(x)) && actual.every(x => required.includes(x) || extras.includes(x)); };
    return earnedIds("verdict.evidence", { entry: role("entry"), session: role("session"), impact: role("impact"), assistance: role("assistance"), response: role("response") });
  } },
  "verdict.reasoning": { schema: z.object({ hypothesisId: id, attackerAttribution: z.literal("alias-only"), responseStatus: z.literal("plan-prepared"), rejected: z.object({ hypothesisId: id, contradiction: z.enum(["device-and-policy", "outside-approved-scope"]), evidenceIds: distinct(2, 2) }).strict() }).strict(), grade: (a, variant) => {
    const expected = verdictSolution(variant), alternative = verdictSolution(variant, "maintenance");
    return earnedIds("verdict.reasoning", { hypothesis: a.hypothesisId === expected.hypothesisId, rejection: [expected.rejected, alternative.rejected].some(r => a.rejected.hypothesisId === r.hypothesisId && a.rejected.contradiction === r.contradiction && sameSet(a.rejected.evidenceIds, r.evidenceIds)) });
  } },
};
export const verdictValidator: ChapterValidator = {
  hints: ["Map the entry, session, impact, internal-assistance and response claims to independent retained sources from all four chapters. A mailbox display name or one database principal cannot establish the whole causal chain.", "Keep account ownership separate from intent. Match the captured campaign to the exact replayed session and customer export, correlate the signed policy action with intent/access/custody, and use actual records to contradict an alternative. An attacker alias is not a proven real-world identity, and a prepared plan is not an executed recovery."],
  grade(answer, variant) {
    const parsed = schema.safeParse(answer);
    return parsed.success ? gradeAll(verdictTasks, { ...parsed.data.chain, evidenceMap: parsed.data.evidenceMap, hypothesisId: parsed.data.hypothesisId, rejected: parsed.data.rejected }, variant) : [];
  },
  validate(answer, variant) {
    const parsed = schema.safeParse(answer);
    if (!parsed.success || !Object.hasOwn(hypotheses, variant)) return { correct: false, points: 0 };
    const value = parsed.data, expected = verdictSolution(variant), alternative = verdictSolution(variant, "maintenance");
    const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(id => b.includes(id));
    const mapped = Object.values(value.evidenceMap).flat();
    const correct = Object.entries(expected.chain).every(([key, fact]) => value.chain[key as keyof typeof value.chain] === fact) && value.hypothesisId === expected.hypothesisId && new Set(mapped).size === mapped.length && Object.entries(expected.evidenceMap).every(([role, required]) => { const actual = value.evidenceMap[role as keyof typeof value.evidenceMap]; const extras = role === "entry" ? [`GW-${variant}-01`] : role === "assistance" ? [`CHG-${variant}-219`] : []; return required.every(id => actual.includes(id)) && actual.every(id => required.includes(id) || extras.includes(id)); }) && [expected.rejected, alternative.rejected].some(rejected => value.rejected.hypothesisId === rejected.hypothesisId && value.rejected.contradiction === rejected.contradiction && sameSet(value.rejected.evidenceIds, rejected.evidenceIds));
    return { correct, points: correct ? 15 : 0 };
  },
};
