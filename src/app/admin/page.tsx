import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { recentAudit } from "@/lib/game/service";
import { status } from "@/lib/game/engine";
import { Brand } from "@/components/ui/brand";
import { signOutAdmin } from "../login/actions";
import { administer } from "./actions";
import { qualificationReport } from "@/lib/game/qualification.server";
import { QualificationBoard } from "@/components/game/qualification-board";
export default async function AdminPage({ searchParams }: {
    searchParams: Promise<{
        error?: string;
    }>;
}) {
    if (!await session("admin"))
        redirect("/login?role=admin");
    const report = await qualificationReport();
    if (!report) redirect("/login?role=admin");
    const round = report.round;
    const logs = await recentAudit();
    const params = await searchParams;
    return <div className="site-shell"><header className="site-header"><Brand /><form action={signOutAdmin}><button className="button-primary">Log out</button></form></header><main className="dashboard-main"><div className="dashboard-title"><div><span className="eyebrow">ROUND 1 / {status(round)}</span><h1>Event operations</h1><p>{round.startsAt?.toISOString() || "Waiting for organizer start"} — {round.deadline?.toISOString() || "60 minutes"}</p></div></div>{params.error && <p role="alert">{params.error}</p>}<section className="panel briefing-panel"><p><a className="text-link" href="/admin/inbox-kit">Print Chapter 1 evidence kit</a></p><p><a className="text-link" href="/admin/insider-kit">Print Insider Evidence Wall kit</a></p><p><a className="text-link" href="/admin/containment-kit">Print Containment CCTV kit</a></p><form action={administer}><button className="button-primary" name="action" value="start" disabled={!!round.startsAt}>Start 60-minute round</button> <button className="button-primary" name="action" value="stop" disabled={status(round) !== "active"}>Stop round</button></form><p><a className="back-link" href="/api/admin/scores">Export scores as CSV</a></p><p>Qualification follows the unchanged tie-breaks below. Review incomplete cases and overrides. Confirmation records review only, never Round 2 advancement.</p></section><QualificationBoard report={report} /><section className="panel briefing-panel"><h2>Unlock next chapter</h2><p>Marks the current chapter completed with zero points. Requires an active round and is audited.</p><form action={administer}><input type="hidden" name="action" value="unlock"/><label>Team ID<input name="teamId" required maxLength={80}/></label><label>Reason<input name="reason" required minLength={5} maxLength={500}/></label><button className="button-primary">Record override</button></form></section><section className="panel briefing-panel"><h2>Recent audit events</h2>{logs.map(log => <p key={log.id}>{log.createdAt.toISOString()} · {log.actor} · {log.action} · {log.detail}</p>)}</section></main></div>;
}
