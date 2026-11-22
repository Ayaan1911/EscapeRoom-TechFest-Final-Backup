import "server-only";
import { redirect } from "next/navigation";
import { session } from "@/lib/auth";
import { initialProgress, unlockThresholds } from "@/lib/game/engine";
import { catalog, taskMax } from "@/lib/game/scoring";
import { r2Catalog, taskMax as r2TaskMax, partMax, unitMax, UNITS, r2TaskById, CONTENT_VERSION } from "@/lib/round2/catalog";
import { CASE_BRIEF, units } from "@/lib/round2/content.server";
import { fieldsFor } from "@/lib/round2/forms.server";
import { capFor } from "@/lib/round2/scoring-policy";
import type { ChapterState } from "@/components/game/use-chapter";
import type { Bundle, StatusPayload } from "@/components/round2/types";

/** Every demo page calls this: only an organizer session may preview. No database access of any kind happens in this module. */
export async function requireDemoAdmin() { if (!await session("admin")) redirect("/organizer/login"); }
export const DEMO_CHAPTERS = ["inbox", "trail", "insider", "containment", "verdict"] as const;
export const DEMO_VARIANTS = ["A", "B"] as const;
export const pickVariant = (v: string | undefined) => ((DEMO_VARIANTS as readonly string[]).includes(v ?? "") ? (v as string) : "A");

/** A blank, fully open Round 1 state: all chapters unlocked, no deadline, nothing scored. A plain object, never written anywhere. */
export function demoChapterState(): ChapterState {
  return { progress: initialProgress(), score: 0, current: 0, status: "active", chapterHints: [[], [], [], [], []], serverNow: Date.now(), round: { deadline: null }, insiderUnlocked: true, unlocked: [true, true, true, true, true],
    unlockThresholds, tasks: catalog.map(list => list.map(t => ({ id: t.id, title: t.title, earned: 0, max: taskMax(t), attempts: null }))) };
}

/** Round 2 preview: every unit released and open, no clock. Content is exactly what a finalist receives (prompts, records, form fields); answers are never included. */
export function demoRound2(): { status: StatusPayload; bundle: Bundle } {
  const clock = { phase: "part_a" as const, serverNow: Date.now(), elapsedMs: 0, startsAt: null, partAClosesAt: null, endsAt: null, releasedIncidents: [1, 2, 3, 4], partBReleased: true, nextEvent: null };
  const status: StatusPayload = { policy: "best-v1", clock, score: { partA: 0, partB: 0, total: 0, partAMax: partMax("A"), partBMax: partMax("B"), max: partMax("A") + partMax("B") },
    tasks: r2Catalog.map(t => { const cap = capFor(t.id, "best-v1"); return { id: t.id, part: t.part, unit: t.unit, title: t.title, earned: 0, max: r2TaskMax(t), availability: "open" as const, attempts: { used: 0, cap, remaining: cap } }; }),
    units: { A: UNITS.A.map((title, i) => ({ unit: i + 1, title, max: unitMax("A", i + 1), released: true })), B: UNITS.B.map((title, i) => ({ unit: i + 1, title, max: unitMax("B", i + 1), released: true })) }, hints: "" };
  const bundle: Bundle = { clock, brief: CASE_BRIEF, contentVersion: CONTENT_VERSION, units: units.map(u => ({ part: u.part, unit: u.unit, title: u.title, story: u.story, records: u.records,
    tasks: u.tasks.map(t => ({ id: t.id, prompt: t.prompt, max: r2TaskMax(r2TaskById.get(t.id)!), availability: "open" as const, fields: fieldsFor(t.id) })) })) };
  return { status, bundle };
}
