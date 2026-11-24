import { redirect } from "next/navigation";
import Link from "next/link";
import { session } from "@/lib/auth";
import { db } from "@/lib/db";
import { recentAudit } from "@/lib/game/service";
import { status, titles } from "@/lib/game/engine";
import { OsHeader } from "@/components/ui/os-header";
import { ConfirmForm } from "@/components/ui/confirm";
import { signOutAdmin } from "../organizer/login/actions";
import { administer } from "./actions";
import { qualificationReport } from "@/lib/game/qualification.server";
import { QualificationBoard } from "@/components/game/qualification-board";
import { paperTiming } from "@/lib/round2/paper/service.server";
import { markingBoard } from "@/lib/round2/paper/marking.server";
import { eventStages } from "@/lib/game/stages";
import { CcNav, Panel, Pill, Stat, StagePipeline } from "@/components/admin/cc";
import { LiveRefresh, ServerClock } from "@/components/admin/live";
import { TeamTable, type TeamRow } from "@/components/admin/team-table";

export const dynamic = "force-dynamic";
/** Server render time (this is a dynamic server page; the value is sent to the client as the freshness stamp). */
const renderTime = () => Date.now();
const R1_TONE = { waiting: "idle", active: "live", finished: "ok" } as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  if (!await session("admin")) redirect("/organizer/login");
  const report = await qualificationReport();
  if (!report) redirect("/organizer/login");
  const now = renderTime(), round = report.round, state = status(round) as "waiting" | "active" | "finished";
  const [logs, r2, marking, finalists, sessions] = await Promise.all([
    recentAudit(), paperTiming(), markingBoard(),
    db.r2Finalist.findMany({ select: { teamId: true, status: true } }),
    db.teamSession.findMany({ where: { role: "team", expiresAt: { gt: new Date(now) } }, select: { teamId: true } }),
  ]);
  const params = await searchParams, signedIn = new Set(sessions.map(s => s.teamId));
  const rows = report.rows, complete = rows.filter(row => row.completedAt !== null).length;
  const enrolled = finalists.filter(f => f.status === "active").length;
  const stages = eventStages({ teams: rows.length, r1: state, qualified: !!report.confirmation && state === "finished", enrolled, r2: r2.phase, r2Retired: r2.retired, marked: marking.complete, finalists: marking.rows.length, published: !!marking.publishedAt });
  const next = stages.find(s => s.state === "active" || s.state === "blocked");
  const teamRows: TeamRow[] = rows.map(row => {
    const done = row.progress.chapters.map(c => c.completedAt !== null), firstOpen = done.indexOf(false), f = finalists.find(x => x.teamId === row.id), m = marking.rows.find(x => x.teamId === row.id);
    return { id: row.id, name: row.name, variant: row.variant, participants: JSON.parse(row.participants) as string[], rank: row.rank, total: row.total, raw: row.rawScores,
      hints: row.progress.chapters.map(c => c.hints), deductions: row.deductions, bonus: row.bonus, completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
      chapter23: row.chapter23, selection: row.selection, overrides: row.overrides, done, current: state === "waiting" || firstOpen < 0 ? null : titles[firstOpen], signedIn: signedIn.has(row.id),
      r2: f ? { status: f.status === "active" ? "Finalist" : f.status === "standby" ? "Standby" : "Withdrawn", attempts: m && marking.started ? m.terminal.attempts : null } : null };
  });
  const funnel = titles.map((t, i) => ({ t, done: rows.filter(r => r.progress.chapters[i].completedAt !== null).length, now: state !== "active" ? 0 : teamRows.filter(r => r.current === t).length }));
  const max = Math.max(1, rows.length);
  return <div className="site-shell cc-shell">
    <OsHeader area="Control center"><form action={signOutAdmin}><button className="k-btn k-btn-primary">Log out</button></form></OsHeader>
    <CcNav current="/admin" />
    <main className="cc-main">
      <header className="cc-hero">
        <div className="cc-hero-id"><span className="cc-eyebrow">OPERATION GHOST_404 · EVENT CONTROL · ROUND 1 / {state.toUpperCase()}</span><h1>Event operations</h1>
          <p>{round.startsAt ? `Round 1 started ${round.startsAt.toISOString().slice(11, 16)} UTC · deadline ${round.deadline!.toISOString().slice(11, 16)} UTC` : "Round 1 waits for an organizer start · fixed 60-minute clock"}</p>
          <LiveRefresh renderedAt={now} /></div>
        <div className="cc-hero-clock">{state === "active" && round.deadline ? <><small>ROUND 1 LEFT</small><ServerClock deadline={round.deadline.toISOString()} serverNow={now} label="Round 1 time remaining" /></>
          : r2.phase === "running" && r2.endsAt ? <><small>ROUND 2 LEFT</small><ServerClock deadline={r2.endsAt} serverNow={now} label="Round 2 time remaining" /></>
          : <><small>STATUS</small><Pill tone={R1_TONE[state]}>{state === "waiting" ? "Not started" : state === "active" ? "Round 1 running" : r2.phase === "complete" ? "Round 2 pens down" : "Round 1 closed"}</Pill></>}</div>
        <dl className="cc-stats"><Stat label="Teams" value={rows.length} sub="registered" /><Stat label="Signed in" value={signedIn.size} sub="team sessions" /><Stat label="Finished R1" value={complete} sub={`${rows.length - complete} in progress`} /><Stat label="Finalists" value={enrolled} sub={marking.publishedAt ? "results published" : `${marking.complete} fully marked`} /></dl>
      </header>
      <StagePipeline stages={stages} />
      {params.error && <p role="alert" className="cc-alert">{params.error}</p>}
      {params.notice && <p role="status" className="cc-notice">{params.notice}</p>}

      <div className="cc-grid">
        <Panel id="round-control" eyebrow={next ? `NOW · ${next.label.toUpperCase()}` : "EVENT COMPLETE"} title={state === "waiting" ? "Start Round 1" : state === "active" ? "Round 1 is running" : next ? next.status : "Results published"} className="cc-next">
          {state === "waiting" ? <>
            <p className="cc-lede">Starting fixes the single 60-minute deadline for every team. It cannot be restarted or extended from here.</p>
            <ConfirmForm action={administer} title="Start the 60-minute round?" confirmLabel="Confirm start" details={<><p>All teams will be able to begin Chapter 1 immediately and the shared 60-minute clock starts now.</p><p>This cannot be undone or restarted.</p></>}>
              <input type="hidden" name="action" value="start" />
              <button className="k-btn k-btn-primary k-btn-lg">Start 60-minute round</button>
            </ConfirmForm></>
          : state === "active" ? <p className="cc-lede">Teams are working. Watch chapter progress beside this panel; the team table shows who is stuck. Stopping early is in the danger zone at the bottom.</p>
          : <><p className="cc-lede">{next?.id === "qual" ? "Round 1 is closed and scores are saved. Review the Top 10, then confirm to advance them to Round 2. Round 2 starts separately." : next?.id === "mark" ? "Pens are down. Enter the jury's paper marks; the Kill Switch score comes from the terminal." : next ? "Round 2 is run from its own control room." : "Every stage is complete."}</p>
            {next && <Link className="cc-btn cc-btn-primary cc-btn-lg" href={next.href}>{next.id === "qual" ? "Review Top 10 Teams" : next.id === "mark" ? "Open jury marking" : next.id === "results" ? "Open leaderboard" : "Open Round 2 control"}</Link>}</>}
          <div className="cc-actions"><a className="k-btn" href="/api/admin/scores">Export scores as CSV</a><Link className="k-btn" href="/admin/leaderboard">Leaderboard</Link></div>
        </Panel>
        <Panel id="r1-progress" eyebrow="ROUND 1 · LIVE PROGRESS" title="Chapter progress" aside={<span className="cc-legend"><i className="is-done" />completed{state === "active" && <><i className="is-now" />working on it now</>}</span>}>
          <ol className="cc-funnel" aria-label="Teams per chapter">{funnel.map(f => <li key={f.t}><span>{f.t}</span>
            <span className="cc-bar" aria-hidden="true"><i className="is-done" style={{ width: `${(f.done / max) * 100}%` }} /><i className="is-now" style={{ width: `${(f.now / max) * 100}%` }} /></span>
            <b>{f.done}<small> done</small>{f.now ? <> · {f.now}<small> now</small></> : null}</b></li>)}</ol>
          <p className="cc-note">Counts of {rows.length} teams, from saved results only.</p>
        </Panel>
      </div>

      <Panel id="teams" eyebrow="TEAM MANAGEMENT" title="Teams" aside={<span className="cc-dim">No access codes are shown here.</span>}>
        <TeamTable rows={teamRows} provisional={report.label === "PROVISIONAL"} live={state === "active"} />
      </Panel>

      <QualificationBoard report={report} enrolled={enrolled} />

      <div className="cc-grid cc-grid-3">
        <Panel id="kits" eyebrow="EVENT MATERIALS" title="Kits and screens">
          <ul className="cc-links">
            <li><Link href="/admin/projector">Projector broadcast</Link><span>Full-screen event scenes for the hall screen</span></li>
            <li><Link href="/admin/round2/print">Round 2 printables</Link><span>Answer sheets, slips, score sheet</span></li>
            <li><a href="/admin/inbox-kit">Chapter 1 evidence kit</a><span>Optional legacy QR card (no longer needed: players open the snapshot in-app)</span></li>
            <li><a href="/admin/insider-kit">Insider Evidence Wall kit</a><span>Envelope fragments and wall cards</span></li>
          </ul>
        </Panel>
        <Panel id="demo" eyebrow="SAFE PREVIEW" title="Showing the game to someone?" className="cc-demo">
          <p>Demo mode opens every chapter and both rounds with no timers and no real scores. It starts nothing and changes no team.</p>
          <a className="k-btn k-btn-primary" href="/admin/demo">ENTER DEMO MODE</a>
        </Panel>
        <Panel id="audit" eyebrow="AUDIT TRAIL" title="Recent audit events">
          {logs.length === 0 ? <p className="cc-empty">No audit events yet.</p> : <ol className="cc-audit">{logs.slice(0, 12).map(log => <li key={log.id}><time>{log.createdAt.toISOString().slice(11, 19)}</time><b>{log.action}</b><span>{log.detail}</span></li>)}</ol>}
          {logs.length > 12 && <p className="cc-note">Latest 12 of {logs.length} shown. The CSV export and database keep the full trail.</p>}
        </Panel>
      </div>

      <div className="cc-danger" role="group" aria-label="Dangerous operations">
        <div className="cc-danger-head"><span aria-hidden="true">⚠</span><div><strong>Danger zone</strong><p>These actions affect teams, are audited and cannot be quietly reversed. Each asks for confirmation.</p></div></div>
        <div className="cc-grid">
          <Panel id="stop-round" eyebrow="IRREVERSIBLE" title="Stop round">
            <p>Ends Round 1 for all teams now. Submissions and hints close immediately and rankings become final pending organizer confirmation.</p>
            <ConfirmForm action={administer} danger typeToConfirm="STOP" title="Stop the round for every team?" confirmLabel="Confirm stop" details={<><p>Every team loses the ability to submit or request hints. Teams still working are recorded as incomplete.</p><p>This cannot be undone.</p></>}>
              <input type="hidden" name="action" value="stop" />
              <button className="k-btn k-btn-danger" disabled={state !== "active"}>Stop round</button>
            </ConfirmForm>
          </Panel>
          <Panel id="unlock" eyebrow="AUDITED OVERRIDE" title="Unlock next chapter">
            <p>Marks the team&apos;s current chapter completed with zero points. Requires an active round and is audited.</p>
            <ConfirmForm action={administer} danger title="Record a progression override?" confirmLabel="Confirm override" details={<p>The team’s current chapter will be marked complete with zero points and the next chapter unlocked. The reason is written to the audit log.</p>}>
              <input type="hidden" name="action" value="unlock" />
              <fieldset className="cc-form-row"><label>Team ID<input name="teamId" required maxLength={80} list="cc-team-ids" /></label><label>Reason<input name="reason" required minLength={5} maxLength={500} /></label><button className="k-btn k-btn-danger">Record override</button></fieldset>
              <datalist id="cc-team-ids">{rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</datalist>
            </ConfirmForm>
          </Panel>
        </div>
      </div>
    </main>
  </div>;
}
