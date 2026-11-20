import { z } from "zod";

export const titles = ["Inbox", "Trail", "Insider", "Containment", "Final Verdict"];
export const points = [15, 25, 25, 20, 15];
/** Raw progression thresholds: raw points in chapter i unlock chapter i+1. Applied before hints and bonus. (No imports here: node scripts load this file directly.) */
export const unlockThresholds = [8, 13, 13, 10] as const;
const chapterState = z.object({ score: z.number().int().min(0).max(25), hints: z.number().int().min(0).max(2), completedAt: z.number().nullable(), override: z.boolean(), unlockedAt: z.number().nullable().optional() });
export const progressSchema = z.object({ chapters: z.array(chapterState).length(5), bonus: z.union([z.literal(0), z.literal(5)]), completedAt: z.number().nullable() });
export type Progress = z.infer<typeof progressSchema>;
export type Round = { startsAt: Date | null; deadline: Date | null; endedAt: Date | null };
export function initialProgress(): Progress { return { chapters: points.map(() => ({ score: 0, hints: 0, completedAt: null, override: false })), bonus: 0, completedAt: null }; }
export function status(round: Round, now = Date.now()) {
  if (round.endedAt || (round.deadline && now >= round.deadline.getTime())) return "finished";
  return round.startsAt && now >= round.startsAt.getTime() ? "active" : "waiting";
}
export function start(round: Round, now = Date.now()): Round {
  if (round.startsAt || round.endedAt) throw new Error("Round already started or ended");
  return { startsAt: new Date(now), deadline: new Date(now + 60 * 60 * 1000), endedAt: null };
}
export function current(p: Progress) { return p.chapters.findIndex(c => c.completedAt === null); }
export function score(p: Progress) { return Math.min(105, Math.max(0, p.chapters.reduce<number>((n, c) => n + c.score - (c.hints === 2 ? 9 : c.hints * 3), p.bonus))); }
export function hints(p: Progress) { return p.chapters.reduce((n, c) => n + c.hints, 0); }
/** Chapter 0 is always open. Otherwise raw points in the previous chapter reach its threshold, the previous chapter was completed (legacy records, organizer override), or the unlock was already recorded. Monotonic: raw points never decrease. */
export function unlocked(p: Progress, chapter: number) {
  if (!Number.isInteger(chapter) || chapter < 0 || chapter >= points.length) return false;
  if (chapter === 0) return true;
  const previous = p.chapters[chapter - 1];
  return p.chapters[chapter].unlockedAt != null || previous.score >= unlockThresholds[chapter - 1] || previous.completedAt !== null;
}
export function permit(p: Progress, round: Round, chapter: number, now = Date.now()) {
  if (status(round, now) !== "active") throw new Error("Round is not active");
  // Completed chapters (full marks, legacy records or organizer overrides) are closed; locked ones are not yet reachable.
  if (!unlocked(p, chapter) || p.chapters[chapter].completedAt !== null) throw new Error("Chapter is locked or already completed");
}
/** Legacy sequential completion (used by organizer overrides). Overrides never lower already-earned points. */
export function complete(p: Progress, chapter: number, awarded: number, now: number, override = false) {
  if (current(p) !== chapter || chapter < 0) throw new Error("Chapter is locked or already completed");
  if (!Number.isInteger(awarded) || awarded < 0 || awarded > points[chapter]) throw new Error("Invalid trusted score");
  const c = p.chapters[chapter];
  c.score = override ? Math.max(c.score, awarded) : awarded;
  c.completedAt = now;
  c.override = override;
  if (chapter === 4) p.completedAt = now;
}
/** First incomplete chapter whose successor is still locked: the one an organizer override should complete. */
export function overrideTarget(p: Progress) {
  return p.chapters.findIndex((c, i) => c.completedAt === null && (i === points.length - 1 || !unlocked(p, i + 1)));
}
/** Organizer override: completes the target chapter (keeping any points already earned, awarding none) so its successor unlocks. Returns the chapter index. */
export function overrideChapter(p: Progress, now: number) {
  const chapter = overrideTarget(p);
  if (chapter < 0) throw new Error("No chapter to override");
  const c = p.chapters[chapter];
  c.completedAt = now; c.override = true;
  if (chapter === points.length - 1) p.completedAt = now;
  else if (p.chapters[chapter + 1].unlockedAt == null) p.chapters[chapter + 1].unlockedAt = now;
  return chapter;
}
/** Records a new raw high-water mark for a chapter (never lowers it), completes it at full marks, and records any unlock it causes. Returns the chapter indexes newly unlocked. */
export function applyRaw(p: Progress, chapter: number, raw: number, now: number) {
  if (!Number.isInteger(raw) || raw < 0 || raw > points[chapter]) throw new Error("Invalid trusted score");
  const c = p.chapters[chapter];
  c.score = Math.max(c.score, raw);
  if (c.score === points[chapter] && c.completedAt === null) { c.completedAt = now; if (chapter === 4) p.completedAt = now; }
  const next = p.chapters[chapter + 1];
  if (next && next.unlockedAt == null && unlocked(p, chapter + 1)) { next.unlockedAt = now; return [chapter + 1]; }
  return [];
}
export function useHint(p: Progress, chapter: number) {
  if (!unlocked(p, chapter) || p.chapters[chapter].completedAt !== null || p.chapters[chapter].hints >= 2) throw new Error("Hint unavailable");
  p.chapters[chapter].hints++;
}
export function bonus(p: Progress) { if (p.bonus) throw new Error("Bonus already awarded"); p.bonus = 5; }
export type RankedTeam = { id: string; name: string; progress: Progress };
export function ranking<T extends RankedTeam>(teams: T[]): T[] {
  return [...teams].sort((a,b) => score(b.progress) - score(a.progress)
    || (b.progress.chapters[1].score + b.progress.chapters[2].score) - (a.progress.chapters[1].score + a.progress.chapters[2].score)
    || hints(a.progress) - hints(b.progress)
    || (a.progress.completedAt ?? Infinity) - (b.progress.completedAt ?? Infinity)
    || a.id.localeCompare(b.id));
}

// Chapter validators run only on the server and never accept scores from clients.
export interface ChapterValidator {
  validate(answer: unknown, variant: string): { correct: boolean; points: number; tamperDetected?: boolean };
  /** Criterion ids (see scoring.ts) the answer satisfies. Pure and deterministic; never returns client-supplied points. */
  grade(answer: unknown, variant: string): string[];
  hints: readonly [string, string];
}
