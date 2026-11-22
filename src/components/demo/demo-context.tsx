"use client";
/* Organizer Demo Mode switch. Components below a DemoProvider never call the competition APIs (no polling, no draft saves, no submissions, no hints):
   they simulate locally and say so. Real player routes map to demo routes so navigation stays inside the preview. */
import { createContext, useContext, type ReactNode } from "react";

export const DEMO_R1 = "/admin/demo/round1";
const Ctx = createContext(false);
export const DemoProvider = ({ children }: { children: ReactNode }) => <Ctx.Provider value={true}>{children}</Ctx.Provider>;
export const useDemo = () => useContext(Ctx);
/** Real player route -> demo route while previewing; unchanged otherwise. */
export function useHref() { const demo = useDemo(); return (href: string) => (!demo ? href : href === "/play" ? DEMO_R1 : href.startsWith("/play/") ? DEMO_R1 + href.slice(5) : href); }
export const DEMO_NOTE = "Demo only: nothing was scored, saved or counted.";
