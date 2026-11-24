import "server-only";
import type { ChapterState, TaskRow } from "@/components/game/use-chapter";
import type { ServerDraft } from "@/components/game/use-drafts";
import type { teamState } from "./service";
import { listDrafts } from "./drafts.server";

/** The serializable slice of team state every chapter desk needs. */
export function initialChapterState(state: Awaited<ReturnType<typeof teamState>>): ChapterState {
  return { progress: state.progress, score: state.score, current: state.current, status: state.status, chapterHints: state.chapterHints, serverNow: state.serverNow, round: { deadline: state.round.deadline?.toISOString() ?? null }, insiderUnlocked: state.insiderUnlocked, insiderPairs: state.insiderPairs, unlocked: state.unlocked, unlockThresholds: state.unlockThresholds, tasks: state.tasks as TaskRow[][] };
}
/** Drafts saved by this team for one chapter, so a refresh restores them without a flash of empty forms. */
export async function initialDrafts(teamId: string, chapter: number): Promise<ServerDraft[]> {
  return ((await listDrafts(teamId, chapter)) ?? []) as ServerDraft[];
}
