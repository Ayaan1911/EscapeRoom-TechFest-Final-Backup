import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { Brand } from "@/components/ui/brand";
import { Round2Admin } from "@/components/round2/admin";
import { signOutAdmin } from "../../organizer/login/actions";
import "../../round2.css";

// Organizer-only shell. Rendering performs no mutation: every start/end/enroll/promote/publish is an explicit confirmed POST from the client.
export default async function AdminRound2Page() {
  if (!await session("admin")) redirect("/organizer/login");
  return <div className="site-shell"><header className="site-header"><Brand /><form action={signOutAdmin}><button className="k-btn k-btn-primary">Log out</button></form></header><main className="dashboard-main"><Round2Admin /></main></div>;
}
