import { redirect } from "next/navigation";
import { z } from "zod";
import { session } from "@/lib/auth";
import { db } from "@/lib/db";
import { insiderGroupOverview, insiderPrintData, insiderSharedKit } from "@/lib/game/insider-kit.server";
import { insiderPrintPages } from "@/lib/game/insider-fragments.server";
import { FINAL_ROSTER, type GroupSummary } from "@/lib/game/evidence-wall.server";
import { PrintButton } from "@/components/game/print-button";
import { convertEarlierPreparation } from "../insider-actions";

type Params = { part?: string; scope?: string; teamIds?: string | string[]; prepare?: string; show?: string; view?: string; copies?: string; converted?: string; error?: string };

function statusLine(s: GroupSummary) {
  if (s.final) return `Final split complete: ${FINAL_ROSTER} teams, Group A 10 / Group B 10 / Group C 10, six unique fragments in place.`;
  if (s.prepared === 0 && s.earlier === 0) return "Not prepared yet. Press “Prepare shared fragments and groups” once the final roster exists.";
  if (s.teams !== FINAL_ROSTER) return `Demonstration roster: ${s.teams} teams. The final 10 / 10 / 10 split applies to exactly ${FINAL_ROSTER} teams; this split is balanced to within one team.`;
  return `${s.unassigned} of ${s.teams} teams are not assigned yet. Press “Prepare shared fragments and groups” to finish the split.`;
}

/** One printable card: the SAME fragment printed once per requested copy (copies never generate new codes). */
function FragmentCard({ kind, group, code, teams }: { kind: "PUBLIC" | "PRIVATE"; group: string; code: string; teams: number }) {
  return <article className={`sf-card is-${kind.toLowerCase()}`} data-fragment={`${kind.toLowerCase()}-${group}`} aria-label={`${kind} evidence fragment, group ${group}`}>
    <header><strong>OPERATION GHOST_404</strong><span>NEXUS INCIDENT RESPONSE</span></header>
    <p className="sf-kind">{kind} EVIDENCE FRAGMENT</p>
    <h2 className="sf-group">GROUP {group}</h2>
    <code className="sf-code" aria-label={`${kind.toLowerCase()} fragment code, group ${group}`}>{code}</code>
    {kind === "PUBLIC"
      ? <p className="sf-note">Found it. Return to your lab computer and enter this code, together with the private code on your team access card, in Chapter 3 · Insider.</p>
      : <p className="sf-note">Printed on the team access card of every Group {group} team ({teams} team{teams === 1 ? "" : "s"}). Never post this card in public.</p>}
    <footer>NEXUS / INSIDER · fictional training exercise · fragment {kind === "PUBLIC" ? "PUB" : "PRV"}-{group}</footer>
  </article>;
}

