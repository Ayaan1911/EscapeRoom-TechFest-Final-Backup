import "server-only";
import { db } from "@/lib/db";
import { session } from "@/lib/auth";
import { progressSchema, status } from "./engine";
import { buildBoard, type BoardRow } from "./projector";

export type ProjectorPayload = { status: "waiting" | "active" | "finished"; serverNow: number; deadline: string | null; teams: BoardRow[] };
// One short cache shared by every projector viewer: a hall of screens costs one query per few seconds, not one per screen (Render Free is CPU-bound).
let cache: { at: number; value: Omit<ProjectorPayload, "serverNow"> } | null = null;
const TTL_MS = 5_000;

/** Organizer-only. Returns null for anyone else. */
export async function projectorBoard(): Promise<ProjectorPayload | null> {
  if (!await session("admin")) return null;
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const [round, teams] = await Promise.all([db.gameSession.findUnique({ where: { id: 1 } }), db.team.findMany({ select: { id: true, name: true, progress: true } })]);
    const board = buildBoard(teams.map(t => ({ id: t.id, name: t.name, progress: progressSchema.parse(JSON.parse(t.progress)) })));
    cache = { at: Date.now(), value: { status: status(round ?? { startsAt: null, deadline: null, endedAt: null }), deadline: round?.deadline?.toISOString() ?? null, teams: board } };
  }
  return { ...cache.value, serverNow: Date.now() };
}
