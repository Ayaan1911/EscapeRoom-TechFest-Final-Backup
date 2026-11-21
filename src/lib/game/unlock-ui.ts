// Pure view helper for the "Continue to next chapter" UI. It NEVER decides whether a chapter is unlocked:
// `unlocked` is whatever the server reported (state.unlocked[] from /api/game, or the `unlocked` list in a confirmed submit response).
export type UnlockInput = { unlocked: readonly boolean[]; unlockThresholds: readonly number[]; progress: { chapters: readonly { score: number; completedAt: number | null }[] } };
export type NextChapterView =
  | { hasNext: false }
  | { hasNext: true; next: number; unlocked: boolean; raw: number; need: number; remaining: number; nextStarted: boolean };

export function nextChapterView(state: UnlockInput, chapter: number, confirmedByServer: readonly number[] = []): NextChapterView {
  const next = chapter + 1, need = state.unlockThresholds[chapter];
  if (next >= state.unlocked.length || need === undefined) return { hasNext: false };
  const raw = state.progress.chapters[chapter].score;
  const nextCh = state.progress.chapters[next];
  return { hasNext: true, next, need, raw, unlocked: state.unlocked[next] === true || confirmedByServer.includes(next), remaining: Math.max(0, need - raw), nextStarted: nextCh.score > 0 || nextCh.completedAt !== null };
}
