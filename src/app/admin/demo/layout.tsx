import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { OsHeader } from "@/components/ui/os-header";
import { DemoBar } from "@/components/demo/demo-bar";

// Organizer-only preview. Never cached or indexed; the session check runs on every request (pages repeat it, because layouts persist across client navigations).
export const metadata: Metadata = { title: "Demo | OPERATION GHOST_404", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";
export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  if (!await session("admin")) redirect("/organizer/login");
  return <div className="site-shell dm-shell"><OsHeader area="Control center · Demo Mode" secure={false}><a className="k-btn" href="/admin">Back to organizer</a></OsHeader>
    <Suspense fallback={null}><DemoBar /></Suspense>{children}</div>;
}
