import "server-only";
import { z } from "zod";
import { inboxEvidence, inboxSolution } from "./inbox.server";
import { trailEvidence } from "./trail.server";
import type { ChapterValidator } from "./engine";
import type { InsiderDossier, InsiderRecord, InsiderSuspect } from "@/types/insider";

const cases = { A: { employee: 3, policy: "04", message: "09", access: "11", approval: "06" }, B: { employee: 1, policy: "07", message: "03", access: "14", approval: "08" }, C: { employee: 4, policy: "02", message: "12", access: "06", approval: "04" } } as const;
function assignment(variant: string) {
  if (!Object.hasOwn(cases, variant)) throw new Error("Unsupported Insider variant");
  return cases[variant as keyof typeof cases];
}
export function insiderDossier(variant: string): InsiderDossier {
  const selected = assignment(variant);
  const inbox = inboxEvidence(variant);
  const inboxAnswer = inboxSolution(variant);
  const trail = trailEvidence(variant);
  const roster = [
    { name: { A: "Maya Rao", B: "Ishan Sen", C: "Leena Das" }[variant as "A" | "B" | "C"], email: inbox.recipient, role: "Data analyst", privileges: "Read customer_directory; no identity-policy administration", responsibilities: "Business data review; owner of the replayed account" },
    { name: "Nila Varma", email: "nila.varma@nexus.example", role: "Identity engineer", privileges: "Write identity exceptions using an individual hardware key", responsibilities: "Printer service exceptions and identity change reviews" },
    { name: "Arjun Mehta", email: "arjun.mehta@nexus.example", role: "Maintenance operator", privileges: "Maintain database workloads; no customer identity-policy write role", responsibilities: `Delegated maintenance.${variant.toLowerCase()}@nexus.example workload under CHG-219` },
    { name: "Rohan Iyer", email: "rohan.iyer@nexus.example", role: "Directory administrator", privileges: "Read/write identity policy using an individual hardware key", responsibilities: "Directory configuration and backup-retention reviews" },
    { name: "Tara Menon", email: "tara.menon@nexus.example", role: "SOC automation lead", privileges: "Write policy integrations and forwarding rules using an individual hardware key", responsibilities: "SOC forwarding, automation and identity-policy integrations" },
    { name: "Saira Khan", email: "saira.khan@nexus.example", role: "Help desk lead", privileges: "Read support tickets; cannot write identity policy", responsibilities: "Employee verification and incident support" },
  ];
  const suspects: InsiderSuspect[] = roster.map((person, index) => ({ ...person, id: `EMP-${variant}-${String(index + 1).padStart(2, "0")}`, device: `NX-ADMIN-${variant}-${index + 1}` }));
  const actor = suspects[selected.employee];
  const records: InsiderRecord[] = [];
  const record = (id: string, kind: InsiderRecord["kind"], time: string, title: string, employees: string[], facts: Record<string, string>, provenance = "NEXUS retained audit/message export; sealed 2026-11-16T09:31:00Z") => records.push({ id, kind, timestamp: time.includes("T") ? time : `2026-11-16T${time}Z`, title, employees, provenance, facts });
  const ordinaryPolicies = [
    { time: "09:03:00", operation: "Read export client profile", scope: "Business client only; no administrator signing credential or policy write", approval: "Not a policy modification" },
    { time: "09:07:00", operation: "Write printer-service exception", scope: "NEXUS-Printer only; device attestation remains required for NEXUS-DataExport", approval: `PRN-${variant}-08` },
    { time: "09:05:00", operation: "Write maintenance workload routing", scope: "maintenance_manifest only; no customer_directory or identity exception", approval: `CHG-${variant}-219` },
    { time: "09:04:00", operation: "Read backup-retention policy", scope: "No write under this command; independent audit retains all later commands", approval: "Read operation" },
    { time: "09:22:10", operation: "Write forwarding connector maintenance window", scope: "SOC queue only; immutable identity-policy mirror remains active", approval: `OPS-${variant}-08` },
    { time: "09:13:00", operation: "Read employee support ticket", scope: "Help desk interface; no identity-policy write privilege", approval: `HELP-${variant}-07` },
  ];
  for (const [index, person] of suspects.entries()) {
    record(index === selected.employee ? `ACC-${variant}-${selected.access}` : `ACC-${variant}-STAFF-${index + 1}`, "access", index === selected.employee ? "09:10:11" : `09:10:${String(10 + index * 7).padStart(2, "0")}`, "Badge and console access receipt", [person.id], { Employee: person.id, Room: index === 2 ? "Maintenance rack room" : "Identity operations floor", Device: person.device, "Console authentication": index === 0 || index === 5 ? "Support/data workstation; no privileged policy console" : `FIDO-${person.id}; individual key attestation`, Observation: "Presence is opportunity, not proof of intent; compare signed commands and approvals" }, "Independent badge controller and console MFA receipts; retained by facilities/security");
    const ordinary = ordinaryPolicies[index];
    record(`POL-${variant}-STAFF-${index + 1}`, "policy", ordinary.time, "Retained ordinary staff command", [person.id], { Employee: person.id, Operation: ordinary.operation, Scope: ordinary.scope, Approval: ordinary.approval, Device: person.device });
  }
  const actionId = `POL-${variant}-${selected.policy}`;
  record(actionId, "policy", "09:11:18", "Existing-session export policy diff", [actor.id], { Operation: "UPDATE existing-session-export-policy", Employee: actor.id, Device: actor.device, "Signing credential": `FIDO-${actor.id}`, Before: "NEXUS-DataExport requires current device attestation; scoped expiry required", After: "customer_directory accepts an existing session without current device attestation; expiry=none", "Claimed approval": `CHG-${variant}-219`, "Approval attachment": "Reference text supplied; approving signature not attached" }, "Immutable identity-policy command mirror, sequence 301; outside the editable SOC forwarding queue");
  record(`MSG-${variant}-${selected.message}`, "message", "09:08:44", "Shared operations mailbox / retained instruction", [], { From: "ops-bridge@nexus.example", To: "review-window@nexus-gateway.example", "Authoring device": actor.device, Text: "For the 09:16 review slot, extend the legacy-session exception to customer_directory. Put 219 in the approval field and leave expiry blank. Send the policy diff after the export slot, not in the advance review pack." }, "Journaled mailbox copy, not the editable sender folder; device attribution requires the custody record");
  record(`MSG-${variant}-INTERVIEW`, "message", "09:28:00", "Recorded staff explanation", [actor.id], { Speaker: actor.id, Statement: "My policy activity was limited to my ordinary approved work. I did not widen the customer export session rule before the incident.", Handling: "A statement is not independently verified; compare the signed policy command and its actual scope" });
  record(`MSG-${variant}-HELP`, "message", "09:13:32", "Help desk conversation with the affected employee", [suspects[0].id, suspects[5].id], { From: suspects[5].email, To: inbox.recipient, Text: "Verify the request through the internal directory. Do not extend a security exception or enter an access code into the emailed page. The support ticket does not authorize policy changes.", Ticket: `HELP-${variant}-07` });
  record(`MSG-${variant}-MAINT`, "message", "09:04:00", "Maintenance scope confirmation", [suspects[2].id], { From: suspects[2].email, Text: "CHG-219 covers the maintenance_manifest export and the registered maintenance workstation only. Customer data and identity-policy exceptions are out of scope.", Workload: `maintenance.${variant.toLowerCase()}@nexus.example` });
  record(`MSG-${variant}-SOC`, "message", "09:19:20", "SOC queue discussion after the export", [suspects[4].id], { From: suspects[4].email, Text: "The forwarder spool needs its approved maintenance window. Preserve the separate immutable command mirror. Queue timing does not alter the original policy-command receipts.", Approval: `OPS-${variant}-08` });
  const maintenance = trail.artifacts.find(artifact => artifact.id === `CHG-${variant}-219`)!;
  record(`APP-${variant}-${selected.approval}`, "approval", "09:00:00", "Original signed CHG-219 approval", [suspects[2].id], { ...maintenance.facts, "Approved scope": "maintenance_manifest only; no identity-policy exception and no customer_directory export", "Approver signature": "Approved maintenance scope only; no signature over the later legacy-session diff", Custody: "Original ticket snapshot, retained independently from policy reference text" });
  record(`PRN-${variant}-08`, "approval", "08:45:00", "Approved printer change", [suspects[1].id], { Scope: "Printer service only", Window: "09:00–09:15 UTC", Limit: "No change to NEXUS-DataExport device trust" });
  record(`OPS-${variant}-08`, "approval", "08:50:00", "Approved SOC connector maintenance", [suspects[4].id], { Scope: "Forwarding spool maintenance 09:20–09:30 UTC", Limit: "No identity-policy changes; separate immutable command mirror stays online" });
  record(`CUST-${variant}-01`, "custody", "09:31:00", "Device attribution and export custody receipt", suspects.map(person => person.id), { "Device assignment": suspects.map(person => `${person.device} → ${person.id}`).join("; "), "Individual console keys": "Hardware-key identifiers in command receipts are individually assigned; no shared administrator key is recorded", Coverage: "Complete policy command mirror 09:00–09:30 UTC; journaled messages and badge receipts retained separately", "Mirror integrity": "Sequence 301 and surrounding commands present; forwarding edits do not modify the mirror", Limitation: "Fictional sealed evidence representation, not a real cryptographic certificate" });
  const auth = inbox.artifacts.find(artifact => artifact.id === inboxAnswer.authenticationId)!;
  const database = inbox.artifacts.find(artifact => artifact.id === inboxAnswer.databaseId)!;
  record(inbox.snapshot.id, "timeline", inbox.snapshot.capturedAt, "Prior chapter / captured redirect", [suspects[0].id], { Principal: inbox.recipient, Campaign: inbox.snapshot.campaign, Destination: inbox.snapshot.url, "Redirect from": inbox.snapshot.redirectFrom });
  record(auth.id, "timeline", auth.facts.Time, "Prior chapter / later session validation", [suspects[0].id], auth.facts);
  record(database.id, "timeline", database.facts.Time, "Prior chapter / unauthorized export", [suspects[0].id], database.facts);
  record(`TIME-${variant}-01`, "timeline", "09:31:00", "Correlated control and incident chronology", [actor.id, suspects[0].id], { "Pre-incident control": `${actionId} at 09:11:18 UTC removed current-device attestation for customer_directory`, Capture: `${inbox.snapshot.id} at ${inbox.snapshot.capturedAt}`, "Session validation": `${auth.id}; ${auth.facts.Session}; ${auth.facts.Source}; no fresh MFA`, Export: `${database.id} at ${database.facts.Time}`, Distinction: "GHOST_404 is the external attacker alias. The replayed employee account is a victim identity; deliberate internal assistance requires separate proof." });
  return { caseId: `NEXUS-INSIDER-${variant}`, suspects, records: records.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)) };
}

