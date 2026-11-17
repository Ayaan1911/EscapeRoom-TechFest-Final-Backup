import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { containmentPrintData } from "@/lib/game/containment-access.server";
import { ContainmentCctv } from "@/components/game/containment-cctv";
import { PrintButton } from "@/components/game/print-button";
import { grantCopy } from "./actions";

export default async function ContainmentKitPage({ searchParams }: { searchParams: Promise<{ variant?: string; error?: string; authorized?: string }> }) {
  if (!await session("admin")) redirect("/login?role=admin");
  const params = await searchParams;
  const variants = params.variant === undefined || params.variant === "all" ? ["A", "B", "C"] : ["A", "B", "C"].includes(params.variant) ? [params.variant] : [];
  const snapshots = await containmentPrintData(variants) ?? [];
  return <main className="dashboard-main containment-kit-main"><div className="print-controls"><a className="back-link" href="/admin">← Event operations</a><h1>Containment CCTV evidence kit</h1><p>Print A4, one fictional snapshot per variant. Place under the matching variant label at the security-room evidence station. Duplicate copies may be placed at accessible desks. No real footage or people are used, and no response answer key appears on these sheets.</p><form><label>Print variant<select name="variant" defaultValue={params.variant ?? "all"}><option value="all">All variants</option>{["A", "B", "C"].map(v => <option key={v}>{v}</option>)}</select></label><button className="button-secondary">Prepare CCTV sheets</button></form>{snapshots.length > 0 ? <><p role="status">{snapshots.length} fictional A4 snapshots prepared.</p><PrintButton /></> : <p role="alert">Invalid variant.</p>}<section className="panel evidence-card"><h2>Authorize an accessible evidence copy</h2><p>If a sheet is missing, damaged or inaccessible, confirm the team ID and record the reason. Only an eligible team in an active round can receive a copy. The audit grant exposes that team&apos;s variant snapshot in its protected workspace, without points, hints, progression changes or Insider fragments.</p>{params.error && <p role="alert">{params.error}</p>}{params.authorized && <p role="status">Accessible copy authorized and audited. Ask the team to check its workspace copy.</p>}<form action={grantCopy}><label>Team ID<input name="teamId" required maxLength={80} /></label><label>Copy authorization reason<input name="reason" required minLength={5} maxLength={500} /></label><button className="button-primary">Authorize evidence copy</button></form></section></div>{snapshots.map(snapshot => <section className="containment-print-page" key={snapshot.id}><ContainmentCctv snapshot={snapshot} /></section>)}</main>;
}
