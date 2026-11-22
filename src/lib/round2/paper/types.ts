// Shapes of the PARTICIPANT-visible chapter content (safe to import anywhere). Contains no answer data.
export type Row = Record<string, string>;
export type Ch1 = {
  kind: "alert";
  alert: { id: string; severity: string; host: string; time: string; summary: string };
  options: { letter: string; text: string }[];
  tabs: { id: string; title: string; columns: { key: string; label: string }[]; rows: Row[]; note?: string }[];
  chat: { from: "ravi" | "responder"; text: string }[];
};
export type Conn = { n: number; ip: string; process: string; country: string; sent: string; received: string; duration: string; pattern: string; series: number[] };
export type Ch2 = { kind: "network"; brief: string; connections: Conn[] };
export type Ch3 = {
  kind: "audit";
  claims: { n: number; text: string; confidence: string }[];
  timeline: { time: string; event: string; note?: string }[];
  records: { id: string; source: string; text: string }[];
};
export type Ch4 = {
  kind: "calls";
  situation: { label: string; value: string }[];
  calls: { n: number; title: string; question: string; pressure: string; options: { letter: string; text: string }[] }[];
  statements: { n: number; text: string }[];
};
export type ChapterContent = Ch1 | Ch2 | Ch3 | Ch4;
export type ChapterView = { n: 1 | 2 | 3 | 4; title: string; endsAt: string; content: ChapterContent };
export type PaperStatus = {
  serverNow: string;
  phase: "not_started" | "running" | "complete";
  endsAt: string | null;
  endedEarly?: boolean;
  chapter: ChapterView | null;
  rail: { n: number; title: string; state: "done" | "active" | "locked" }[];
};
