export type InsiderSuspect = { id: string; name: string; email: string; role: string; privileges: string; responsibilities: string; device: string };
export type InsiderRecord = { id: string; kind: "message" | "access" | "policy" | "approval" | "timeline" | "custody"; timestamp: string; title: string; employees: string[]; provenance: string; facts: Record<string, string> };
export type InsiderDossier = { caseId: string; suspects: InsiderSuspect[]; records: InsiderRecord[] };
