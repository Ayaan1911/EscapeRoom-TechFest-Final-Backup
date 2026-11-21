import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { session } from "@/lib/auth";
import { ProjectorBoard } from "@/components/game/projector-board";

export const metadata: Metadata = { title: "Leaderboard | OPERATION GHOST_404", robots: { index: false, follow: false, nocache: true } };
export default async function ProjectorPage() {
  if (!await session("admin")) redirect("/organizer/login");
  return <main className="pj"><ProjectorBoard /></main>;
}
