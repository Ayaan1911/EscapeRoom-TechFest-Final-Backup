import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./kit.css";
import "./pages.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "OPERATION GHOST_404 | NEXUS Incident Response",
  description: "A fictional cybersecurity investigation and escape-room competition for TechFest.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth" className={`${sans.variable} ${mono.variable}`}><body>{children}</body></html>;
}
