// GHOST RETURNS (paper edition) clock. Pure function of (persisted R2Session row, server `now`): nothing is held in memory, so a restart
// or a reconnect always lands on the same chapter. The browser clock is never an input.
export const CHAPTERS = [
  { n: 1, title: "Alert at 2:14 AM", fromMin: 0, toMin: 8 },
  { n: 2, title: "Kill Switch", fromMin: 8, toMin: 20 },
  { n: 3, title: "Audit the AI", fromMin: 20, toMin: 30 },
  { n: 4, title: "The Three Calls", fromMin: 30, toMin: 40 },
] as const;
export const INVESTIGATION_MS = 40 * 60_000;
export type ChapterNo = 1 | 2 | 3 | 4;
export type PaperSession = { startsAt: Date | null; endedAt: Date | null };
export type PaperClock =
  | { phase: "not_started" }
  | { phase: "running"; chapter: ChapterNo; elapsedMs: number; chapterEndsAt: number; endsAt: number }
  | { phase: "complete"; endedEarly: boolean };

export function paperClock(session: PaperSession, now: number = Date.now()): PaperClock {
  const start = session.startsAt?.getTime() ?? null;
  if (start === null || now < start) return { phase: "not_started" };
  const plannedEnd = start + INVESTIGATION_MS, stop = session.endedAt?.getTime();
  const end = stop === undefined ? plannedEnd : Math.min(plannedEnd, stop);
  if (now >= end) return { phase: "complete", endedEarly: end < plannedEnd };
  const elapsedMs = now - start;
  const c = CHAPTERS.find(ch => elapsedMs < ch.toMin * 60_000)!;
  return { phase: "running", chapter: c.n, elapsedMs, chapterEndsAt: Math.min(start + c.toMin * 60_000, end), endsAt: end };
}
/** Fixed transition schedule for an organizer (absolute instants), derived from the start only. */
export function schedule(startsAt: Date) {
  const t = startsAt.getTime();
  return [...CHAPTERS.map(c => ({ at: t + c.fromMin * 60_000, event: c.n === 1 ? "Chapter 1 opens" : `Chapter ${c.n} opens (Chapter ${c.n - 1} closes)` })), { at: t + INVESTIGATION_MS, event: "PENS DOWN: all chapters close" }];
}
/** GHOST_404 taunts shown on the projector for the first 40 s after each transition. Fixed text, chosen by chapter: no state to store. */
export const TAUNTS: Record<ChapterNo | 5, string> = {
  1: "You found me at 2:14. Let's see if you can keep up.",
  2: "Ten connections. Two are mine. Careful which doors you close.",
  3: "Your AI says I'm gone. It is very confident. It is also wrong about something.",
  4: "The phones are ringing. Everyone wants answers. Choose your words carefully.",
  5: "Pens down. The jury will decide whether you really caught me.",
};
export const TAUNT_WINDOW_MS = 40_000;
