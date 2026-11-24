import { redirect } from "next/navigation";
import { z } from "zod";
import { session } from "@/lib/auth";
import { db } from "@/lib/db";
import { insiderGroupOverview, insiderGroupSheets, insiderPrintData } from "@/lib/game/insider-kit.server";
import { insiderPrintPages } from "@/lib/game/insider-fragments.server";
import { FINAL_ROSTER, type GroupSummary } from "@/lib/game/evidence-wall.server";
import { PrintButton } from "@/components/game/print-button";

type Params = { part?: string; scope?: string; teamIds?: string | string[]; prepare?: string; show?: string; view?: string };
const PER_PAGE = 8;
const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

function statusLine(s: GroupSummary) {
  if (s.final) return `Final split complete: ${FINAL_ROSTER} teams, Group A 10 / Group B 10 / Group C 10.`;
  if (s.prepared === 0 && s.legacy === 0) return "Not prepared yet. Press “Prepare group assignment” once the final roster exists.";
  if (s.teams !== FINAL_ROSTER) return `Demonstration roster: ${s.teams} teams. The final 10 / 10 / 10 split applies to exactly ${FINAL_ROSTER} teams; this split is balanced to within one team.`;
  return `${s.unassigned} of ${s.teams} teams are not assigned yet. Press “Prepare group assignment” to finish the split.`;
}

