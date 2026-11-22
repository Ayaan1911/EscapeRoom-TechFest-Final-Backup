import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { session } from "@/lib/auth";
import { PaperProjector } from "@/components/round2/paper/paper-control";
import "../../../paper.css";

export const metadata: Metadata = { title: "Round 2 countdown | OPERATION GHOST_404", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";
export default async function Round2ProjectorPage() {
  if (!await session("admin")) redirect("/organizer/login");
  return <main className="rpj-main"><PaperProjector /></main>;
}
