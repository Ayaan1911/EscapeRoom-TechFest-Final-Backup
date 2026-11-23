import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { OsHeader } from "@/components/ui/os-header";
import { LiveDashboard } from "@/components/game/live-dashboard";
import { signOut } from "../login/actions";
export default async function PlayPage() {
    if (!await session("team"))
        redirect("/login");
    return <div className="site-shell"><OsHeader area="Round 1 · Mission map"><form action={signOut}><button className="button-primary">Log out</button></form></OsHeader><main className="dashboard-main"><LiveDashboard /></main></div>;
}
