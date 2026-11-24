import "server-only";
import { z } from "zod";
import { inboxEvidence, inboxSolution } from "./inbox.server";
import { trailEvidence, trailSolution } from "./trail.server";
import { insiderDossier, insiderSolution } from "./insider.server";
import type { ChapterValidator } from "./engine";
import { earnedIds, gradeAll, type TaskDef } from "./scoring";
import type { ContainmentCctv, ContainmentEvidence, ContainmentRecord } from "@/types/containment";

// IDs carry no chronology or dependency rank; only the retained evidence supports the order.
const cases = {
  A: { events: ["46", "12", "73", "28", "61", "34", "85"], immediate: ["57", "19", "83", "42"], recovery: ["68", "24", "91", "37", "52", "16"] },
  B: { events: ["53", "82", "19", "64", "37", "91", "26"], immediate: ["32", "76", "15", "89"], recovery: ["43", "87", "21", "65", "18", "94"] },
  C: { events: ["78", "31", "56", "92", "14", "63", "47"], immediate: ["84", "23", "69", "51"], recovery: ["96", "35", "72", "14", "83", "49"] },
} as const;
function context(variant: string) {
  if (!Object.hasOwn(cases, variant)) throw new Error("Unsupported Containment variant");
  const inbox = inboxEvidence(variant), prior = inboxSolution(variant), trail = trailEvidence(variant), replay = trailSolution(variant), insider = insiderDossier(variant), accomplice = insiderSolution(variant);
  const policy = insider.records.find(record => record.id === accomplice.actionId)!;
  const auth = inbox.artifacts.find(record => record.id === prior.authenticationId)!;
  const database = inbox.artifacts.find(record => record.id === prior.databaseId)!;
  const navigation = inbox.artifacts.find(record => record.id === prior.deliveryId)!;
  const click = Object.entries(navigation.facts).find(([, fact]) => fact.includes(inbox.snapshot.redirectFrom))!;
  const detectedAt = new Date(Date.parse(database.facts.Time) + 30_000).toISOString();
  const custody = insider.records.find(record => record.id === `CUST-${variant}-01`)!;
  const checkpoint = new Date(Date.parse(custody.timestamp) + 60_000).toISOString();
  return { ids: cases[variant as keyof typeof cases], inbox, prior, trail, replay, insider, accomplice, policy, auth, database, click, detectedAt, custody, checkpoint };
}
export function containmentCctv(variant: string): ContainmentCctv {
  const c = context(variant), access = c.insider.records.find(record => record.id === c.accomplice.supportingEvidenceIds[1])!;
  return { id: `CCTV-${variant}-08`, variant, timestamp: access.timestamp, area: `SIM-CAM-${variant}-2 / Identity operations floor`, device: access.facts.Device, employeeId: access.facts.Employee, sourceId: access.id, custodyId: c.custody.id, observation: "The access controller associates this individually attested console receipt with the displayed device and employee assignment. A badge receipt shows opportunity, not intent, and does not show the external replay device. Correlate it with the independently retained command mirror.", custody: `Fictional reconstructed security-room snapshot from ${access.id}; sealed at ${c.custody.timestamp} under ${c.custody.id}. No actual camera image, person or cryptographic certification is represented.` };
}
export function containmentEvidence(variant: string): ContainmentEvidence {
  const c = context(variant), v = variant, cctv = containmentCctv(v);
  const event = (index: number, timestamp: string, title: string, description: string, sourceIds: string[], principal = c.inbox.recipient, sessionId: string = c.prior.sessionId, confidence = "Corroborated retained record; timestamps UTC; fictional case") => ({ id: `INC-${v}-${c.ids.events[index]}`, timestamp, title, description, sourceIds, principal, sessionId, confidence });
  const events: ContainmentRecord[] = [
    event(0, c.policy.timestamp, "Export control modification", c.policy.facts.After, [c.policy.id, c.custody.id], c.accomplice.employeeId, "No victim session used for the administrator command"),
    event(1, `${c.inbox.snapshot.capturedAt.slice(0, 10)}T${c.click[0].slice(0, 8)}Z`, "Navigation from the delivered lure", c.click[1], [c.prior.emailId, c.prior.deliveryId], c.inbox.recipient, "Navigation record alone does not prove a session was issued"),
    event(2, c.inbox.snapshot.capturedAt, "Redirect capture retained", `Captured ${c.inbox.snapshot.url}; campaign ${c.inbox.snapshot.campaign}. A captured page is evidence, not trusted instructions.`, [c.inbox.snapshot.id]),
    event(3, c.auth.facts.Time, "Existing session accepted on a changed device/source", `${c.auth.facts.Source}; unregistered-browser; no fresh MFA. Original session issuance remains a separate earlier legitimate event.`, [c.auth.id, c.replay.eventId]),
    event(4, c.database.facts.Time, "Customer data export", `${c.database.facts.Operation}; ${c.database.facts.Authorization}`, [c.database.id]),
    event(5, c.detectedAt, "SOC correlation alert retained", "A simulated monitor correlates the retained customer export with the changed-device validation 30 seconds after the database audit event. Detection does not revoke the session or restore any policy.", [`DET-${v}-05`, c.auth.id, c.database.id], "soc-monitor@nexus.example", c.prior.sessionId, "New simulation record derived from the export timestamp; no real monitor runs"),
    event(6, c.checkpoint, "Response checkpoint", "The incident lead receives the sealed chronology one minute after custody sealing. No targeted revocation or closure of the export exception is recorded yet. Build the simulated response plan; the stolen session must be treated as usable.", [`IR-${v}-11`, c.custody.id], "incident-lead@nexus.example"),
  ];
  const observations: ContainmentRecord[] = [
    { id: `OBS-${v}-ARCHIVE`, title: "Scheduled archive export", timestamp: "2026-11-16T06:00:00Z", description: `Routine archive_manifest export: CHG-204; service session archive-${v}-06. This is not the customer incident export.`, sourceIds: [c.inbox.artifacts.find(record => record.kind === "database" && record.id !== c.database.id)!.id], principal: "svc-archive@nexus.example", sessionId: `archive-${v}-06`, confidence: "Approved independent workload; supporting observation, not one of the seven incident events" },
    { id: `OBS-${v}-MAINT`, title: "Alternate-network maintenance export", timestamp: "2026-11-16T09:20:00Z", description: "A changed source and an export look similar, but CHG-219 authorizes the registered device and maintenance_manifest only. Keep this separate from customer_directory.", sourceIds: [`CHG-${v}-219`, `DB-${v}-MAINT`], principal: `maintenance.${v.toLowerCase()}@nexus.example`, sessionId: `maint-${v}-219`, confidence: "Approved maintenance; supporting observation, not one of the seven incident events" },
  ];
  const immediateText = [
    ["Revoke the affected replay session and derived tokens", `Target ${c.prior.sessionId} for ${c.inbox.recipient}; do not confuse it with the independently managed session or workload identities.`],
    ["Temporarily restrict the affected customer export privilege", "Gate customer_directory export for the affected identity while keeping support read paths, approved archive jobs and unrelated workloads available."],
    ["Preserve an immutable incident evidence set", "Copy authentication, database and policy audit records plus retained capture/message references, record integrity/custody and retain the immutable mirror. Begin alongside urgent containment, not after deleting or rebooting systems."],
    ["Notify the internal incident lead and data owner", "Record the internal simulated escalation and recovery authorization request. This selection sends no message or notification."],
  ];
  const recoveryText = [
    ["Close the unauthorized existing-session exception", "Restore required current-device attestation and a scoped expiry for the export client; preserve the policy diff in the evidence hold."],
    ["Verify identity, device trust and recovery authorization", "Use out-of-band employee verification and a known-good device; obtain incident-lead/data-owner authority for scoped material replacement and restoration."],
    ["Replace the affected session/refresh authentication material", "Re-enrol the affected identity's session/refresh binding on the verified device under the recorded authority. A password-only reset cannot invalidate an already stolen session."],
    ["Verify the containment barrier before restoration", "In this simulation verify old replay tokens are denied, the exception is closed, replacement material is scoped, evidence is held and affected export remains gated. No real login or network probe is run."],
    ["Restore the minimum required export privilege", "Restore only the approved customer export scope on the verified device after the barrier check passes. Keep support and authorized scheduled workloads available."],
    ["Monitor and verify the restored service", "Review simulated post-restoration authentication/export receipts for recurrence, and confirm support/archive continuity before closing the incident."],
  ];
  const immediateOptions = immediateText.map(([title, detail], i) => ({ id: `ACT-${v}-${c.ids.immediate[i]}`, title, detail }));
  immediateOptions.push(...[
    ["05", "Reset only the victim password", "Resume export immediately after the reset; assume existing cookies will become unusable."],
    ["06", "Block only the observed source", `Treat blocking documentation address ${c.auth.facts.Source} as sufficient even if the session token remains usable elsewhere.`],
    ["07", "Pause every business workload", "Halt support and all archive/maintenance jobs until the investigation is over, without a scoped dependency review."],
    ["08", "Restart the whole fleet before copying evidence", "Use a broad restart to try to clear the attacker before arranging retention of volatile and audit material."],
    ["09", "Purge incident logs after export", "Remove the suspicious records to prevent analysts or other teams from reusing them."],
    ["10", "Adopt an unverified AI remediation summary", "Treat generated advice as authorization without matching session identity, policy scope or retained evidence."],
  ].map(([id, title, detail]) => ({ id: `ACT-${v}-${id}`, title, detail })));
  const recoveryOptions = recoveryText.map(([title, detail], i) => ({ id: `REC-${v}-${c.ids.recovery[i]}`, title, detail }));
  recoveryOptions.push(...[
    ["05", "Restore using the old browser session", "Skip the device check because the employee display name matches."],
    ["06", "Delete the sealed evidence set", "Remove the incident hold before the final service checks."],
    ["07", "Rotate all company keys without authorization", "Replace unrelated workload keys and stop their jobs as a precaution."],
  ].map(([id, title, detail]) => ({ id: `REC-${v}-${id}`, title, detail })));
  const artifacts = [
    { id: c.policy.id, title: c.policy.title, facts: c.policy.facts }, c.auth, c.database,
    { id: c.inbox.snapshot.id, title: "Retained browser capture", facts: { Time: c.inbox.snapshot.capturedAt, Campaign: c.inbox.snapshot.campaign, Destination: c.inbox.snapshot.url, Handling: "Inert captured text; never visit the fictional destination" } },
    { id: c.custody.id, title: c.custody.title, facts: c.custody.facts },
    { id: `IR-${v}-11`, title: "Response authority and business constraints", facts: { Checkpoint: c.checkpoint, "Affected account": c.inbox.recipient, "Affected session": c.prior.sessionId, "Immediate response": "Revoke the exact replay session/derived tokens, gate affected customer export, preserve the immutable evidence set and notify the incident lead/data owner. These urgent steps can proceed in parallel; none requires delaying revocation for a finished evidence copy.", "Business continuity": "Support read-only service and CHG-204 archive_manifest jobs must remain available. CHG-219 maintenance_manifest is separate and approved. No blanket shutdown or unrelated key rotation is authorized.", "Recovery authority": "Known-good employee identity and device verification plus incident-lead/data-owner approval must precede reissuing affected session/refresh material. Close the unauthorized exception and replace affected material before the containment barrier check. A password reset or source-only block does not revoke stolen cookies.", "Restoration gate": "Complete the barrier check before scoped restoration. Monitor restored sessions/exports and verify support/archive continuity afterwards. Evidence deletion is never authorized.", "Simulation boundary": "Selections describe fictional decisions only. They never operate a real account, firewall, notification service or host." } },
    ...c.trail.artifacts.filter(record => [`CHG-${v}-219`, `DB-${v}-MAINT`].includes(record.id)),
  ];
  return { caseId: `NEXUS-CONTAINMENT-${v}`, account: c.inbox.recipient, sessionId: c.prior.sessionId, checkpoint: c.checkpoint, events: [events[3], events[0], events[6], events[2], events[5], events[1], events[4]], observations, artifacts, immediateOptions: immediateOptions.sort((a, b) => a.id.localeCompare(b.id)), recoveryOptions: recoveryOptions.sort((a, b) => a.id.localeCompare(b.id)), cctvReference: { id: cctv.id } };
}
export function containmentSolution(variant: string) {
  const c = context(variant), immediateActions = c.ids.immediate.map(id => `ACT-${variant}-${id}`), recoveryOrder = c.ids.recovery.map(id => `REC-${variant}-${id}`);
  return { kind: "plan" as const, eventOrder: c.ids.events.map(id => `INC-${variant}-${id}`), account: c.inbox.recipient, sessionId: c.prior.sessionId, immediateActions, recoveryOrder, supportingEvidenceIds: [c.policy.id, c.auth.id, c.database.id, `IR-${variant}-11`, `CCTV-${variant}-08`] };
}
const id = z.string().trim().min(3).max(100);
const distinct = (min: number, max: number) => z.array(id).min(min).max(max).refine(ids => new Set(ids).size === ids.length);
const schema = z.object({ kind: z.literal("plan"), eventOrder: distinct(7, 7), account: z.string().trim().toLowerCase().max(120).pipe(z.email()), sessionId: id, immediateActions: distinct(1, 10), recoveryOrder: distinct(1, 9), supportingEvidenceIds: distinct(5, 10), explanation: z.string().trim().max(1000).optional() }).strict();
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(x => b.includes(x));
const recoveryEdges = [[0, 3], [1, 2], [2, 3], [3, 4], [4, 5]];
export const containmentTasks: Record<string, TaskDef> = {
  "containment.timeline": { schema: z.object({ eventOrder: distinct(7, 7) }).strict(), grade: (a, variant) => { const o = containmentSolution(variant).eventOrder, placed = (from: number, to: number) => o.slice(from, to).every((x, i) => a.eventOrder[from + i] === x); return earnedIds("containment.timeline", { early: placed(0, 3), middle: placed(3, 5), late: placed(5, 7) }); } },
  "containment.identity": { schema: z.object({ account: z.string().trim().toLowerCase().max(120).pipe(z.email()), sessionId: id }).strict(), grade: (a, variant) => { const e = containmentSolution(variant); return earnedIds("containment.identity", { account: a.account === e.account, sessionId: a.sessionId === e.sessionId }); } },
  "containment.immediate": { schema: z.object({ immediateActions: distinct(1, 10) }).strict(), grade: (a, variant) => { const need = containmentSolution(variant).immediateActions, noWrong = a.immediateActions.every((x: string) => need.includes(x)); return earnedIds("containment.immediate", Object.fromEntries(need.map((x, i) => [`a${i + 1}`, noWrong && a.immediateActions.includes(x)]))); } },
  "containment.recovery": { schema: z.object({ recoveryOrder: distinct(1, 9) }).strict(), grade: (a, variant) => { const r = containmentSolution(variant).recoveryOrder, ok = sameSet(a.recoveryOrder, r); return earnedIds("containment.recovery", { set: ok, ...Object.fromEntries(recoveryEdges.map(([before, after], i) => [`e${i + 1}`, ok && a.recoveryOrder.indexOf(r[before]) < a.recoveryOrder.indexOf(r[after])])) }); } },
  "containment.evidence": { schema: z.object({ supportingEvidenceIds: distinct(5, 10) }).strict(), grade: (a, variant) => {
    const e = containmentSolution(variant), allowed = new Set([...e.supportingEvidenceIds, `CAP-${variant}-17`, `CUST-${variant}-01`, `CHG-${variant}-219`, `DB-${variant}-MAINT`]);
    const clean = a.supportingEvidenceIds.every((x: string) => allowed.has(x)), has = (ids: string[]) => clean && ids.every(x => a.supportingEvidenceIds.includes(x));
    return earnedIds("containment.evidence", { forensic: has(e.supportingEvidenceIds.slice(0, 3)), response: has(e.supportingEvidenceIds.slice(3)) });
  } },
};
export const containmentValidator: ChapterValidator = {
  hints: ["Reconstruct the seven events from trusted source timestamps, not card order or IDs. Separate delivered-lure navigation, the retained capture and later token validation; approved archive/maintenance observations belong outside the incident chain.", "Separate the parallel urgent response from ordered recovery. Preserve evidence alongside containment; verify identity and authority before replacing material, close the exploited weakness before the barrier check, and verify the barrier before restoring access."],
  valid: answer => schema.safeParse(answer).success, // well-formed payload? (best-v1: a malformed payload never consumes an attempt)
  grade(answer, variant) {
    const parsed = schema.safeParse(answer);
    return parsed.success ? gradeAll(containmentTasks, parsed.data, variant) : [];
  },
  validate(answer, variant) {
    const parsed = schema.safeParse(answer);
    if (!parsed.success || !Object.hasOwn(cases, variant)) return { correct: false, points: 0 };
    const value = parsed.data, expected = containmentSolution(variant), recovery = expected.recoveryOrder;
    const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(id => b.includes(id));
    const edges = [[0, 3], [1, 2], [2, 3], [3, 4], [4, 5]];
    const allowedEvidence = new Set([...expected.supportingEvidenceIds, `CAP-${variant}-17`, `CUST-${variant}-01`, `CHG-${variant}-219`, `DB-${variant}-MAINT`]);
    const correct = value.eventOrder.every((id, i) => id === expected.eventOrder[i]) && value.account === expected.account && value.sessionId === expected.sessionId && sameSet(value.immediateActions, expected.immediateActions) && sameSet(value.recoveryOrder, recovery) && edges.every(([before, after]) => value.recoveryOrder.indexOf(recovery[before]) < value.recoveryOrder.indexOf(recovery[after])) && expected.supportingEvidenceIds.every(id => value.supportingEvidenceIds.includes(id)) && value.supportingEvidenceIds.every(id => allowedEvidence.has(id));
    return { correct, points: correct ? 20 : 0 };
  },
};
