"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

/** Countdown to a SERVER deadline. The device clock is only used for the offset measured against the server's own time. */
export function ServerClock({ deadline, serverNow, label }: { deadline: string; serverNow: number; label: string }) {
  const offset = useRef<number | null>(null), [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    offset.current = serverNow - Date.now();
    const tick = () => setNow(Date.now() + offset.current!); tick();
    const id = setInterval(tick, 500); return () => clearInterval(id);
  }, [serverNow]);
  const left = now === null ? null : Date.parse(deadline) - now;
  return <b className={`cc-clock ${left !== null && left < 5 * 60_000 ? "is-urgent" : ""}`} role="timer" aria-label={label}>{left === null ? "--:--" : mmss(left)}</b>;
}

/** Re-renders the server page every `everyMs` while visible, never while the organizer is typing or a confirmation is open.
 *  Shows how old the data is, so a frozen screen is never mistaken for a live one. */
export function LiveRefresh({ renderedAt, everyMs = 15_000 }: { renderedAt: number; everyMs?: number }) {
  const router = useRouter(), [age, setAge] = useState(0), skew = useRef<number | null>(null);
  useEffect(() => {
    skew.current = Date.now() - renderedAt;
    const tick = () => setAge(Math.max(0, Date.now() - skew.current! - renderedAt)); tick();
    const t = setInterval(tick, 1000);
    const r = setInterval(() => {
      const busy = document.activeElement?.matches("input, textarea, select") || document.querySelector("dialog[open], [role=dialog]");
      if (document.visibilityState === "visible" && !busy) router.refresh();
    }, everyMs);
    return () => { clearInterval(t); clearInterval(r); };
  }, [renderedAt, everyMs, router]);
  const stale = age > everyMs * 3;
  return <span className={`cc-fresh ${stale ? "is-stale" : ""}`} role="status" aria-live="polite">
    <i aria-hidden="true" />{stale ? `Data is ${Math.round(age / 1000)} s old: check the connection` : `Live · updated ${new Date(renderedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}</span>;
}