export default async function InsiderKitPage({ searchParams }: { searchParams: Promise<Params> }) {
  if (!await session("admin")) redirect("/organizer/login");
  const params = await searchParams;
  const selected = typeof params.teamIds === "string" ? [params.teamIds] : params.teamIds ?? [];
  const request = z.object({ scope: z.enum(["all", "selected"]), teamIds: z.array(z.string().max(80)).max(200) }).safeParse({ scope: params.prepare ?? params.scope, teamIds: selected }); // prepare=all|selected also names the scope
  const view = z.enum(["slips", "wall", "map"]).safeParse(params.view).data;
  const teams = await db.team.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } });
  const prepare = (params.prepare === "all" || params.prepare === "selected") && request.success;
  // Preparation is idempotent (an assigned team keeps its group and codes); printing only reads what was prepared.
  const kit = prepare || (params.show && view) ? await insiderGroupSheets(request.success && request.data.scope === "selected" ? request.data.teamIds : undefined, { prepare }) : null;
  const summary = kit?.summary ?? (await insiderGroupOverview())!;
  const legacyPart = z.enum(["A", "B"]).safeParse(params.part).data ?? "A";
  const legacy = params.part && request.success ? await insiderPrintData(legacyPart, request.data.scope === "all" ? undefined : request.data.teamIds) ?? [] : [];
  const legacyPages = insiderPrintPages(legacy, legacyPart);
  return <main className="dashboard-main insider-kit-main">
    <div className="print-controls">
      <a className="back-link" href="/admin">← Event operations</a>
      <h1>Insider Evidence Wall kit</h1>
      <p>Every team is assigned <b>one</b> group, A, B or C: <b>30 teams → 10 / 10 / 10</b>. A team receives one <b>private fragment</b> for its envelope. Its matching <b>public fragment</b> is one of the cards on the Evidence Wall, in the same group section. Matching the pair opens the dossier.</p>
      <section className="kit-summary" aria-label="Evidence Wall group summary">
        <dl className="artifact-facts">
          <div><dt>Teams registered</dt><dd>{summary.teams}</dd></div><div><dt>Teams prepared</dt><dd>{summary.prepared}</dd></div>
          <div><dt>Group A</dt><dd>{summary.counts.A}</dd></div><div><dt>Group B</dt><dd>{summary.counts.B}</dd></div><div><dt>Group C</dt><dd>{summary.counts.C}</dd></div>
          <div><dt>Not yet assigned</dt><dd>{summary.unassigned}</dd></div>{summary.legacy > 0 && <div><dt>Earlier three-pair teams</dt><dd>{summary.legacy}</dd></div>}
        </dl>
        <p role="status" className="kit-state">{statusLine(summary)}</p>
        <p><small>The assignment is saved once. Restarting the server, re-running preparation or reprinting never changes a team&apos;s group or any code.</small></p>
      </section>
      <form className="kit-pairs" aria-label="Evidence Wall group preparation">
        <fieldset className="kit-team-selector"><legend>Registered teams ({teams.length}) · optional selection</legend>{teams.map(team => <label key={team.id}><input type="checkbox" name="teamIds" value={team.id} defaultChecked={selected.includes(team.id)} /><span>{team.id} · {team.name}</span></label>)}</fieldset>
        <div className="trail-links">
          <button className="button-primary" name="prepare" value="all">Prepare group assignment (all teams)</button>
          <button className="button-secondary" name="prepare" value="selected">Prepare selected teams</button>
        </div>
        <div className="kit-views" role="group" aria-label="Print views (read only, no new codes)">
          <label>Show or print<select name="view" defaultValue={view ?? "slips"}><option value="slips">Private fragments · one per team (for envelopes)</option><option value="wall">Public wall cards · by group (for the Evidence Wall)</option><option value="map">Organizer code map (private, do not print or post)</option></select></label>
          <button className="button-secondary" name="show" value="1">Show prepared teams</button>
        </div>
      </form>
      {params.scope && !request.success && <p role="alert">Invalid selection.</p>}
      {kit && <PrintButton />}
    </div>

    {kit && view !== "wall" && view !== "map" && chunk(kit.slips, PER_PAGE).map((page, index, all) => <section className="print-kit-page" key={index}>
      <header><strong>PRIVATE FRAGMENTS - ENVELOPES ONLY, DO NOT POST</strong><span>Sheet {index + 1} of {all.length}</span></header>
      <div className="fragment-grid">{page.map(slip => <article className="fragment-card" data-team-id={slip.teamId} data-group={slip.group} key={slip.teamId}>
        <div><strong>PRIVATE FRAGMENT · GROUP {slip.group}</strong><span>Team {slip.teamId}</span></div><h2>Group {slip.group}</h2>
        <code aria-label={`Private fragment for ${slip.teamId}`}>{slip.code}</code>
        <p>Seal in this team&apos;s registration envelope. Find the matching public card in the Group {slip.group} section of the Evidence Wall.</p>
        <small>Open /play/insider in the event app and enter this code with the wall card code.</small></article>)}</div></section>)}

    {kit && view === "wall" && kit.groups.map(group => { const cards = kit.wall.filter(c => c.group === group).map(c => c.code).sort(); return chunk(cards, PER_PAGE * 2).map((page, index, all) => <section className="print-kit-page" key={`${group}-${index}`}>
      <header><strong>PUBLIC EVIDENCE WALL · GROUP {group}</strong><span>Sheet {index + 1} of {all.length}</span></header>
      <div className="fragment-grid">{page.map(code => <article className="fragment-card" data-group={group} key={code}><div><strong>PUBLIC FRAGMENT · GROUP {group}</strong></div><code aria-label={`Group ${group} wall card`}>{code}</code></article>)}</div></section>); })}

    {kit && view === "map" && <section className="kit-pair-sheets" aria-label="Organizer code map">
      <h2>ORGANIZER ONLY: private fragments ({kit.slips.length})</h2>
      <table className="k-table"><thead><tr><th>Team</th><th>Name</th><th>Group</th><th>Private code</th></tr></thead><tbody>{kit.slips.map(slip => <tr key={slip.teamId} data-team-id={slip.teamId} data-group={slip.group}><td>{slip.teamId}</td><td>{slip.teamName}</td><td>{slip.group}</td><td><code>{slip.code}</code></td></tr>)}</tbody></table>
      <h2>ORGANIZER ONLY: public wall cards ({kit.wall.length})</h2>
      <table className="k-table"><thead><tr><th>Group</th><th>Role</th><th>Belongs to team</th><th>Wall code</th></tr></thead><tbody>{kit.wall.map(card => <tr key={card.code} data-wall-role={card.role}><td>{card.group}</td><td>{card.role === "match" ? "Matching card" : "Decoy"}</td><td>{card.teamId ?? "-"}</td><td><code>{card.code}</code></td></tr>)}</tbody></table>
      <p>This page lists which wall card matches which team. Never print or post it.</p></section>}

    <details className="kit-legacy"><summary>Earlier two-fragment sheets (only for teams that were never assigned a group)</summary>
      <form><p>The original gate still works for any team that has no group. New events use the group assignment above.</p>
        <label>Sheet type<select name="part" defaultValue={legacyPart}><option value="A">Fragment A - PRIVATE envelope slips</option><option value="B">Fragment B - PUBLIC Evidence Wall cards</option></select></label>
        <div className="trail-links"><button className="button-secondary" name="scope" value="all">Show all teams</button></div></form>
      {legacy.length > 0 && <PrintButton />}</details>
    {legacyPages.map((page, index) => <section className="print-kit-page" key={`${page.station}-${index}`}><header><strong>{legacyPart === "A" ? "PRIVATE ENVELOPES - DO NOT POST" : `PUBLIC EVIDENCE WALL - SECTION ${page.station}`}</strong><span>NEXUS / INSIDER · Sheet {index + 1} of {legacyPages.length}</span></header><div className="fragment-grid">{page.cards.map(card => <article className="fragment-card" data-team-id={card.teamId} data-station={card.station} key={card.teamId}><div><strong>FRAGMENT {legacyPart}</strong><span>WALL SECTION {card.station}</span></div><h2>Team {card.teamId}</h2><code aria-label={`Fragment ${legacyPart} for ${card.teamId}`}>{card.fragment}</code><p>{legacyPart === "A" ? "Seal in this team's registration envelope. Keep private." : "Post only this B card. Match your team ID and envelope slip."}</p></article>)}</div></section>)}
  </main>;
}
