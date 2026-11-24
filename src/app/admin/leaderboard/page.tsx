import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { session } from "@/lib/auth";
import { db } from "@/lib/db";
import { OsHeader } from "@/components/ui/os-header";
import { ConfirmForm } from "@/components/ui/confirm";
import { CcNav, Panel, Pill } from "@/components/admin/cc";
import { signOutAdmin } from "../../organizer/login/actions";
import { setBroadcastAction } from "../broadcast-actions";
import { qualificationReport } from "@/lib/game/qualification.server";
import { broadcast, broadcastFlags } from "@/lib/game/broadcast.server";
import { BROADCAST_LABEL, type BroadcastKey } from "@/lib/game/broadcast";
import { buildBoard } from "@/lib/game/projector";
import { progressSchema } from "@/lib/game/engine";
import { markingBoard } from "@/lib/round2/paper/marking.server";
import { competitorWhere } from "@/lib/game/roster";

export const metadata: Metadata = { title: "Leaderboard | OPERATION GHOST_404", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";
const VIEWS = [["r1", "Round 1 standings"], ["qual", "Qualification"], ["r2", "Round 2 results"]] as const;
type View = (typeof VIEWS)[number][0];
const SCENE: Record<string, string> = { standby: "Standby", "r1-running": "Round 1 live", "r1-complete": "Round 1 closed", intermission: "Intermission", "r2-waiting": "Round 2 waiting", "r2-running": "Round 2 live", "pens-down": "Pens down", results: "Round 2 results" };

// Organizer leaderboard. Shows internal (unpublished) data to the organizer only; the projector shows only what is switched on below.
export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ view?: string; error?: string }> }) {
  if (!await session("admin")) redirect("/organizer/login");
  const params = await searchParams, view: View = (VIEWS.find(v => v[0] === params.view)?.[0]) ?? "r1";
  const [report, flags, marking, live, teams, finalists] = await Promise.all([qualificationReport(), broadcastFlags(), markingBoard(), broadcast(),
    db.team.findMany({ where: competitorWhere, select: { id: true, name: true, progress: true } }), db.r2Finalist.findMany({ select: { teamId: true, status: true } })]);
  if (!report || !live) redirect("/organizer/login");
  const board = buildBoard(teams.map(t => ({ id: t.id, name: t.name, progress: progressSchema.parse(JSON.parse(t.progress)) })));
  const qualified = !!report.confirmation && report.roundStatus === "finished";
  const toggle = (key: BroadcastKey, on: boolean, blocked?: string) => <ConfirmForm action={setBroadcastAction} title={`${on ? "Show" : "Hide"} ${BROADCAST_LABEL[key].toLowerCase()} on the projector?`} confirmLabel={`Confirm ${on ? "show" : "hide"}`}
    details={<p>{on ? "Every hall screen will show this within a few seconds. This is recorded in the audit log." : "The projector stops showing this within a few seconds. Recorded in the audit log."}</p>}>
    <input type="hidden" name="key" value={key} /><input type="hidden" name="on" value={on ? "1" : "0"} />
    <fieldset className="cc-form-row" disabled={!!blocked}><label>Reason<input name="reason" required minLength={5} maxLength={300} placeholder={on ? "e.g. results approved by the head judge" : "e.g. reviewing a score"} /></label>
      <button className={`k-btn ${on ? "k-btn-primary" : ""}`}>{on ? "Show on projector" : "Hide from projector"}<span className="sr-only"> · {BROADCAST_LABEL[key]}</span></button></fieldset>
    {blocked && <p className="cc-dim">{blocked}</p>}
  </ConfirmForm>;
  const podium = (rows: { key: string; rank: number; tied: boolean; name: string; score: number; max: number }[]) => <ol className="lb-podium" aria-label="Top three">{rows.slice(0, 3).map(r => <li key={r.key} className={`is-${r.rank}`}><span className="lb-rank">{r.tied ? "=" : ""}{r.rank}</span><b>{r.name}</b><em>{r.score}<small> / {r.max}</small></em></li>)}</ol>;
  return <div className="site-shell cc-shell">
    <OsHeader area="Control center · Leaderboard"><form action={signOutAdmin}><button className="k-btn k-btn-primary">Log out</button></form></OsHeader>
    <CcNav current="/admin/leaderboard" />
    <main className="cc-main">
      <header className="cc-hero"><div className="cc-hero-id"><span className="cc-eyebrow">STANDINGS · ORGANIZER VIEW</span><h1>Leaderboard</h1><p>This page includes unpublished scores. The hall projector only shows what is switched on in “On the projector”.</p></div>
        <div className="cc-hero-clock"><small>PROJECTOR SCENE</small><Pill tone="live">{SCENE[live.scene]}</Pill></div></header>
      {params.error && <p role="alert" className="cc-alert">{params.error}</p>}

      <Panel id="publish" eyebrow="PUBLICATION" title="On the projector" aside={<Link className="k-btn" href="/admin/projector">Open projector</Link>}>
        <div className="lb-pub">
          <article><header><h3>Round 1 standings</h3><Pill tone={flags.standings ? "live" : "idle"}>{flags.standings ? "Shown" : "Hidden"}</Pill></header><p>Team name, score and chapters completed during and after Round 1. No codes, participants or answers.</p>{toggle("standings", !flags.standings)}</article>
          <article><header><h3>Round 2 finalist names</h3><Pill tone={flags.finalists ? "live" : "idle"}>{flags.finalists ? "Shown" : "Hidden"}</Pill></header><p>Names of the enrolled finalists on the Round 2 waiting screen.</p>{toggle("finalists", !flags.finalists, !flags.finalists && !qualified ? "Available once qualification is confirmed." : undefined)}</article>
          <article><header><h3>Round 2 results</h3><Pill tone={marking.publishedAt ? "ok" : "idle"}>{marking.publishedAt ? "Published" : "Not published"}</Pill></header><p>Published once from the Round 2 control room, after pens down and complete marking. Publishing locks all marks.</p><Link className="k-btn" href="/admin/round2#marking">Go to Round 2 marking</Link></article>
        </div>
      </Panel>

      <nav className="lb-tabs" aria-label="Leaderboard views">{VIEWS.map(([id, label]) => <Link key={id} href={`/admin/leaderboard?view=${id}`} aria-current={view === id ? "page" : undefined}>{label}</Link>)}</nav>

      {view === "r1" && <Panel id="r1" eyebrow={`ROUND 1 · ${report.label}`} title="Round 1 standings" aside={<Pill tone={flags.standings ? "live" : "idle"}>{flags.standings ? "On projector" : "Organizer only"}</Pill>}>
        {board.length === 0 ? <p className="cc-empty">No registered teams.</p> : <>
          {podium(board.map(r => ({ key: r.id, rank: r.rank, tied: r.tied, name: r.name, score: r.score, max: 105 })))}
          <table className="cc-table lb-table" aria-label="Round 1 standings"><thead><tr><th>Rank</th><th>Team</th><th>Chapters done</th><th>Score</th><th>Round 2</th></tr></thead>
            <tbody>{board.map(r => { const f = finalists.find(x => x.teamId === r.id); return <tr key={r.id}><td className="cc-rank">{r.tied ? "=" : ""}{r.rank}</td><td><b>{r.name}</b><small>{r.id}</small></td>
              <td><span className="lb-meter" role="img" aria-label={`${r.chaptersDone} of 5`}>{[0, 1, 2, 3, 4].map(i => <i key={i} className={i < r.chaptersDone ? "is-done" : ""} />)}</span> {r.chaptersDone}/5</td>
              <td className="cc-num"><b>{r.score}</b> / 105</td><td>{f ? (f.status === "active" ? "Finalist" : f.status === "standby" ? "Standby" : "Withdrawn") : "—"}</td></tr>; })}</tbody></table>
          <p className="cc-note">Equal scores share a rank here (shown with =). The qualification order breaks ties with the approved rule: Chapter 2 + 3 raw score, fewer hints, earlier completion, then team ID.</p></>}
      </Panel>}

      {view === "qual" && <Panel id="qual" eyebrow={report.label} title="Qualification standings" aside={<Pill tone={qualified ? "ok" : "warn"}>{qualified ? "Organizer confirmed" : report.roundStatus === "finished" ? "Awaiting confirmation" : "Provisional"}</Pill>}>
        <div className="lb-qual">{[["Top 10 candidates", report.rows.slice(0, 10)], ["Standby", report.rows.slice(10, 12)], ["Outside selection", report.rows.slice(12)]].map(([label, rows]) =>
          <section key={label as string}><h3>{label as string} <span className="cc-dim">({(rows as typeof report.rows).length})</span></h3><ol>{(rows as typeof report.rows).map(r => { const f = finalists.find(x => x.teamId === r.id);
            return <li key={r.id}><span className="cc-q-rank">{r.rank}</span><span><b>{r.name}</b><small>{r.id}{r.completedAt === null ? " · incomplete" : ""}</small></span><span className="cc-num">{r.total}</span>{f && <em>{f.status === "active" ? "Enrolled" : f.status}</em>}</li>; })}</ol></section>)}</div>
        <p className="cc-note">Candidate groups follow the saved ranking. Nothing here qualifies a team: the organizer confirms the snapshot on the command center, then enrolls finalists in the Round 2 control room.</p>
      </Panel>}

      {view === "r2" && <Panel id="r2" eyebrow={marking.publishedAt ? "PUBLISHED" : "PROVISIONAL · NOT PUBLISHED"} title="Round 2 results" aside={<Pill tone={marking.publishedAt ? "ok" : "warn"}>{marking.publishedAt ? "Published" : `${marking.complete} of ${marking.rows.length} fully marked`}</Pill>}>
        {!marking.started ? <p className="cc-empty">Round 2 has not started. No Round 2 scores exist yet.</p> : <>
          {marking.rows.some(r => r.rank !== null) && podium(marking.rows.filter(r => r.rank !== null).map(r => ({ key: r.teamId, rank: r.rank!, tied: r.tied, name: r.name, score: r.total!, max: 60 })))}
          <table className="cc-table lb-table" aria-label="Round 2 results"><thead><tr><th>Rank</th><th>Team</th><th>Inject 1 · paper</th><th>Inject 2 · terminal</th><th>Inject 3 · paper</th><th>Inject 4 · paper</th><th>Total / 60</th></tr></thead>
            <tbody>{marking.rows.map(r => <tr key={r.teamId}><td className="cc-rank">{r.rank === null ? "—" : `${r.tied ? "=" : ""}${r.rank}`}</td><td><b>{r.name}</b><small>{r.teamId}</small></td>
              {[r.i1?.score, r.terminal.score, r.i3?.score, r.i4?.score].map((v, i) => <td key={i} className="cc-num">{v ?? <span className="rc2-pending">pending</span>}{i === 1 && v !== null && v !== undefined && !r.terminal.final ? <small>live</small> : null}</td>)}
              <td className="cc-num">{r.total !== null ? <b className="rc2-total">{r.total}</b> : <span className="rc2-pending">Pending</span>}</td></tr>)}</tbody></table>
          <p className="cc-note">Inject 2 comes from the Kill Switch terminal (server-calculated, never typed). Injects 1, 3, 4 are jury marks. A total appears only when all four exist after pens down. Equal totals share a rank: no Round 2 tie-break has been approved.</p></>}
      </Panel>}
    </main>
  </div>;
}
