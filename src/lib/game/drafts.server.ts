import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { progressSchema, status, unlocked } from "./engine";
import { roundState } from "./service";
import { taskIds } from "./scoring";

export const DRAFT_MAX_BYTES = 8192;
export const NOTES_TASK = "notes"; // free-text scratchpad slot every chapter has in addition to its scored tasks
const scalar = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]);
/** Flat structured answer: a bounded map of scalars and short scalar lists. Deliberately not the scored-answer schema: drafts may be incomplete. */
export const draftData = z.record(z.string().min(1).max(60), z.union([scalar, z.array(scalar).max(20)])).refine(value => Object.keys(value).length <= 40, "Too many fields");
const request = z.object({ chapter: z.number().int().min(0).max(4), taskId: z.string().max(60), data: draftData, baseVersion: z.number().int().min(0).max(1_000_000) }).strict();
export type DraftResult =
  | { ok: true; draft: { chapter: number; taskId: string; data: unknown; version: number } }
  | { ok: false; status: 400 | 403 | 409 | 413; error: string; current?: { data: unknown; version: number } | null };

const view = (row: { chapter: number; taskId: string; data: string; version: number }) => ({ chapter: row.chapter, taskId: row.taskId, data: JSON.parse(row.data) as unknown, version: row.version });
async function teamProgress(teamId: string) {
  const team = await db.team.findUniqueOrThrow({ where: { id: teamId }, select: { progress: true } });
  return progressSchema.parse(JSON.parse(team.progress));
}
/** The team's own drafts for a chapter. Restricted to chapters the team has unlocked, so drafts can never be used to probe locked chapters. */
export async function listDrafts(teamId: string, chapter: number) {
  if (!Number.isInteger(chapter) || !unlocked(await teamProgress(teamId), chapter)) return null;
  return (await db.chapterDraft.findMany({ where: { teamId, chapter }, orderBy: { taskId: "asc" } })).map(view);
}
/**
 * Compare-and-set save. `baseVersion` is the version the client last saw (0 = no draft yet). A stale base never overwrites:
 * the caller gets 409 with the server's newer copy so it can merge. Never touches scoring, Submission or progress.
 */
export async function saveDraft(teamId: string, input: unknown): Promise<DraftResult> {
  const parsed = request.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, error: "Invalid draft" };
  const { chapter, taskId, data, baseVersion } = parsed.data;
  if (taskId !== NOTES_TASK && !taskIds(chapter).includes(taskId)) return { ok: false, status: 400, error: "Unknown task" };
  const json = JSON.stringify(data);
  if (Buffer.byteLength(json) > DRAFT_MAX_BYTES) return { ok: false, status: 413, error: "Draft too large" };
  const [progress, round] = await Promise.all([teamProgress(teamId), roundState()]);
  if (status(round) !== "active") return { ok: false, status: 403, error: "Round is not active" };
  if (!unlocked(progress, chapter)) return { ok: false, status: 403, error: "Chapter is locked" };
  const key = { teamId, chapter, taskId };
  const conflict = async (): Promise<DraftResult> => { const row = await db.chapterDraft.findUnique({ where: { teamId_chapter_taskId: key } }); return { ok: false, status: 409, error: "Draft changed elsewhere", current: row ? { data: JSON.parse(row.data), version: row.version } : null }; };
  if (baseVersion === 0) {
    try { return { ok: true, draft: view(await db.chapterDraft.create({ data: { ...key, data: json } })) }; }
    catch (error) { if ((error as { code?: string }).code === "P2002") return conflict(); throw error; }
  }
  // Single atomic statement: matches only if nobody saved since baseVersion.
  const updated = await db.chapterDraft.updateMany({ where: { ...key, version: baseVersion }, data: { data: json, version: { increment: 1 } } });
  if (updated.count !== 1) return conflict();
  return { ok: true, draft: view(await db.chapterDraft.findUniqueOrThrow({ where: { teamId_chapter_taskId: key } })) };
}
