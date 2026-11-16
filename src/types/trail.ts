export type TrailEvent = {
  id: string; timestamp: string; account: string; sourceIp: string; eventType: string;
  result: "success" | "failure" | "challenge"; method: string; device: string;
  sessionId: string; conditionalAccess: string; correlationId: string; details: string;
};
export type TrailArtifact = { id: string; title: string; facts: Record<string, string> };
export type TrailEvidence = { caseId: string; rows: TrailEvent[]; artifacts: TrailArtifact[] };
