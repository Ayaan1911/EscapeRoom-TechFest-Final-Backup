import type { Metadata } from "next";
import "./globals.css";
import "./kit.css";

export const metadata: Metadata = {
  title: "OPERATION GHOST_404 | NEXUS Incident Response",
  description: "A fictional cybersecurity investigation and escape-room competition for TechFest.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
