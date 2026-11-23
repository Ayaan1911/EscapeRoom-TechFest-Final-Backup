"use client";
import type { ReactNode } from "react";
import { Clock3, UserSearch, ShieldAlert, RotateCcw, Archive } from "lucide-react";

export type Phase = { id: string; label: string; sub: string; state: "done" | "partial" | "filled" | "open" };
const ICONS: ReactNode[] = [<Clock3 key="c" />, <UserSearch key="u" />, <ShieldAlert key="s" />, <RotateCcw key="r" />, <Archive key="a" />];
const STATE_TEXT = { done: "complete", partial: "partly scored", filled: "filled in", open: "not started" } as const;

/** Operation phases of an incident-response task list. Shows one task at a time; the active phase is plain UI state (nothing is stored or scored). */
export function PhaseTabs({ label, phases, active, onPick }: { label: string; phases: Phase[]; active: number; onPick: (n: number) => void }) {
  return <nav className="cn-phases" aria-label={label}>{phases.map((p, i) => <button key={p.id} type="button" data-phase={i + 1} className={`is-${p.state} ${active === i + 1 ? "is-active" : ""}`} aria-pressed={active === i + 1}
    aria-label={`Phase ${i + 1}: ${p.label}, ${STATE_TEXT[p.state]}, ${p.sub}`} onClick={() => onPick(i + 1)}>
    <span className="cn-phase-ic" aria-hidden="true">{p.state === "done" ? "✓" : ICONS[i]}</span><b aria-hidden="true">{p.label}</b><small aria-hidden="true">{p.sub}</small></button>)}</nav>;
}
