// Round 2 event formats. The organizer picks one when starting; it is snapshotted on the session row and cannot change while it runs.
//   paper-40 (DEFAULT, unchanged): four strictly sequential chapters on a 40-minute clock (clock.ts), original chapter content, no typing.
//   open-60 (case document v2): 60 minutes, all four injects readable from the start until pens down, suggested pacing only,
//           Inject 2 accepts BLOCK commands (4 per team), everything else is written on paper.
// Pure module: safe on client and server. Contains no answer data.
export type Format = "paper-40" | "open-60";
export const DEFAULT_FORMAT: Format = "paper-40";
export const asFormat = (v: string | null | undefined): Format => (v === "open-60" ? "open-60" : "paper-40");

export const OPEN_MINUTES = 60;
export const OPEN_MS = OPEN_MINUTES * 60_000;
/** Suggested pacing for open-60 (10 + 12 + 25 + 10 + 3 buffer = 60). Not enforced: every inject stays open for the whole 60 minutes. */
export const OPEN_PACE = [
  { n: 1, title: "Alert at 2:14 AM", fromMin: 0, toMin: 10 },
  { n: 2, title: "Kill Switch", fromMin: 10, toMin: 22 },
  { n: 3, title: "Audit the AI", fromMin: 22, toMin: 47 },
  { n: 4, title: "The Three Calls", fromMin: 47, toMin: 57 },
] as const;
export const OPEN_BUFFER = { fromMin: 57, toMin: 60, label: "Buffer and pens down" } as const;

export const FORMAT_INFO: Record<Format, { label: string; minutes: number; rules: string[] }> = {
  "paper-40": { label: "40 minutes · sequential chapters (current default)", minutes: 40, rules: ["Chapters 1 to 4 open one after another at 0, 8, 20 and 30 minutes.", "A closed chapter cannot be reopened.", "Every answer is written on paper; nothing is typed."] },
  "open-60": { label: "60 minutes · four open injects (case document v2)", minutes: 60, rules: ["All four injects are readable from the start until pens down at 60:00.", "Suggested pacing 10 / 12 / 25 / 10 minutes plus a 3-minute buffer; nothing is locked by it.", "Only Inject 2 accepts typed commands (BLOCK <IP>, 4 attempts per team). Everything else is written on paper."] },
};

export type OpenClock = { phase: "not_started" } | { phase: "running"; elapsedMs: number; endsAt: number; suggested: 1 | 2 | 3 | 4 | null } | { phase: "complete"; endedEarly: boolean };
/** open-60 clock: a pure function of the persisted session row and server time, like paperClock. */
export function openClock(session: { startsAt: Date | null; endedAt: Date | null }, now: number = Date.now()): OpenClock {
  const start = session.startsAt?.getTime() ?? null;
  if (start === null || now < start) return { phase: "not_started" };
  const planned = start + OPEN_MS, stop = session.endedAt?.getTime(), end = stop === undefined ? planned : Math.min(planned, stop);
  if (now >= end) return { phase: "complete", endedEarly: end < planned };
  const elapsedMs = now - start, p = OPEN_PACE.find(x => elapsedMs < x.toMin * 60_000);
  return { phase: "running", elapsedMs, endsAt: end, suggested: p ? p.n : null };
}
