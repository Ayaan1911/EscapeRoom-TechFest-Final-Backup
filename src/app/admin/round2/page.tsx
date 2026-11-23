import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { OsHeader } from "@/components/ui/os-header";
import { PaperControl } from "@/components/round2/paper/paper-control";
import { signOutAdmin } from "../../organizer/login/actions";
import "../../round2.css";
import "../../paper.css";

export const dynamic = "force-dynamic";
// Organizer-only Round 2 control room (paper edition). Rendering performs no mutation; every action is an explicit confirmed POST.
export default async function AdminRound2Page() {
  if (!await session("admin")) redirect("/organizer/login");
  return <div className="site-shell"><OsHeader area="Control center · Round 2"><form action={signOutAdmin}><button className="k-btn k-btn-primary">Log out</button></form></OsHeader><main className="dashboard-main"><PaperControl /></main></div>;
}
