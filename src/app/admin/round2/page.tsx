import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { Brand } from "@/components/ui/brand";
import { PaperControl } from "@/components/round2/paper/paper-control";
import { signOutAdmin } from "../../organizer/login/actions";
import "../../round2.css";
import "../../paper.css";

export const dynamic = "force-dynamic";
// Organizer-only Round 2 control room (paper edition). Rendering performs no mutation; every action is an explicit confirmed POST.
export default async function AdminRound2Page() {
  if (!await session("admin")) redirect("/organizer/login");
  return <div className="site-shell"><header className="site-header"><Brand /><form action={signOutAdmin}><button className="k-btn k-btn-primary">Log out</button></form></header><main className="dashboard-main"><PaperControl /></main></div>;
}
