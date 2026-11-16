import { z } from "zod";

export const titles = ["Inbox", "Trail", "Insider", "Containment", "Final Verdict"];
export const points = [15, 25, 25, 20, 15];
const chapterState = z.object({ score: z.number().int().min(0).max(25), hints: z.number().int().min(0).max(2), completedAt: z.number().nullable(), override: z.boolean() });
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
export function score(p: Progress) { return Math.max(0, p.chapters.reduce<number>((n, c) => n + c.score - (c.hints === 2 ? 9 : c.hints * 3), p.bonus)); }
export function hints(p: Progress) { return p.chapters.reduce((n, c) => n + c.hints, 0); }
export function permit(p: Progress, round: Round, chapter: number, now = Date.now()) {
  if (status(round, now) !== "active") throw new Error("Round is not active");
  if (!Number.isInteger(chapter) || chapter < 0 || chapter >= 5 || current(p) !== chapter) throw new Error("Chapter is locked or already completed");
}
export function complete(p: Progress, chapter: number, awarded: number, now: number, override = false) {
  if (current(p) !== chapter || chapter < 0) throw new Error("Chapter is locked or already completed");
  if (!Number.isInteger(awarded) || awarded < 0 || awarded > points[chapter]) throw new Error("Invalid trusted score");
  p.chapters[chapter].score = awarded;
  p.chapters[chapter].completedAt = now;
  p.chapters[chapter].override = override;
  if (chapter === 4) p.completedAt = now;
}
export function useHint(p: Progress, chapter: number) {
  if (current(p) !== chapter || chapter < 0 || p.chapters[chapter].hints >= 2) throw new Error("Hint unavailable");
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
  hints: readonly [string, string];
}
