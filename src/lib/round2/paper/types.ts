// Shapes of the PARTICIPANT-visible Round 2 content (safe to import anywhere). Contains no answer data.
// Round 2 has one format: GHOST RETURNS Part A, 60 minutes, four open injects (case document v2).

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
/** One Kill Switch monitor row (Inject 2 document). Deliberately carries no classification. */
export type KConn = { n: number; ip: string; process: string; country: string; sent: string; received: string; time: string; ticket: string; description: string };
export type Ticket = { id: string; title: string; process?: string; details: string[]; created: string; status: string };
export type I2 = { kind: "i2"; snapshot: string; brief: string; connections: KConn[]; tickets: Ticket[]; ticketFooter: string; maxAttempts: number; paper: string[] };
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
/** Participant status: every inject is readable while the 60-minute clock runs; nothing is returned before the start or after pens down.
 *  `retired` marks a historical session from the retired 40-minute format: it is shown as closed and can never resume. */
export type OpenStatus = {
  format: "open-60";
  serverNow: string;
  phase: "not_started" | "running" | "complete";
  startsAt: string | null;
  endsAt: string | null;
  endedEarly?: boolean;
  retired?: boolean;
  injects: InjectView[] | null;
};
export type AttemptResult = "caught" | "cleared";
/** Kill Switch terminal state for the signed-in team. Only the team's own attempts (and the message each one earned); never the target list. */
export type TerminalState = {
  open: boolean;
  max: number;
  remaining: number;
  locked: boolean;
  lockReason: "none" | "contained" | "exhausted" | "closed" | "no-key";
  contained: number;
  attempts: { seq: number; ip: string; result: AttemptResult; message: string; at: string }[];
};
