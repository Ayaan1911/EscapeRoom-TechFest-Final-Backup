export type InboxEmail = {
  id: string; sender: string; address: string; recipient: string; subject: string;
  timestamp: string; body: string; links: string[];
  attachments: { id: string; name: string; type: string; size: string; text?: string }[];
  headers: Record<string, string>;
};
export type InboxArtifact = {
  id: string; kind: "gateway" | "authentication" | "database"; title: string;
  facts: Record<string, string>;
};
export type InboxSnapshot = {
  id: string; url: string; title: string; campaign: string; capturedAt: string;
  redirectFrom: string; formAction: string; recipient: string;
};
export type InboxEvidence = {
  caseId: string; recipient: string; emails: InboxEmail[];
  artifacts: InboxArtifact[]; snapshot: InboxSnapshot;
};
