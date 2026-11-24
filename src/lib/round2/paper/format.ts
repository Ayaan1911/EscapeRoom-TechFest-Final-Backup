// Round 2 has ONE format: GHOST RETURNS Part A, 60 minutes, all four injects open from the start until pens down.
// Suggested pacing is advice only. Pure module: safe on client and server. Contains no answer data.
//
// Historical compatibility (read-only): the retired 40-minute sequential format stored sessions with format NULL or "paper-40".
// Such a row is never resumed or restarted; participants see Round 2 as closed and its records are left untouched
// (see docs/ghost404-round2-open60.md, "Retired 40-minute format").
export const FORMAT = "open-60" as const;
export const FORMAT_LABEL = "GHOST RETURNS · Part A · 60-minute investigation";
export const OPEN_MINUTES = 60;
export const OPEN_MS = OPEN_MINUTES * 60_000;
/** Suggested pacing (10 + 12 + 25 + 10 + 3 buffer = 60). Not enforced: every inject stays open for the whole 60 minutes. */
export const OPEN_PACE = [
  { n: 1, title: "Alert at 2:14 AM", fromMin: 0, toMin: 10 },
  { n: 2, title: "Kill Switch", fromMin: 10, toMin: 22 },
  { n: 3, title: "Audit the AI", fromMin: 22, toMin: 47 },
  { n: 4, title: "The Three Calls", fromMin: 47, toMin: 57 },
] as const;
export const OPEN_BUFFER = { fromMin: 57, toMin: 60, label: "Buffer and pens down" } as const;
export const RULES = [
  "60 minutes on one organizer-started server clock.",
  "All four injects are open from the start and stay readable until pens down.",
  "Suggested pacing 10 / 12 / 25 / 10 minutes plus a 3-minute buffer; nothing is locked by it.",
  "Only Inject 2 accepts typed commands (BLOCK <ip address>, 4 attempts per team). Everything else is written on paper.",
  "No external AI assistance.",
] as const;
export const POINTS = { inject1: 15, inject2: 15, inject3: 15, inject4: 15, total: 60 } as const;

/** A session row from the retired 40-minute format (started before this format existed, or explicitly "paper-40"). */
export const isRetiredSession = (row: { startsAt: Date | null; format?: string | null }) => row.startsAt !== null && row.format !== FORMAT;

export type OpenClock = { phase: "not_started" } | { phase: "running"; elapsedMs: number; endsAt: number; suggested: 1 | 2 | 3 | 4 | null } | { phase: "complete"; endedEarly: boolean };
/** The Round 2 clock: a pure function of the persisted session row and server time. */
export function openClock(session: { startsAt: Date | null; endedAt: Date | null }, now: number = Date.now()): OpenClock {
  const start = session.startsAt?.getTime() ?? null;
  if (start === null || now < start) return { phase: "not_started" };
  const planned = start + OPEN_MS, stop = session.endedAt?.getTime(), end = stop === undefined ? planned : Math.min(planned, stop);
  if (now >= end) return { phase: "complete", endedEarly: end < planned };
  const elapsedMs = now - start, p = OPEN_PACE.find(x => elapsedMs < x.toMin * 60_000);
  return { phase: "running", elapsedMs, endsAt: end, suggested: p ? p.n : null };
}
/** GHOST_404 taunts for the projector, shown briefly at each suggested transition and at pens down. Fixed text; no state. */
export const TAUNTS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "You found me at 2:14. Let's see if you can keep up.",
  2: "Ten connections. Two are mine. Careful which doors you close.",
  3: "Your AI says I'm gone. It is very confident. It is also wrong about something.",
  4: "The phones are ringing. Everyone wants answers. Choose your words carefully.",
  5: "Pens down. The jury will decide whether you really caught me.",
};
export const TAUNT_WINDOW_MS = 40_000;