export default async function InsiderKitPage({ searchParams }: { searchParams: Promise<Params> }) {
  if (!await session("admin")) redirect("/organizer/login");
  const params = await searchParams;
  const selected = typeof params.teamIds === "string" ? [params.teamIds] : params.teamIds ?? [];
  const request = z.object({ scope: z.enum(["all", "selected"]), teamIds: z.array(z.string().max(80)).max(200) }).safeParse({ scope: params.prepare ?? params.scope, teamIds: selected });
  const view = z.enum(["public", "private", "map"]).safeParse(params.view).data;
  const copies = Math.min(40, Math.max(1, Number.parseInt(params.copies ?? "1", 10) || 1));
  const teams = await db.team.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } });
  const prepare = (params.prepare === "all" || params.prepare === "selected") && request.success;
  // Preparation is idempotent (the six codes exist once; an assigned team keeps its group); printing only reads what was prepared.
  const kit = prepare || (params.show && view) ? await insiderSharedKit(request.success && request.data.scope === "selected" ? request.data.teamIds : undefined, { prepare }) : null;
  const summary = kit?.summary ?? (await insiderGroupOverview())!;
  const legacyPart = z.enum(["A", "B"]).safeParse(params.part).data ?? "A";
  const legacy = params.part && request.success ? await insiderPrintData(legacyPart, request.data.scope === "all" ? undefined : request.data.teamIds) ?? [] : [];
  const legacyPages = insiderPrintPages(legacy, legacyPart);
  const show = view ?? "public";
  return <main className="dashboard-main insider-kit-main">
    <div className="print-controls">
      <a className="back-link" href="/admin">← Event operations</a>
      <h1>Insider Evidence Wall kit</h1>
      <p>The whole event uses <b>six</b> fragments: <b>Private A + Public A</b>, <b>Private B + Public B</b>, <b>Private C + Public C</b>. 30 teams → 10 / 10 / 10. Every team of a group shares that group&apos;s pair. The private fragment goes on the team access card; the public fragment is placed in the building. One matching pair opens a team&apos;s dossier.</p>
      <section className="kit-summary" aria-label="Evidence Wall group summary">
        <dl className="artifact-facts">
          <div><dt>Teams registered</dt><dd>{summary.teams}</dd></div><div><dt>Teams assigned</dt><dd>{summary.prepared}</dd></div>
          <div><dt>Group A teams</dt><dd>{summary.counts.A}</dd></div><div><dt>Group B teams</dt><dd>{summary.counts.B}</dd></div><div><dt>Group C teams</dt><dd>{summary.counts.C}</dd></div>
          <div><dt>Not yet assigned</dt><dd>{summary.unassigned}</dd></div>{summary.earlier > 0 && <div><dt>Earlier preparation (not converted)</dt><dd>{summary.earlier}</dd></div>}
        </dl>
        <dl className="artifact-facts kit-defs" role="group" aria-label="Unique fragment definitions">
          <div><dt>Unique private fragments</dt><dd>{summary.uniquePrivate}</dd></div><div><dt>Unique public fragments</dt><dd>{summary.uniquePublic}</dd></div><div><dt>Total unique fragments</dt><dd>{summary.uniquePrivate + summary.uniquePublic}</dd></div>
        </dl>
        <p className="kit-copies"><b>Definitions vs physical copies:</b> there are only {summary.uniquePrivate + summary.uniquePublic || 6} distinct fragments. Up to {summary.teams || FINAL_ROSTER} private cards are printed later onto team access cards (each shows one of the three private fragments); you only need three distinct public cards, and any extra public copies are copies of the SAME fragment.</p>
        <p role="status" className="kit-state">{statusLine(summary)}</p>
        <p><small>Saved once. Restarting the server, re-running preparation or reprinting never changes a group or a code.</small></p>
      </section>
      {params.converted && <p role="status" className="kit-state">Conversion done: {params.converted} team(s) moved to the shared pairs. Nothing was deleted.</p>}
      {params.error && <p role="alert">{params.error}</p>}
      <form className="kit-pairs" aria-label="Evidence Wall preparation">
        <details className="kit-team-pick"><summary>Prepare only selected teams ({teams.length} registered)</summary>
          <fieldset className="kit-team-selector"><legend>Teams</legend>{teams.map(team => <label key={team.id}><input type="checkbox" name="teamIds" value={team.id} defaultChecked={selected.includes(team.id)} /><span>{team.id} · {team.name}</span></label>)}</fieldset></details>
        <div className="trail-links">
          <button className="button-primary" name="prepare" value="all">Prepare shared fragments and groups (all teams)</button>
          <button className="button-secondary" name="prepare" value="selected">Prepare selected teams</button>
        </div>
        <div className="kit-views" role="group" aria-label="Print views (read only, no new codes)">
          <label>Show or print<select name="view" defaultValue={show}><option value="public">Public fragments · 3 cards (for the building)</option><option value="private">Private fragments · 3 cards (for the access cards)</option><option value="map">Organizer code map (private, do not print or post)</option></select></label>
          <label>Copies of each card<input type="number" name="copies" min={1} max={40} defaultValue={copies} /></label>
          <button className="button-secondary" name="show" value="1">Show</button>
        </div>
      </form>
      {summary.convertible > 0 && <form action={convertEarlierPreparation} className="kit-convert" aria-label="Convert earlier preparation">
        <h2>Earlier per-team preparation found ({summary.convertible} team{summary.convertible === 1 ? "" : "s"})</h2>
        <p>An earlier release gave each team its own codes. Converting moves those teams to the shared pairs, keeps their group letter and any solved state, and deletes nothing. <b>Back up the database first.</b> This never runs on its own.</p>
        <label className="k-check"><input type="checkbox" name="backup" required />I have taken a database backup.</label>
        <label>Type CONVERT to confirm<input name="confirm" required autoComplete="off" pattern="CONVERT" /></label>
        <button className="button-secondary">Convert to shared pairs</button>
      </form>}
      {params.scope && !request.success && <p role="alert">Invalid selection.</p>}
      {kit && show !== "map" && <PrintButton />}
    </div>

    {kit && show !== "map" && kit.ready && <section className="print-kit-page sf-sheet" aria-label={show === "public" ? "Public fragments" : "Private fragments"}>
      {kit.groups.map(g => Array.from({ length: copies }, (_, i) => <FragmentCard key={`${g.group}-${i}`} kind={show === "private" ? "PRIVATE" : "PUBLIC"} group={g.group} code={(show === "private" ? g.privateCode : g.publicCode)!} teams={g.teams.length} />))}
    </section>}

    {kit && show === "map" && <section className="kit-pair-sheets" aria-label="Organizer code map">
      <h2>ORGANIZER ONLY: the six fragments and their teams</h2>
      <table className="k-table"><thead><tr><th>Group</th><th>Private code</th><th>Public code</th><th>Teams ({kit.summary.prepared})</th></tr></thead>
        <tbody>{kit.groups.map(g => <tr key={g.group} data-group={g.group}><td>{g.group}</td><td><code>{g.privateCode ?? "-"}</code></td><td><code>{g.publicCode ?? "-"}</code></td><td>{g.teams.length ? g.teams.join(", ") : "-"}</td></tr>)}</tbody></table>
      <p>Never print or post this page.</p></section>}

    <details className="kit-legacy"><summary>Earlier two-fragment sheets (only for teams that were never assigned a group)</summary>
      <form><p>The original gate still works for any team that has no group. New events use the shared fragments above.</p>
        <label>Sheet type<select name="part" defaultValue={legacyPart}><option value="A">Fragment A - PRIVATE envelope slips</option><option value="B">Fragment B - PUBLIC Evidence Wall cards</option></select></label>
        <div className="trail-links"><button className="button-secondary" name="scope" value="all">Show all teams</button></div></form>
      {legacy.length > 0 && <PrintButton />}</details>
    {legacyPages.map((page, index) => <section className="print-kit-page" key={`${page.station}-${index}`}><header><strong>{legacyPart === "A" ? "PRIVATE ENVELOPES - DO NOT POST" : `PUBLIC EVIDENCE WALL - SECTION ${page.station}`}</strong><span>NEXUS / INSIDER · Sheet {index + 1} of {legacyPages.length}</span></header><div className="fragment-grid">{page.cards.map(card => <article className="fragment-card" data-team-id={card.teamId} data-station={card.station} key={card.teamId}><div><strong>FRAGMENT {legacyPart}</strong><span>WALL SECTION {card.station}</span></div><h2>Team {card.teamId}</h2><code aria-label={`Fragment ${legacyPart} for ${card.teamId}`}>{card.fragment}</code><p>{legacyPart === "A" ? "Seal in this team's registration envelope. Keep private." : "Post only this B card. Match your team ID and envelope slip."}</p></article>)}</div></section>)}
  </main>;
}
