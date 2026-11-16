// Independent expectations used only by tests, never imported by application code.
export const inboxAnswers = {
  A: { kind: "conclusion", emailId: "MAIL-A-02", deliveryId: "CLICK-A-01", snapshotId: "CAP-A-17", authenticationId: "AUTH-A-02", databaseId: "DB-A-01", sessionId: "nx-a-72c" },
  B: { kind: "conclusion", emailId: "MAIL-B-04", deliveryId: "CLICK-B-01", snapshotId: "CAP-B-17", authenticationId: "AUTH-B-01", databaseId: "DB-B-02", sessionId: "nx-b-19f" },
  C: { kind: "conclusion", emailId: "MAIL-C-01", deliveryId: "CLICK-C-01", snapshotId: "CAP-C-17", authenticationId: "AUTH-C-02", databaseId: "DB-C-01", sessionId: "nx-c-84d" },
} as const;
export const tamperAnswer = (variant: string) => ({ emailId: `MAIL-${variant}-05`, artifactId: `ATT-${variant}-05`, technique: "instruction-override" });
