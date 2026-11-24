import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { rosterStatus } from "@/lib/game/reserve.server";
import { activateReserveAction } from "../credentials-actions";

export const dynamic = "force-dynamic";
/** Organizer-only provisioning STATUS. It never shows a password or a shared code: plaintext credentials exist only in the encrypted bundle and are printed by `scripts/credentials.mjs print`. */
export default async function CredentialsPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  if (!await session("admin")) redirect("/organizer/login");
  const status = await rosterStatus(); if (!status) redirect("/organizer/login");
  const params = await searchParams, last = status.lastProvisioned ? JSON.parse(status.lastProvisioned.detail) as { bundleId?: string } : null;
  const inactive = status.reserves.filter(r => !r.active), live = status.primaries.filter(p => !p.withdrawn);
  return <main className="dashboard-main kit-main">
    <a className="back-link" href="/admin">← Event operations</a>
    <h1>Team credentials · provisioning status</h1>
    <p>Status only. Passwords and the shared Insider codes are never shown here: they live in the encrypted credential bundle (kept outside the repository) and are printed with <code>node scripts/credentials.mjs print</code>.</p>
    <section className="kit-summary" aria-label="Provisioning summary">
      <dl className="artifact-facts">
        <div><dt>Teams prepared</dt><dd>{status.prepared} of 32</dd></div><div><dt>Primary teams</dt><dd>{status.primary}</dd></div><div><dt>Reserve teams</dt><dd>{status.reserve}</dd></div>
        <div><dt>Group A (active primary)</dt><dd>{status.counts.A}</dd></div><div><dt>Group B (active primary)</dt><dd>{status.counts.B}</dd></div><div><dt>Group C (active primary)</dt><dd>{status.counts.C}</dd></div>
        <div><dt>Shared Insider codes</dt><dd>{status.codes} of 3 pairs</dd></div><div><dt>Credential bundle</dt><dd>{status.bundles.length === 0 ? "none installed" : status.bundles.join(", ")}</dd></div>
      </dl>
      <p role="status" className="kit-state">{status.matches ? "This database matches the expected provisioning set: 32 accounts (30 primary, 2 reserve), 10/10/10 groups, three shared pairs. Run `credentials verify` to confirm the printed passwords." : status.prepared === 0 ? "No final event roster is installed in this database yet. Use `credentials preflight` and `credentials import`." : "The roster in this database does NOT match the expected provisioning set. Run `credentials preflight` to see why."}</p>
      {last?.bundleId && <p><small>Last provisioning run: bundle {last.bundleId}.</small></p>}
    </section>
    {params.done && <p role="status" className="kit-state">{params.done}</p>}
    {params.error && <p role="alert">{params.error}</p>}
    <h2>Reserve accounts</h2>
    <table className="k-table" aria-label="Reserve accounts"><thead><tr><th>Account</th><th>Status</th><th>Replaces</th><th>Group</th></tr></thead>
      <tbody>{status.reserves.map(r => <tr key={r.id} data-team-id={r.id}><td>{r.id}</td><td>{r.active ? "ACTIVE" : "reserve (not competing)"}</td><td>{r.replaces ?? "-"}</td><td>{r.group ?? "-"}</td></tr>)}</tbody></table>
    {inactive.length > 0 && live.length > 0 && <form action={activateReserveAction} className="kit-convert" aria-label="Activate a reserve">
      <h3>Replace a team with a reserve</h3>
      <p>This is a replacement, not an extra competitor: the replaced team leaves every ranking, the reserve takes its Insider group (the split stays 10/10/10) and starts with its own blank progress. Scores and attempts are never transferred. The reserve keeps its login ID and password; print its updated card afterwards.</p>
      <label>Reserve account<select name="reserveId" required defaultValue="">{<option value="" disabled>Select…</option>}{inactive.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}</select></label>
      <label>Primary team being replaced<select name="replacesId" required defaultValue=""><option value="" disabled>Select…</option>{live.map(p => <option key={p.id} value={p.id}>{p.id} · Group {p.group ?? "?"}</option>)}</select></label>
      <label>Reason (audited)<input name="reason" required minLength={5} maxLength={500} autoComplete="off" /></label>
      <label className="k-check"><input type="checkbox" name="acknowledgeProgress" />The replaced team may already have progress; I understand nothing is transferred.</label>
      <button className="button-secondary">Activate reserve as replacement</button>
    </form>}
  </main>;
}
