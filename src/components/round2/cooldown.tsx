"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// The server's submission gap (3 s) is per TEAM, not per task, so the countdown is shared by every task card.
type Cooldown = { remaining: number; start: (seconds: number) => void };
const Ctx = createContext<Cooldown>({ remaining: 0, start: () => undefined });
export const useCooldown = () => useContext(Ctx);
export function CooldownProvider({ children }: { children: ReactNode }) {
  const [until, setUntil] = useState(0), [remaining, setRemaining] = useState(0);
  const start = useCallback((s: number) => { const t = Date.now() + s * 1000; setUntil(t); setRemaining(s); }, []);
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => { const left = Math.ceil((until - Date.now()) / 1000); setRemaining(Math.max(0, left)); if (left <= 0) clearInterval(id); }, 250);
    return () => clearInterval(id);
  }, [until]);
  return <Ctx.Provider value={useMemo(() => ({ remaining, start }), [remaining, start])}>{children}</Ctx.Provider>;
}
