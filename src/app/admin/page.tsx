import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { recentAudit } from "@/lib/game/service";
import { status } from "@/lib/game/engine";
import { Brand } from "@/components/ui/brand";
import { Badge, Card } from "@/components/ui/kit";
import { ConfirmForm } from "@/components/ui/confirm";
import { signOutAdmin } from "../login/actions";
import { administer } from "./actions";
import { qualificationReport } from "@/lib/game/qualification.server";
import { QualificationBoard } from "@/components/game/qualification-board";

const TONE = { waiting: "amber", active: "ok", finished: "neutral" } as const;
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!await session("admin")) redirect("/login?role=admin");
  const report = await qualificationReport();
  if (!report) redirect("/login?role=admin");
  const round = report.round, state = status(round);
  const logs = await recentAudit();
  const params = await searchParams;
  const complete = report.rows.filter(row => row.completedAt !== null).length;
  return <div className="site-shell">
    <header className="site-header"><Brand /><form action={signOutAdmin}><button className="k-btn k-btn-primary">Log out</button></form></header>
    <main className="dashboard-main"><div className="k-desk">
      <header className="k-mission">
        <div className="k-mission-main"><div><span className="k-eyebrow">ROUND 1 / {state}</span><h1>Event operations</h1>
          <p className="k-objective">{round.startsAt?.toISOString() || "Waiting for organizer start"} — {round.deadline?.toISOString() || "60 minutes"}</p></div>
          <dl className="k-stats"><div><dt>Round</dt><dd><Badge tone={TONE[state as keyof typeof TONE] ?? "neutral"}>{state.toUpperCase()}</Badge></dd></div><div><dt>Teams</dt><dd>{report.rows.length} registered</dd></div><div><dt>Finished</dt><dd>{complete} complete · {report.rows.length - complete} in progress</dd></div></dl></div>
      </header>
      {params.error && <p role="alert" className="k-banner k-banner-warn">{params.error}</p>}

      <div className="k-admin-grid">
        <Card eyebrow="ROUTINE" title="Round control" id="round-control">
          <p>Starting fixes the single 60-minute deadline for every team. It cannot be restarted or extended from here.</p>
          <ConfirmForm action={administer} title="Start the 60-minute round?" confirmLabel="Confirm start" details={<><p>All teams will be able to begin Chapter 1 immediately and the shared 60-minute clock starts now.</p><p>This cannot be undone or restarted.</p></>}>
            <input type="hidden" name="action" value="start" />
            <button className="k-btn k-btn-primary k-btn-lg" disabled={!!round.startsAt}>Start 60-minute round</button>
          </ConfirmForm>
          <div className="k-actions"><a className="k-btn" href="/admin">Refresh saved results</a><a className="k-btn" href="/api/admin/scores">Export scores as CSV</a></div>
        </Card>
        <Card eyebrow="PRINT" title="Event kits" id="kits">
          <ul className="k-tiles">
            <li className="k-tile"><a href="/admin/inbox-kit">Print Chapter 1 evidence kit</a><span>QR snapshot cards for the Inbox investigation</span></li>
            <li className="k-tile"><a href="/admin/insider-kit">Print Insider Evidence Wall kit</a><span>Private envelope fragments and public wall cards</span></li>
            <li className="k-tile"><a href="/admin/containment-kit">Print Containment CCTV kit</a><span>Security-room snapshots by variant</span></li>
          </ul>
        </Card>
      </div>

      <QualificationBoard report={report} />

      <div className="k-danger" role="group" aria-label="Dangerous operations">
        <div className="k-danger-head"><span aria-hidden="true">⚠</span><div><strong>Danger zone</strong><p>These actions affect every team, are audited and cannot be quietly reversed. Each asks for confirmation.</p></div></div>
        <div className="k-two">
          <Card eyebrow="IRREVERSIBLE" title="Stop round" id="stop-round">
            <p>Ends the round for all teams now. Submissions and hints close immediately and rankings become final pending organizer confirmation.</p>
            <ConfirmForm action={administer} danger typeToConfirm="STOP" title="Stop the round for every team?" confirmLabel="Confirm stop" details={<><p>Every team loses the ability to submit or request hints. Teams still working are recorded as incomplete.</p><p><strong>This cannot be reopened.</strong></p></>}>
              <input type="hidden" name="action" value="stop" />
              <button className="k-btn k-btn-danger" disabled={state !== "active"}>Stop round</button>
            </ConfirmForm>
          </Card>
          <Card eyebrow="AUDITED OVERRIDE" title="Unlock next chapter" id="unlock">
            <p>Marks the current chapter completed with zero points. Requires an active round and is audited.</p>
            <ConfirmForm action={administer} danger title="Record a progression override?" confirmLabel="Confirm override" details={<p>The team’s current chapter will be marked complete with zero points and the next chapter unlocked. The reason is written to the audit log.</p>}>
              <input type="hidden" name="action" value="unlock" />
              <fieldset><label>Team ID<input name="teamId" required maxLength={80} /></label><label>Reason<input name="reason" required minLength={5} maxLength={500} /></label><button className="k-btn k-btn-danger">Record override</button></fieldset>
            </ConfirmForm>
          </Card>
        </div>
      </div>

      <div><Card eyebrow="AUDIT TRAIL" title="Recent audit events" id="audit"><div className="k-tablescroll"><table className="k-table"><thead><tr><th>Time (UTC)</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td className="k-mono">{log.createdAt.toISOString()}</td><td>{log.actor}</td><td>{log.action}</td><td className="k-mono">{log.detail}</td></tr>)}</tbody></table>{logs.length === 0 && <p className="k-empty k-pad">No audit events yet.</p>}</div></Card></div>
    </div></main>
  </div>;
}
