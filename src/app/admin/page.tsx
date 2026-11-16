import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { leaderboard, roundState, recentAudit } from "@/lib/game/service";
import { current, hints, score, status, titles } from "@/lib/game/engine";
import { Brand } from "@/components/ui/brand";
import { signOut } from "../login/actions";
import { administer } from "./actions";
export default async function AdminPage({ searchParams }: {
    searchParams: Promise<{
        error?: string;
    }>;
}) {
    if (!await session("admin"))
        redirect("/login?role=admin");
    const teams = await leaderboard();
    const round = await roundState();
    const logs = await recentAudit();
    const params = await searchParams;
    return <div className="site-shell"><header className="site-header"><Brand /><form action={signOut}><button className="button-primary">Log out</button></form></header><main className="dashboard-main"><div className="dashboard-title"><div><span className="eyebrow">ROUND 1 / {status(round)}</span><h1>Event operations</h1><p>{round.startsAt?.toISOString() || "Waiting for organizer start"} — {round.deadline?.toISOString() || "60 minutes"}</p></div></div>{params.error && <p role="alert">{params.error}</p>}<section className="panel briefing-panel"><form action={administer}><button className="button-primary" name="action" value="start" disabled={!!round.startsAt}>Start 60-minute round</button> <button className="button-primary" name="action" value="stop" disabled={status(round) !== "active"}>Stop round</button></form><p><a className="back-link" href="/api/admin/scores">Export scores as CSV</a></p><p>Qualification follows score, Chapters 2 + 3, fewest hints, then earliest completion. Exact ties use team ID. Selection is provisional until the round finishes.</p></section><section className="panel briefing-panel"><h2>Registered teams and qualification</h2><div className="table-scroll"><table><thead><tr><th>Rank</th><th>Team / ID</th><th>Current chapter</th><th>Chapter scores</th><th>Total</th><th>Hints</th><th>Selection</th></tr></thead><tbody>{teams.map((t, i) => <tr key={t.id}><td>{i + 1}</td><td>{t.name}<br />{t.id}<br />Variant {t.variant}<br />{(JSON.parse(t.participants) as string[]).join(", ")}</td><td>{titles[current(t.progress)] || "Complete"}</td><td>{t.progress.chapters.map(c => c.score).join(" / ")}</td><td>{score(t.progress)}</td><td>{hints(t.progress)}</td><td>{i < 10 ? "Top 10" : i < 12 ? "Standby" : "—"}</td></tr>)}</tbody></table></div>{!teams.length && <p>No registered teams. Use the development seed locally.</p>}</section><section className="panel briefing-panel"><h2>Unlock next chapter</h2><p>Marks the current chapter completed with zero points. Requires an active round and is audited.</p><form action={administer}><input type="hidden" name="action" value="unlock"/><label>Team ID<input name="teamId" required maxLength={80}/></label><label>Reason<input name="reason" required minLength={5} maxLength={500}/></label><button className="button-primary">Record override</button></form></section><section className="panel briefing-panel"><h2>Recent audit events</h2>{logs.map(log => <p key={log.id}>{log.createdAt.toISOString()} · {log.actor} · {log.action} · {log.detail}</p>)}</section></main></div>;
}
