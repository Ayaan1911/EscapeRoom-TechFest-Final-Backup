import { redirect } from "next/navigation";
import { session } from "@/lib/auth";

/** RETIRED. Chapter 1 no longer uses a physical QR card: players open the Forensic Snapshot with the in-game button. The route remains only so old bookmarks do not break;
 *  it is organizer-only and prints nothing. The participant page (/clue/inbox), the capture IDs and the Chapter 1 scoring are unchanged. */
export default async function RetiredInboxKitPage() {
  if (!await session("admin")) redirect("/organizer/login");
  return <main className="dashboard-main kit-main"><a className="back-link" href="/admin">← Event operations</a><h1>Chapter 1 evidence kit: retired</h1>
    <p>Chapter 1 · Inbox is fully digital. Teams open the archived Forensic Snapshot with the &ldquo;Open Forensic Snapshot&rdquo; button inside the game; there is no QR card to print and no phone is needed.</p>
    <p>Nothing else changed: the snapshot evidence, the capture IDs and the Chapter 1 scoring are exactly as before.</p></main>;
}
