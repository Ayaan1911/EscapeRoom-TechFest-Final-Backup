// Pure event-stage pipeline (unit-tested). Every stage state comes from server data the page already loaded; nothing is assumed done.
export type StageState = "done" | "active" | "pending" | "blocked";
export type Stage = { id: string; label: string; state: StageState; status: string; href: string };
export type StageInput = {
  teams: number; r1: "waiting" | "active" | "finished"; qualified: boolean; enrolled: number;
  r2: "not_started" | "running" | "complete"; r2Retired: boolean; marked: number; finalists: number; published: boolean;
};

export function eventStages(s: StageInput): Stage[] {
  const r2Started = s.r2 !== "not_started" && !s.r2Retired;
  return [
    { id: "prep", label: "Event preparation", href: "#teams", ...(s.r1 !== "waiting" ? { state: "done", status: `${s.teams} teams registered` } : s.teams ? { state: "active", status: `${s.teams} teams registered · ready` } : { state: "blocked", status: "No teams registered" }) },
    { id: "r1", label: "Round 1", href: "#round-control", ...(s.r1 === "finished" ? { state: "done", status: "Finished" } : s.r1 === "active" ? { state: "active", status: "Running" } : { state: "pending", status: "Waiting to start" }) },
    { id: "qual", label: "Qualification review", href: "#qualification", ...(s.qualified ? { state: "done", status: "Organizer confirmed" } : s.r1 === "finished" ? { state: "active", status: "Awaiting confirmation" } : { state: "pending", status: "After Round 1" }) },
    { id: "r2ready", label: "Round 2 ready", href: "/admin/round2", ...(s.r2Retired ? { state: "blocked", status: "Retired session in database" } : r2Started ? { state: "done", status: `${s.enrolled} finalists` } : !s.qualified ? { state: "pending", status: "Needs confirmed qualification" } : s.enrolled ? { state: "active", status: `${s.enrolled} finalists enrolled` } : { state: "active", status: "Enroll finalists" }) },
    { id: "r2run", label: "Round 2 running", href: "/admin/round2", ...(s.r2Retired || !r2Started ? { state: "pending", status: "60 minutes · not started" } : s.r2 === "running" ? { state: "active", status: "Clock running" } : { state: "done", status: "Pens down" }) },
    { id: "mark", label: "Jury marking", href: "/admin/round2#marking", ...(s.published ? { state: "done", status: "Locked" } : r2Started && s.r2 === "complete" ? { state: "active", status: `${s.marked} of ${s.finalists} teams fully marked` } : { state: "pending", status: "After pens down" }) },
    { id: "results", label: "Results", href: "/admin/leaderboard", ...(s.published ? { state: "done", status: "Published" } : { state: "pending", status: "Not published" }) },
  ];
}
export const STATE_WORD: Record<StageState, string> = { done: "Done", active: "Now", pending: "Pending", blocked: "Blocked" };
