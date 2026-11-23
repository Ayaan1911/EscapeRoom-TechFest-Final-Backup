import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { teamState } from "@/lib/game/service";
import { inboxEvidence } from "@/lib/game/inbox.server";
import { OsHeader } from "@/components/ui/os-header";

export default async function InboxSnapshotPage() {
  const auth = await session("team");
  if (!auth?.teamId) redirect("/login?next=/clue/inbox");
  const state = await teamState(auth.teamId);
  if (state.status === "waiting") redirect("/play");
  const { snapshot } = inboxEvidence(state.variant);
  return <div className="site-shell"><OsHeader area="Round 1 · Forensic snapshot"><a className="text-link" href="/play/inbox">Return to Inbox</a></OsHeader><main className="dashboard-main snapshot-main"><span className="eyebrow">READ-ONLY FORENSIC SNAPSHOT / {snapshot.id}</span><h1>Captured authentication page</h1><p className="notice">Evidence reconstruction only. No credentials can be entered or submitted. All displayed destinations are fictional and inert.</p><section className="panel evidence-card"><h2>Capture manifest</h2><dl className="artifact-facts">{Object.entries({ "Evidence ID": snapshot.id, "Captured URL": snapshot.url, "Page title": snapshot.title, "Campaign identifier": snapshot.campaign, "Captured at (UTC)": snapshot.capturedAt, "Redirect from": snapshot.redirectFrom, "Observed recipient": snapshot.recipient, "Original form action (inert)": snapshot.formAction }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className="capture-reconstruction" aria-label="Inert page reconstruction"><div className="capture-address">ARCHIVED RENDER · {snapshot.url}</div><div className="capture-content"><span className="status-tag">NO LIVE FORM</span><h2>NEXUS Workspace</h2><p>Session verification</p><div className="faux-field">Employee account · [redacted in capture]</div><div className="faux-field">Access credential · [not retained]</div><div className="faux-button">Verify session — archived button</div><p>Capture campaign: {snapshot.campaign}</p></div></section><p>The browser capture and redirect metadata are evidence. The original page&apos;s claims are untrusted. Correlate them with the gateway, identity provider and database audit records.</p><a className="button-primary" href="/play/inbox">Continue investigation</a></main></div>;
}
