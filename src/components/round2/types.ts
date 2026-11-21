// Wire types for the Round 2 API (hand-written on purpose: client code never imports server modules, not even for types).
import type { Field } from "@/lib/round2/form-types";
export type Phase = "not_started" | "part_a" | "part_b" | "finished";
export type Availability = "open" | "not_released" | "closed";
export type ClockView = {
  phase: Phase; serverNow: number; elapsedMs: number; startsAt: string | null; partAClosesAt: string | null; endsAt: string | null;
  releasedIncidents: number[]; partBReleased: boolean; nextEvent: { event: string; at: string; inMs: number } | null;
};
export type Attempts = { used: number; cap: number; remaining: number };
export type TaskStatus = { id: string; part: "A" | "B"; unit: number; title: string; earned: number; max: number; availability: Availability; attempts: Attempts };
export type UnitStatus = { unit: number; title: string; max: number; released: boolean };
export type StatusPayload = {
  policy?: string; clock: ClockView; score: { partA: number; partB: number; total: number; partAMax: number; partBMax: number; max: number };
  tasks: TaskStatus[]; units: { A: UnitStatus[]; B: UnitStatus[] }; hints: string;
};
export type R2Record = { id: string; time: string; source: string; title: string; detail: string };
export type TaskDef = { id: string; prompt: string; max: number; availability: Availability; fields: Field[] };
export type UnitContent = { part: "A" | "B"; unit: number; title: string; story: string; records: R2Record[]; tasks: TaskDef[] };
export type Bundle = { clock: ClockView; brief: string | null; contentVersion: string; units: UnitContent[] };
export type SubmitOutcome = { duplicate: boolean; accepted: boolean; awarded: number; improved?: boolean; policy?: string; attempts?: Attempts; task: { id: string; earned: number; max: number }; score: { partA: number; partB: number; total: number } };
export type ServerDraft = { taskId: string; data: Record<string, unknown>; version: number };
export type ResultsPayload = { publishedAt: string; ranking: { rank: number; tie: boolean; name: string; partA: number; partB: number; total: number }[] };
export const unitKey = (part: "A" | "B", unit: number) => `${part}${unit}`;
