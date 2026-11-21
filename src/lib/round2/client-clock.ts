// Pure helpers for the Round 2 display clock. The browser clock is only ever a visual estimate: it can DISABLE controls early,
// but permission to act always comes from the server's `availability` and the server re-checks every submission.
export type Avail = "open" | "not_released" | "closed";
/** Offset to add to Date.now() to estimate server time. Uses the request midpoint so latency does not skew it. */
export const clockOffset = (serverNow: number, sentAt: number, receivedAt: number) => serverNow - Math.round((sentAt + receivedAt) / 2);
export const msUntil = (targetIso: string | null, nowMs: number) => (targetIso === null ? null : Date.parse(targetIso) - nowMs);
export function formatClock(ms: number | null) {
  if (ms === null || !Number.isFinite(ms)) return "--:--";
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}
/** Server says open AND the local estimate has not passed the close time. A stale "open" can never outlive its deadline on screen. */
export function effectiveAvailability(server: Avail, closesAtIso: string | null, nowMs: number): Avail {
  if (server !== "open") return server;
  return closesAtIso !== null && nowMs >= Date.parse(closesAtIso) ? "closed" : "open";
}
/** When to re-ask the server about a scheduled boundary: just after it, so the answer reflects the new phase. */
export const refreshDelay = (nextAtIso: string | null, nowMs: number) => (nextAtIso === null ? null : Math.max(250, Date.parse(nextAtIso) - nowMs + 400));
export const EVENT_TEXT: Record<string, string> = { "incident-2-release": "Incident 2 releases", "incident-3-release": "Incident 3 releases", "incident-4-release": "Incident 4 releases", "part-b-opens": "Part A closes and the Digital Tribunal opens", "round-ends": "Round 2 ends", "incident-1-release": "Incident 1 releases" };
