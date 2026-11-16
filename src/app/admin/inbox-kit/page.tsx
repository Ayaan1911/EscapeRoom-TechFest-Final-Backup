import Image from "next/image";
import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { inboxQr } from "@/lib/game/inbox-qr.server";
import { PrintButton } from "@/components/game/print-button";

export default async function InboxKitPage({ searchParams }: { searchParams: Promise<{ origin?: string }> }) {
  if (!await session("admin")) redirect("/login?role=admin");
  const params = await searchParams;
  const origin = params.origin ?? process.env.APP_ORIGIN ?? "";
  let qr: Awaited<ReturnType<typeof inboxQr>> | undefined;
  let error = "";
  try { qr = await inboxQr(origin); } catch (reason) { error = reason instanceof Error ? reason.message : "Invalid application origin"; }
  return <main className="dashboard-main kit-main"><div className="print-controls"><a className="back-link" href="/admin">← Event operations</a><h1>Chapter 1 · physical evidence kit</h1><p>Enter the origin where this application is reachable from participant phones. Use your deployed HTTPS address, or a private LAN address for an in-person demo. This generates the QR locally; no third-party QR service is contacted.</p><form><label>Application origin<input name="origin" type="url" required defaultValue={origin} placeholder="https://your-event-host.example" /></label><button className="button-primary">Generate printable QR</button></form>{error && <p role="alert">{error}</p>}{qr && <PrintButton />}</div>{qr && <section className="print-card"><span>NEXUS CORP / INCIDENT RESPONSE</span><h2>Evidence card 01 · The Inbox</h2><p>Scan to inspect the recovered authentication-page snapshot.</p><Image unoptimized src={qr.image} width={320} height={320} alt="Chapter 1 forensic snapshot QR code" /><p className="qr-target">{qr.target}</p><p>Cannot scan? Open the same application and enter <strong>/clue/inbox</strong>.</p><p>Sign in with your team account. The card resolves your team&apos;s assigned case. Evidence opens after the organizer starts Round 1.</p><small>READ-ONLY SIMULATION · NO CREDENTIAL COLLECTION<br />Organizer: verify this link from a participant phone before printing the kit.</small></section>}</main>;
}
