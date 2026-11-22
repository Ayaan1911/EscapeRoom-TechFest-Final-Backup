"use client";
import { useEffect, useState } from "react";
import { ApiError, fetchResults } from "./api";
import type { ResultsPayload, StatusPayload } from "./types";

export function Restricted({ kind }: { kind: "outsider" | "standby" | "withdrawn" }) {
  const t = { outsider: ["Round 2 is for confirmed finalists", "Your team is not on the Round 2 finalist list. No Round 2 content is available to this account. If you believe this is a mistake, ask an organizer."], standby: ["You are on standby", "Your team is a standby finalist. Round 2 content stays locked unless an organizer promotes your team. Keep this page open; promotion appears here after a refresh."], withdrawn: ["Your team is not active in Round 2", "An organizer has recorded your team as withdrawn from the Round 2 roster. Ask an organizer if this is unexpected."] }[kind];
  return <section className="r2-state" role="status"><span className="r2-eyebrow">GHOST RETURNS</span><h1>{t[0]}</h1><p>{t[1]}</p></section>;
}
export function WaitingRoom({ teamName }: { teamName: string }) {
  return <section className="r2-state" aria-labelledby="wr-h"><span className="r2-eyebrow">GHOST RETURNS · WAITING ROOM</span><h1 id="wr-h">Stand by, {teamName}</h1>
    <p>Starts when an organizer starts it. This page updates itself; the clock is the server&apos;s.</p>
    <div className="r2-rules"><section><h2>Format</h2><ul><li><b>50 minutes</b>, 100 points, scored automatically by the server.</li><li><b>Part A · Live Response</b> (25 min, 60 pts): four incidents, 15 pts each, released at 00:00, 06:00, 12:00 and 18:00.</li><li><b>Part B · Digital Tribunal</b> (25 min, 40 pts) opens automatically at 25:00.</li></ul></section>
      <section><h2>Rules</h2><ul><li>Released incidents stay open until minute 25; you may return to improve them.</li><li>Each task scores on its own, with partial credit. Earned points never go down.</li><li>AI tools and the internet are allowed. Answers are graded against the case records, so verify before you submit.</li><li>Overbroad or destructive choices lose credit. There are no hints.</li><li>Your highest-scoring submission per task counts. Attempts are limited per task (2, 3 or 5, shown on each task); an identical re-submission costs no attempt.</li><li><b>Ties are broken in this order:</b> total score, then Part B score, then faster Part A completion, then points on five difficult investigation tasks (i1.justify, i2.evidence, i3.contradictions, b1.chain, b2.eliminate; 22 points). That subtotal only breaks ties and adds no points. Teams still equal share the rank.</li><li>Drafts autosave per task. Results stay private until the organizer publishes them.</li></ul></section></div></section>;
}
export function FinishedPanel({ status, teamName }: { status: StatusPayload; teamName: string }) {
  const [res, setRes] = useState<ResultsPayload | null | "none">(null);
  useEffect(() => { let live = true; fetchResults().then(r => live && setRes(r)).catch(e => live && setRes(e instanceof ApiError && e.status === 404 ? "none" : null)); return () => { live = false; }; }, []);
  const s = status.score;
  return <section className="r2-state" aria-labelledby="fin-h"><span className="r2-eyebrow">ROUND 2 COMPLETE</span><h1 id="fin-h">{teamName}: {s.total} / {s.max}</h1>
    <p>Part A (Live Response) <b>{s.partA}/{s.partAMax}</b> · Part B (Digital Tribunal) <b>{s.partB}/{s.partBMax}</b>. Submissions are closed. Released records and your answers stay readable.</p>
    {res === "none" || res === null ? <p className="r2-meta" role="status">Final standings are private until the organizers review and publish them.</p>
      : <div className="r2-tablewrap"><table className="r2-table"><caption>Published results</caption><thead><tr><th scope="col">Rank</th><th scope="col">Team</th><th scope="col">Part A</th><th scope="col">Part B</th><th scope="col">Total</th><th scope="col">Tiebreak: difficult tasks</th></tr></thead>
        <tbody>{res.ranking.map(r => <tr key={`${r.rank}-${r.name}`} className={r.name === teamName ? "is-active" : ""}><td>{r.tie ? `${r.rank} (shared rank${r.acknowledged ? ", exact tie acknowledged" : ""})` : r.rank}</td><th scope="row">{r.name}</th><td>{r.partA}</td><td>{r.partB}</td><td><b>{r.total}</b></td><td>{r.difficulty}/22</td></tr>)}</tbody></table>
        {res.ranking.some(r => r.tie) && <p className="r2-meta">Teams marked as a shared rank are equal on every ranking rule (total, Part B, Part A time and the difficult-task subtotal).</p>}</div>}</section>;
}
