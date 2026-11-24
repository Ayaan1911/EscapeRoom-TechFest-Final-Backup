// Pure projector scene selection (unit-tested). The scene is derived ONLY from server state: round clocks, the organizer's qualification
// confirmation, Round 2 enrollment and publication. Nothing here is a timer; the client only counts down to a server deadline.
export type Scene = "standby" | "r1-running" | "r1-complete" | "intermission" | "r2-waiting" | "r2-running" | "pens-down" | "results";
export type R1Status = "waiting" | "active" | "finished";
export type R2Phase = "not_started" | "running" | "complete";

export function sceneOf(s: { r1: R1Status; qualified: boolean; enrolled: number; r2: R2Phase; published: boolean }): Scene {
  if (s.r2 === "complete") return s.published ? "results" : "pens-down";
  if (s.r2 === "running") return "r2-running";
  if (s.r1 === "waiting") return "standby";
  if (s.r1 === "active") return "r1-running";
  if (!s.qualified) return "r1-complete";
  return s.enrolled > 0 ? "r2-waiting" : "intermission";
}

/** What the organizer may put on the public screen. Each is OFF until switched on, and every switch is audited. */
export const BROADCAST_KEYS = ["standings", "finalists"] as const;
export type BroadcastKey = (typeof BROADCAST_KEYS)[number];
export const BROADCAST_LABEL: Record<BroadcastKey, string> = { standings: "Round 1 standings", finalists: "Round 2 finalist names" };
