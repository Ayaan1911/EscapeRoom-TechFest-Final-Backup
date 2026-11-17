export const verdictRoles = ["entry", "session", "impact", "assistance", "response"] as const;
export type VerdictRole = typeof verdictRoles[number];
export type VerdictRecord = { id: string; chapter: string; source: string; title: string; facts: Record<string, string> };
export type VerdictEvidence = {
  caseId: string; summary: string[];
  records: VerdictRecord[];
  emails: { id: string; subject: string; sender: string }[];
  accounts: string[]; sessions: string[];
  captures: { id: string; campaign: string; url: string }[];
  exports: { id: string; description: string }[];
  suspects: { id: string; name: string; role: string }[];
  policies: { id: string; description: string }[];
  hypotheses: { id: string; title: string; explanation: string }[];
  timeline: { id: string; timestamp: string; title: string; sourceIds: string[] }[];
};
