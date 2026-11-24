// Client-safe constants for the three-pair Evidence Wall. Folder titles describe WHAT each folder holds (no answers, no pairing information).
export const PAIRS = ["A", "B", "C"] as const;
export type Pair = (typeof PAIRS)[number];
export type PairState = Record<Pair, boolean>;
export const FOLDERS: Record<Pair, { title: string; blurb: string; kinds: ("message" | "access" | "policy" | "approval" | "timeline" | "custody")[] }> = {
  A: { title: "Access and custody", blurb: "Which devices and consoles each person could reach, and who held what.", kinds: ["access", "custody"] },
  B: { title: "Policy changes and approvals", blurb: "What was changed in the identity policy, and what had been approved.", kinds: ["policy", "approval"] },
  C: { title: "Messages and timeline", blurb: "What was said around the change, and the order things happened in.", kinds: ["message", "timeline"] },
};
