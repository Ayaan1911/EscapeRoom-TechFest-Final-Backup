"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchBundle, fetchStatus } from "./api";
import { clockOffset, refreshDelay } from "@/lib/round2/client-clock";
import type { Bundle, StatusPayload } from "./types";

export type Connection = "ok" | "offline" | "unauthorized";
/**
 * Central Round 2 state: server status + released evidence bundle.
 * - Server time is authoritative; `now()` is serverNow + a measured offset (a visual estimate only).
 * - Re-asks the server right after every scheduled boundary (incident release, minute 25, minute 50), every 20 s while running,
 *   and whenever the tab becomes visible or the network returns. All of that is GET-only.
 * - Evidence is fetched only for units the server has released; nothing is preloaded.
 */
export function useRound2(initial: StatusPayload) {
  const [status, setStatus] = useState(initial);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [connection, setConnection] = useState<Connection>("ok");
  const [tick, setTick] = useState(0);
  const offset = useRef<number | null>(null); // lazily seeded from the server-rendered clock, then calibrated on every refresh
  const releasedKey = useRef("");
  const inflight = useRef(false);
  const [announce, setAnnounce] = useState("");
  const seen = useRef(new Set([...initial.clock.releasedIncidents, ...(initial.clock.partBReleased ? [5] : [])]));
  const now = useCallback(() => { if (offset.current === null) offset.current = initial.clock.serverNow - Date.now(); return Date.now() + offset.current; }, [initial.clock.serverNow]);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    const sent = Date.now();
    try {
      const next = await fetchStatus();
      offset.current = clockOffset(next.clock.serverNow, sent, Date.now());
      setStatus(next); setConnection("ok");
      const fresh = next.clock.releasedIncidents.filter(i => !seen.current.has(i));
      if (fresh.length) { fresh.forEach(i => seen.current.add(i)); setAnnounce(`Incident ${fresh.join(", ")} released.`); }
      if (next.clock.partBReleased && !seen.current.has(5)) { seen.current.add(5); setAnnounce("Part A is closed. The Digital Tribunal is open."); } // 5 = Part B marker
      const key = `${next.clock.phase}|${next.clock.releasedIncidents.join(",")}|${next.clock.partBReleased}`;
      if (next.clock.phase !== "not_started" && key !== releasedKey.current) {
        const b = await fetchBundle();
        releasedKey.current = key; setBundle(b);
      }
    } catch (e) { setConnection(e instanceof ApiError && (e.status === 401 || e.status === 403) ? "unauthorized" : "offline"); }
    finally { inflight.current = false; }
  }, []);

  useEffect(() => { const id = setTimeout(() => void refresh(), 0); return () => clearTimeout(id); }, [refresh]);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { // scheduled boundary
    const delay = refreshDelay(status.clock.nextEvent?.at ?? null, now());
    if (delay === null) return;
    const id = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(id);
  }, [status, now, refresh]);
  useEffect(() => { // periodic + reconnect
    const poll = setInterval(() => { if (document.visibilityState === "visible" && status.clock.phase !== "finished") void refresh(); }, 20_000);
    const wake = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake);
    return () => { clearInterval(poll); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake); };
  }, [status.clock.phase, refresh]);

  /** Apply a score already confirmed by the server (a submit response) without waiting for the next poll. */
  const applyScore = useCallback((taskId: string, earned: number, score: { partA: number; partB: number; total: number }) => {
    setStatus(s => ({ ...s, score: { ...s.score, ...score }, tasks: s.tasks.map(t => t.id === taskId ? { ...t, earned } : t) }));
  }, []);
  return { status, bundle, connection, now, tick, refresh, applyScore, announce, clearAnnounce: () => setAnnounce("") };
}
