import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { session } from "@/lib/auth";
import { Broadcast } from "@/components/admin/broadcast";

export const metadata: Metadata = { title: "Broadcast | OPERATION GHOST_404", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";
// Hall projector. Organizer sign-in is required so only an organizer machine can drive it; the screen itself has no controls.
export default async function ProjectorPage() {
  if (!await session("admin")) redirect("/organizer/login");
  return <main className="bc-main"><Broadcast /></main>;
}
