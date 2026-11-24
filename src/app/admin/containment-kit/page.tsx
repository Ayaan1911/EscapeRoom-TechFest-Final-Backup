import { redirect } from "next/navigation";
import { session } from "@/lib/auth";

/** RETIRED. Round 1 Chapter 4 (Containment) is fully digital: the fictional security-room snapshot is shown on every team's screen, so there is nothing to print, place or authorize.
 *  The route is kept only so old bookmarks do not break; it is organizer-only and renders no kit. Earlier "containment-copy" audit entries stay in the audit log as history. */
export default async function RetiredContainmentKitPage() {
  if (!await session("admin")) redirect("/organizer/login");
  return <main className="dashboard-main containment-kit-main"><a className="back-link" href="/admin">← Event operations</a><h1>Containment CCTV kit: retired</h1>
    <p>Chapter 4 · Containment is now fully digital. The fictional security-room snapshot (CCTV-A-08, CCTV-B-08, CCTV-C-08) appears on each team&apos;s own screen inside the chapter, so no printed sheets, evidence station or accessible-copy authorization are needed.</p>
    <p>Nothing was deleted: earlier copy authorizations remain in the audit log.</p></main>;
}
