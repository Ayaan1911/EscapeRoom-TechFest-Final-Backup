import "server-only";
import { db } from "@/lib/db";
import { session } from "@/lib/auth";
import { isRetiredSession, openClock } from "@/lib/round2/paper/format";
import { publishedResults } from "@/lib/round2/paper/marking.server";
import { paperTiming } from "@/lib/round2/paper/service.server";
import { progressSchema, status } from "./engine";
import { buildBoard, type BoardRow } from "./projector";
import { BROADCAST_KEYS, sceneOf, type BroadcastKey, type R2Phase, type Scene } from "./broadcast";
import { qualificationReport } from "./qualification.server";

// Organizer-controlled publication flags, stored as audited events (AuditLog): the latest on/off entry wins. Default OFF.
export async function broadcastFlags(): Promise<Record<BroadcastKey, boolean>> {
  const rows = await db.auditLog.findMany({ where: { actor: "organizer", action: { in: BROADCAST_KEYS.flatMap(k => [`broadcast-${k}-on`, `broadcast-${k}-off`]) } }, orderBy: { createdAt: "desc" }, select: { action: true } });
  const out = { standings: false, finalists: false } as Record<BroadcastKey, boolean>;
  for (const k of BROADCAST_KEYS) out[k] = rows.find(r => r.action.startsWith(`broadcast-${k}-`))?.action.endsWith("-on") ?? false;
  return out;
}
export async function setBroadcast(key: BroadcastKey, on: boolean, reason: string) {
  if (!await session("admin")) throw new Error("Organizer authorization required");
  if (on && key === "finalists") {
    const q = await qualificationReport();
    if (!q?.confirmation || q.roundStatus !== "finished") throw new Error("Confirm qualification before showing finalist names");
  }
  await db.auditLog.create({ data: { actor: "organizer", action: `broadcast-${key}-${on ? "on" : "off"}`, detail: JSON.stringify({ reason }) } });
  cache = null;
}

export type BroadcastPayload = {
  scene: Scene; serverNow: number;
  r1: { status: "waiting" | "active" | "finished"; deadline: string | null };
  r2: { phase: R2Phase; endsAt: string | null; taunt: string | null };
  standings: BoardRow[] | null; finalists: string[] | null; results: { rank: number; tied: boolean; name: string; total: number }[] | null;
};
// One short shared cache: a hall of projector screens costs one set of queries per few seconds, not one per screen.
let cache: { at: number; value: Omit<BroadcastPayload, "serverNow"> } | null = null;
const TTL_MS = 3_000;

/** Organizer-only projector state. Returns null for anyone else. Contains only what the organizer has approved for display. */
export async function broadcast(): Promise<BroadcastPayload | null> {
  if (!await session("admin")) return null;
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const [round, r2row, flags, enrolled, q] = await Promise.all([
      db.gameSession.findUnique({ where: { id: 1 } }), db.r2Session.findUnique({ where: { id: 1 } }), broadcastFlags(),
      db.r2Finalist.findMany({ where: { status: "active" }, orderBy: { seed: "asc" }, select: { team: { select: { name: true } } } }),
      qualificationReport(),
    ]);
    const r1 = status(round ?? { startsAt: null, deadline: null, endedAt: null });
    const r2live = r2row && !isRetiredSession(r2row) ? r2row : null, clock = r2live ? openClock(r2live) : null;
    const r2: R2Phase = clock?.phase ?? "not_started";
    const results = r2 === "complete" ? await publishedResults() : null, taunt = r2 !== "not_started" ? (await paperTiming()).taunt : null, qualified = !!q?.confirmation && q.roundStatus === "finished";
    let standings: BoardRow[] | null = null;
    if (flags.standings) {
      const teams = await db.team.findMany({ select: { id: true, name: true, progress: true } });
      standings = buildBoard(teams.map(t => ({ id: t.id, name: t.name, progress: progressSchema.parse(JSON.parse(t.progress)) })));
    }
    cache = { at: Date.now(), value: {
      scene: sceneOf({ r1, qualified, enrolled: enrolled.length, r2, published: !!results }),
      r1: { status: r1, deadline: round?.deadline?.toISOString() ?? null },
      r2: { phase: r2, endsAt: clock && clock.phase === "running" ? new Date(clock.endsAt).toISOString() : null, taunt },
      standings, finalists: flags.finalists && qualified && enrolled.length ? enrolled.map(f => f.team.name) : null, results,
    } };
  }
  return { ...cache.value, serverNow: Date.now() };
}
