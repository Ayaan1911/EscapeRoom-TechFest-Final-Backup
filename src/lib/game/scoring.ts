import type { ZodType } from "zod";
// Task/criterion catalog. Contains point values and ids only - never answers - so it is safe to import anywhere.
// A criterion id is `<taskId>:<key>`. Graders (in each *.server.ts) return the criterion ids a submission satisfies.
export type Task = { id: string; title: string; criteria: Record<string, number> };
export const catalog: readonly (readonly Task[])[] = [
  [ // Chapter 1 Inbox = 15
    { id: "inbox.entry", title: "Delivery and entry point", criteria: { emailId: 2, deliveryId: 2, snapshotId: 2 } },
    { id: "inbox.identity", title: "Authentication and session", criteria: { authenticationId: 3, sessionId: 3 } },
    { id: "inbox.impact", title: "Unauthorized export", criteria: { databaseId: 3 } },
  ],
  [ // Chapter 2 Trail = 25
    { id: "trail.source", title: "Compromised account and source", criteria: { account: 4, sourceIp: 4 } },
    { id: "trail.session", title: "Replayed session and event", criteria: { sessionId: 4, eventId: 6 } },
    { id: "trail.corroboration", title: "Corroborating evidence", criteria: { mintEvent: 2, capture: 2, databaseAudit: 3 } },
  ],
  [ // Chapter 3 Insider = 25
    { id: "insider.suspect", title: "Insider identified", criteria: { employeeId: 8 } },
    { id: "insider.action", title: "Policy action identified", criteria: { actionId: 7 } },
    { id: "insider.corroboration", title: "Intent, access and approval evidence", criteria: { message: 4, access: 3, approval: 3 } },
  ],
  [ // Chapter 4 Containment = 20
    { id: "containment.timeline", title: "Incident timeline", criteria: { early: 2, middle: 2, late: 2 } },
    { id: "containment.identity", title: "Affected account and session", criteria: { account: 1, sessionId: 1 } },
    { id: "containment.immediate", title: "Parallel urgent response", criteria: { a1: 1, a2: 1, a3: 1, a4: 1 } },
    { id: "containment.recovery", title: "Ordered recovery", criteria: { set: 1, e1: 1, e2: 1, e3: 1, e4: 1, e5: 1 } },
    { id: "containment.evidence", title: "Supporting evidence", criteria: { forensic: 1, response: 1 } },
  ],
  [ // Chapter 5 Final Verdict = 15
    { id: "verdict.entry", title: "Entry chain", criteria: { emailId: 1, captureId: 1, campaign: 1 } },
    { id: "verdict.session", title: "Session and impact chain", criteria: { victimAccount: 1, sessionId: 1, exportId: 1 } },
    { id: "verdict.insider", title: "Internal assistance chain", criteria: { insiderId: 1, policyId: 1 } },
    { id: "verdict.evidence", title: "Evidence map", criteria: { entry: 1, session: 1, impact: 1, assistance: 1, response: 1 } },
    { id: "verdict.reasoning", title: "Hypothesis and contradiction", criteria: { hypothesis: 1, rejection: 1 } },
  ],
];
const sum = (task: Task) => Object.values(task.criteria).reduce((a, b) => a + b, 0);
export const taskMax = (task: Task) => sum(task);
export const chapterMax = (chapter: number) => catalog[chapter].reduce((n, task) => n + sum(task), 0);
export const criterionPoints = new Map<string, number>(catalog.flat().flatMap(task => Object.entries(task.criteria).map(([key, value]) => [`${task.id}:${key}`, value] as const)));
export const taskIds = (chapter: number) => catalog[chapter].map(task => task.id);
export const MAX_SCORED_ATTEMPTS = 60; // per chapter; the 3 s cooldown already limits a team to ~1200/hour. Caps answer-probing.
/** Criterion ids for the keys of `task` whose entry in `ok` is true. */
export const earnedIds = (task: string, ok: Record<string, boolean>) => Object.entries(ok).filter(([, pass]) => pass).map(([key]) => `${task}:${key}`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TaskDef = { schema: ZodType; grade: (value: any, variant: string) => string[] };
/** A task grader may only award its own catalog criteria, whatever it returns. */
function ownIds(taskId: string, ids: string[]) { return ids.filter(id => id.startsWith(`${taskId}:`) && criterionPoints.has(id)); }
/** Standalone task answer: strict per-task schema, then only that task's grader. Invalid or unknown input earns nothing. */
export function gradeTask(defs: Record<string, TaskDef>, taskId: string, answer: unknown, variant: string): string[] {
  const def = Object.hasOwn(defs, taskId) ? defs[taskId] : undefined;
  const parsed = def?.schema.safeParse(answer);
  if (!def || !parsed?.success) return [];
  try { return ownIds(taskId, def.grade(parsed.data, variant)); } catch { return []; }
}
/** Full-chapter compatibility: the already-validated chapter answer is graded by every task grader. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function gradeAll(defs: Record<string, TaskDef>, value: any, variant: string): string[] {
  try { return Object.entries(defs).flatMap(([taskId, def]) => ownIds(taskId, def.grade(value, variant))); } catch { return []; }
}
