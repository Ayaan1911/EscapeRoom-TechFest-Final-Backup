import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import "./kit.css";
import "./pages.css";
import "./play.css";
import "./design.css";
import "./ghost.css";
import "./ghostos.css";
import "./os.css";
import "./cine.css";

// Fonts ship inside the build (geist package, SIL OFL): no request to Google at build or run time, so the LAN event needs no internet.

export const metadata: Metadata = {
  title: "OPERATION GHOST_404 | NEXUS Incident Response",
  description: "A fictional cybersecurity investigation and escape-room competition for TechFest.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth" className={`${GeistSans.variable} ${GeistMono.variable}`}><body>{children}</body></html>;
}
