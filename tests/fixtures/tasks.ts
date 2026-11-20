// Independent per-task correct answers derived from the full-chapter fixtures. Used only by tests.
import { inboxAnswers } from "./inbox";
import { trailAnswers } from "./trail";
import { insiderAnswers } from "./insider";
import { containmentAnswers } from "./containment";
import { verdictAnswers } from "./verdict";

type V = "A" | "B" | "C";
const pick = (source: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map(key => [key, source[key]]));
export const taskFields: Record<string, string[]> = {
  "inbox.entry": ["emailId", "deliveryId", "snapshotId"], "inbox.identity": ["authenticationId", "sessionId"], "inbox.impact": ["databaseId"],
  "trail.source": ["account", "sourceIp"], "trail.session": ["sessionId", "eventId"], "trail.corroboration": ["supportingEvidenceIds"],
  "insider.suspect": ["employeeId"], "insider.action": ["actionId"], "insider.corroboration": ["supportingEvidenceIds"],
  "containment.timeline": ["eventOrder"], "containment.identity": ["account", "sessionId"], "containment.immediate": ["immediateActions"], "containment.recovery": ["recoveryOrder"], "containment.evidence": ["supportingEvidenceIds"],
  "verdict.entry": ["emailId", "captureId", "campaign"], "verdict.session": ["victimAccount", "sessionId", "exportId"], "verdict.insider": ["insiderId", "policyId"],
};
export function taskAnswer(taskId: string, variant: V): Record<string, unknown> {
  const chapter = taskId.split(".")[0];
  if (chapter === "verdict") {
    const full = verdictAnswers[variant] as unknown as Record<string, unknown> & { chain: Record<string, unknown> };
    if (taskId === "verdict.evidence") return { evidenceMap: full.evidenceMap };
    if (taskId === "verdict.reasoning") return { hypothesisId: full.hypothesisId, rejected: full.rejected, attackerAttribution: "alias-only", responseStatus: "plan-prepared" };
    return pick(full.chain, taskFields[taskId]);
  }
  const source = { inbox: inboxAnswers, trail: trailAnswers, insider: insiderAnswers, containment: containmentAnswers }[chapter]![variant] as unknown as Record<string, unknown>;
  return JSON.parse(JSON.stringify(pick(source, taskFields[taskId])));
}