export function insiderSolution(variant: string) {
  const selected = assignment(variant);
  return { kind: "conclusion" as const, employeeId: `EMP-${variant}-${String(selected.employee + 1).padStart(2, "0")}`, actionId: `POL-${variant}-${selected.policy}`, supportingEvidenceIds: [`MSG-${variant}-${selected.message}`, `ACC-${variant}-${selected.access}`, `APP-${variant}-${selected.approval}`] };
}
const id = z.string().trim().min(3).max(100);
const answerSchema = z.object({ kind: z.literal("conclusion"), employeeId: id, actionId: id, supportingEvidenceIds: z.array(id).min(3).max(8).refine(ids => new Set(ids).size === ids.length), explanation: z.string().trim().max(800).optional() }).strict();
export const insiderValidator: ChapterValidator = {
  hints: ["Access privileges and badge proximity establish opportunity, not intent. Compare each employee's signed actions, approved scope and timestamps; keep the replayed victim account separate from the person changing controls.", "Compare the pre-export existing-session policy diff with the original maintenance approval, then correlate the journaled instruction's authoring device with console access and independent custody records. A copied approval reference is not an approving signature."],
  validate(answer, variant) {
    const parsed = answerSchema.safeParse(answer);
    if (!parsed.success || !Object.hasOwn(cases, variant)) return { correct: false, points: 0 };
    const value = parsed.data;
    const expected = insiderSolution(variant);
    const allowed = [...expected.supportingEvidenceIds, expected.actionId, `CUST-${variant}-01`, `MSG-${variant}-INTERVIEW`, `TIME-${variant}-01`];
    const correct = value.employeeId === expected.employeeId && value.actionId === expected.actionId && expected.supportingEvidenceIds.every(id => value.supportingEvidenceIds.includes(id)) && value.supportingEvidenceIds.every(id => allowed.includes(id));
    return { correct, points: correct ? 25 : 0 };
  },
};
