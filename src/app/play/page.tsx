import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { Brand } from "@/components/ui/brand";
import { LiveDashboard } from "@/components/game/live-dashboard";
import { signOut } from "../login/actions";
export default async function PlayPage() {
    if (!await session("team"))
        redirect("/login");
    return <div className="site-shell"><header className="site-header"><Brand /><form action={signOut}><button className="button-primary">Log out</button></form></header><main className="dashboard-main"><LiveDashboard /></main></div>;
}
