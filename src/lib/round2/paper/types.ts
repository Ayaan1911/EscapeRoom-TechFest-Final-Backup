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

// ---- Case document v2 ("open-60" format): participant-visible inject content. Still contains NO answer data. ----
export type I1 = {
  kind: "i1";
  alert: { id: string; severity: string; host: string; user: string; observed: string };
  processes: { pid: string; name: string; user: string; started: string; cpu: string }[];
  logins: { time: string; account: string; type: string; result: string }[];
  network: { time: string; dest: string; traffic: string }[];
  mail: { id: string; when: string; from: string; subject: string; attachment?: string; size?: string; note?: string }[];
  chat: { from: "ravi" | "itdesk"; text: string }[];
  options: { letter: string; text: string }[];
  paper: string[];
};
export type I2 = { kind: "i2"; brief: string; connections: Conn[]; syntax: string; maxAttempts: number; paper: string[] };
export type I3 = {
  kind: "i3";
  claims: { n: number; text: string; confidence: string }[];
  timeline: { n: number; time: string; tz: "IST"; event: string }[];
  records: { id: string; source: string; lines: string[]; tz: "IST" | "UTC" }[];
  paper: string[];
};
export type I4 = {
  kind: "i4";
  status: { label: string; value: string }[];
  calls: { n: number; title: string; ceo: string; options: { letter: string; text: string }[] }[];
  statements: { n: number; text: string }[];
  paper: string[];
};
export type InjectContent = I1 | I2 | I3 | I4;
export type InjectView = { n: 1 | 2 | 3 | 4; title: string; pace: { fromMin: number; toMin: number }; content: InjectContent };
/** open-60 participant status: every inject is readable while the 60-minute clock runs; nothing is returned before the start or after pens down. */
export type OpenStatus = {
  format: "open-60";
  serverNow: string;
  phase: "not_started" | "running" | "complete";
  startsAt: string | null;
  endsAt: string | null;
  endedEarly?: boolean;
  injects: InjectView[] | null;
};
/** Inject 2 terminal state for the signed-in team. Never contains the target list. */
export type TerminalState = {
  open: boolean;
  max: number;
  remaining: number;
  locked: boolean;
  allCaught: boolean;
  attempts: { seq: number; ip: string; result: "caught" | "cleared" | "repeat"; at: string }[];
  keyReady: boolean;
};
