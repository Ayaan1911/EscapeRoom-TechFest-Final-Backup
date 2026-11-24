export type ContainmentRecord = { id: string; title: string; timestamp: string; description: string; sourceIds: string[]; principal: string; sessionId: string; confidence: string };
export type ResponseOption = { id: string; title: string; detail: string };
export type ContainmentCctv = { id: string; variant: string; timestamp: string; area: string; device: string; employeeId: string; sourceId: string; custodyId: string; observation: string; custody: string };
export type ContainmentEvidence = {
  caseId: string; account: string; sessionId: string; checkpoint: string;
  events: ContainmentRecord[]; observations: ContainmentRecord[];
  artifacts: { id: string; title: string; facts: Record<string, string> }[];
  immediateOptions: ResponseOption[]; recoveryOptions: ResponseOption[];
  cctvReference: { id: string };
};
