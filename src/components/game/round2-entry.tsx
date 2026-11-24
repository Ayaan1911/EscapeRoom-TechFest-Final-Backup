// This team's own Round 2 state on the Round 1 dashboard. Server-provided; the Round 2 pages and APIs enforce access again on their own.
export type Round2State = { decided: boolean; role: "none" | "finalist" | "standby"; phase: "not_started" | "running" | "complete" };
export function Round2Entry({ state }: { state: Round2State }) {
  if (state.role === "finalist") {
    if (state.phase === "running") return <section className="r2e is-go" aria-labelledby="r2e-h"><div><span className="k-eyebrow">ROUND 2 · GHOST RETURNS</span><h2 id="r2e-h">Round 2 is live</h2><p>The shared 60-minute clock is running. All four injects are open.</p></div><a className="k-btn k-btn-primary k-btn-lg" href="/round2">Enter Round 2</a></section>;
    if (state.phase === "complete") return <section className="r2e" aria-labelledby="r2e-h"><div><span className="k-eyebrow">ROUND 2 · GHOST RETURNS</span><h2 id="r2e-h">Round 2 is over</h2><p>Pens down. The jury will take it from here.</p></div></section>;
    return <section className="r2e is-wait" aria-labelledby="r2e-h"><div><span className="k-eyebrow">ROUND 2 · GHOST RETURNS</span><h2 id="r2e-h" role="status">Qualified for Round 2 — Waiting for Organizer</h2><p>Keep this page open. An <b>Enter Round 2</b> button appears here the moment the organizer starts the shared 60-minute clock. Nothing opens before then.</p></div></section>;
  }
  if (state.role === "standby") return <section className="r2e" aria-labelledby="r2e-h"><div><span className="k-eyebrow">ROUND 2 · GHOST RETURNS</span><h2 id="r2e-h">Reserve team for Round 2</h2><p>Stay near the organizers. A reserve team enters only if an organizer promotes it.</p></div></section>;
  if (state.decided) return <section className="r2e" aria-labelledby="r2e-h"><div><span className="k-eyebrow">ROUND 2 · GHOST RETURNS</span><h2 id="r2e-h">Qualification review complete</h2><p>The organizers announce the Round 2 finalists. Your Round 1 result is saved below.</p></div></section>;
  return null;
}
