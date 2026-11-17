import { hints, ranking, score, type Progress } from "./engine";

export const hintDeduction = (count: number) => count === 2 ? 9 : count * 3;
export function resultTotals(progress: Progress) {
  const deductions = progress.chapters.map(chapter => hintDeduction(chapter.hints));
  return { rawScores: progress.chapters.map(chapter => chapter.score), deductions, totalDeduction: deductions.reduce((sum, value) => sum + value, 0), hintCount: hints(progress), bonus: progress.bonus, total: score(progress), completedAt: progress.completedAt };
}
export function qualificationRows<T extends { id: string; name: string; progress: Progress }>(teams: T[]) {
  return ranking(teams).map((team, i) => ({ ...team, ...resultTotals(team.progress), rank: i + 1, selection: i < 10 ? "Top 10 candidate" : i < 12 ? "Standby candidate" : "Outside selection", chapter23: team.progress.chapters[1].score + team.progress.chapters[2].score, overrides: team.progress.chapters.flatMap((chapter, i) => chapter.override ? [i + 1] : []) }));
}
