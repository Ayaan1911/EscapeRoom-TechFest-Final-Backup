import type { Metadata } from "next";
import "../round2.css";
import "../paper.css";

export const metadata: Metadata = { title: "GHOST RETURNS | OPERATION GHOST_404", robots: { index: false, follow: false, nocache: true } };
export default function Round2Layout({ children }: { children: React.ReactNode }) { return children; }
