// Server-controlled Round 2 clock. Pure functions of (persisted session row, server `now`): nothing is held in memory, so it survives restarts.
export const PART_A_MS = 25 * 60_000;
export const ROUND_MS = 50 * 60_000;
export const INCIDENT_RELEASE_MS: readonly number[] = [0, 6, 12, 18].map(m => m * 60_000);
export type R2Session = { startsAt: Date | null; endedAt: Date | null };
export type R2Phase = "not_started" | "part_a" | "part_b" | "finished";
export type Availability = "open" | "not_released" | "closed";

export function r2Clock(session: R2Session, now: number = Date.now()) {
  const start = session.startsAt?.getTime() ?? null;
  const hardEnd = start === null ? null : Math.min(start + ROUND_MS, session.endedAt?.getTime() ?? Infinity);
  const phase: R2Phase = start === null || now < start ? "not_started" : now >= hardEnd! ? "finished" : now < start + PART_A_MS ? "part_a" : "part_b";
  const elapsedMs = phase === "not_started" || start === null ? 0 : Math.min(now - start, hardEnd! - start);
  const releasedIncidents = phase === "not_started" ? [] : INCIDENT_RELEASE_MS.flatMap((ms, i) => (phase !== "part_a" || elapsedMs >= ms) ? [i + 1] : []);
  const upcoming = start === null || phase === "finished" ? [] : [...INCIDENT_RELEASE_MS.map((ms, i) => ({ at: start + ms, event: `incident-${i + 1}-release` })), { at: start + PART_A_MS, event: "part-b-opens" }, { at: hardEnd!, event: "round-ends" }].filter(e => e.at > now);
  const next = upcoming.sort((a, b) => a.at - b.at)[0] ?? null;
  // Part B content exists only if the round actually reached minute 25 (an early organizer stop in Part A never exposes it).
  const partBReleased = start !== null && hardEnd !== null && hardEnd >= start + PART_A_MS && (phase === "part_b" || phase === "finished");
  return {
    phase, elapsedMs, releasedIncidents, partBReleased,
    startsAt: session.startsAt, partAClosesAt: start === null ? null : new Date(start + PART_A_MS), endsAt: hardEnd === null ? null : new Date(hardEnd),
    nextEvent: next ? { event: next.event, at: new Date(next.at), inMs: next.at - now } : null,
  };
}
export type R2Clock = ReturnType<typeof r2Clock>;
/** Is a task of `part`/`unit` (1-based incident or challenge number) usable now? Part A tasks stay open (revisitable) until minute 25; Part B opens at minute 25. */
export function availability(task: { part: "A" | "B"; unit: number }, clock: R2Clock): Availability {
  if (clock.phase === "finished") return "closed";
  if (task.part === "A") return clock.phase === "part_a" ? (clock.releasedIncidents.includes(task.unit) ? "open" : "not_released") : clock.phase === "part_b" ? "closed" : "not_released";
  return clock.phase === "part_b" ? "open" : "not_released";
}
/** Content visibility: released material stays readable (read-only) after its part closes; unreleased material is never visible. */
export function visible(task: { part: "A" | "B"; unit: number }, clock: R2Clock) {
  return task.part === "A" ? clock.releasedIncidents.includes(task.unit) : clock.partBReleased;
}
