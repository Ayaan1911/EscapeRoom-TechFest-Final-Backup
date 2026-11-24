import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db, serializable } from "@/lib/db";
import { audit, clockNow, R2Error, requireAdmin } from "./common.server";
import { r2Catalog, partMax } from "./catalog";
import { taskIdsWithDefs } from "./tasks.server";

export const MAX_ACTIVE = 10, MAX_STANDBY = 2;
const confirmation = z.object({ digest: z.string().min(8), top10: z.array(z.string()).max(MAX_ACTIVE), standby: z.array(z.string()).max(MAX_STANDBY) }).passthrough();
type Tx = Prisma.TransactionClient;

/** The organizer-confirmed Round 1 qualification record (Round 1 AuditLog, written by confirmQualification). Never recomputed from a leaderboard. */
async function confirmedSnapshot(tx: Tx | typeof db) {
  const row = await tx.auditLog.findFirst({ where: { actor: "organizer", action: "qualification-confirmed" }, orderBy: { createdAt: "desc" } });
  if (!row) throw new R2Error(409, "Round 1 qualification has not been confirmed by an organizer. Confirm it first; the finalist list is never inferred.");
  let parsed;
  try { parsed = confirmation.safeParse(JSON.parse(row.detail)); } catch { parsed = null; }
  if (!parsed?.success) throw new R2Error(409, "The confirmed qualification record is unreadable.");
  const { digest, top10, standby } = parsed.data;
  const all = [...top10, ...standby];
  if (new Set(all).size !== all.length) throw new R2Error(409, "The confirmed qualification record lists a team twice.");
  const found = await tx.team.findMany({ where: { id: { in: all } }, select: { id: true, name: true } });
  if (found.length !== all.length) throw new R2Error(409, "A confirmed team no longer exists.");
  return { digest, top10, standby, confirmedAt: row.createdAt, names: new Map(found.map(t => [t.id, t.name])) };
}
export async function inspectQualification() {
  await requireAdmin();
  const s = await confirmedSnapshot(db);
  const enrolled = await db.r2Finalist.findMany({ orderBy: { seed: "asc" } });
  return { digest: s.digest, confirmedAt: s.confirmedAt, top10: s.top10.map(id => ({ id, name: s.names.get(id) })), standby: s.standby.map(id => ({ id, name: s.names.get(id) })), enrolled: enrolled.map(f => ({ teamId: f.teamId, status: f.status, seed: f.seed, snapshotDigest: f.snapshotDigest })) };
}
/** Enroll a confirmed snapshot as Round 2 finalists inside an open transaction. Idempotent for the same snapshot; refuses a different one. */
export async function enrollFromSnapshot(tx: Tx, s: { digest: string; top10: string[]; standby: string[] }) {
  const existing = await tx.r2Finalist.findMany();
  if (existing.length) {
    if (existing.every(f => f.snapshotDigest === s.digest)) return { enrolled: existing.length, unchanged: true };
    throw new R2Error(409, "Finalists are already enrolled from a different qualification snapshot. Use standby promotion for changes.");
  }
  await tx.r2Finalist.createMany({ data: [...s.top10.map((teamId, i) => ({ teamId, status: "active", seed: i + 1, snapshotDigest: s.digest })), ...s.standby.map((teamId, i) => ({ teamId, status: "standby", seed: MAX_ACTIVE + i + 1, snapshotDigest: s.digest }))] });
  await audit(tx, "organizer", "enroll", { digest: s.digest, active: s.top10, standby: s.standby });
  return { enrolled: s.top10.length + s.standby.length, unchanged: false };
}
/** Enroll finalists from an already-confirmed snapshot (fallback for a confirmation that was recorded without advancing). Only before the round starts. */
export async function enrollFinalists() {
  await requireAdmin();
  return serializable(async tx => {
    const { clock } = await clockNow(tx);
    if (clock.phase !== "not_started" || clock.startsAt) throw new R2Error(409, "Round 2 has started; use standby promotion for roster changes.");
    return enrollFromSnapshot(tx, await confirmedSnapshot(tx));
  });
}
/**
 * Promote a standby team. Needs a reason. If 10 teams are active, `replacesTeamId` (an active team) is required and becomes withdrawn.
 * After the round has started, only a team with NO Round 2 submissions can be replaced, and never once the round is finished.
 */
export async function promoteStandby(input: { standbyTeamId: string; replacesTeamId?: string; reason: string }) {
  await requireAdmin();
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 5 || reason.length > 500) throw new R2Error(400, "A reason of 5 to 500 characters is required");
  return serializable(async tx => {
    const { clock } = await clockNow(tx);
    if (clock.phase === "finished") throw new R2Error(409, "Round 2 is finished; the roster is frozen.");
    const standby = await tx.r2Finalist.findUnique({ where: { teamId: input.standbyTeamId } });
    if (standby?.status !== "standby") throw new R2Error(409, "That team is not on standby.");
    const active = await tx.r2Finalist.count({ where: { status: "active" } });
    let replaced: string | null = null;
    if (active >= MAX_ACTIVE || input.replacesTeamId) {
      const out = input.replacesTeamId ? await tx.r2Finalist.findUnique({ where: { teamId: input.replacesTeamId } }) : null;
      if (out?.status !== "active") throw new R2Error(409, "An active finalist to replace is required.");
      if (clock.startsAt && await tx.r2Submission.count({ where: { teamId: out.teamId } })) throw new R2Error(409, "A team that has already submitted in a started round cannot be replaced.");
      await tx.r2Finalist.update({ where: { teamId: out.teamId }, data: { status: "withdrawn", statusChangedAt: new Date(), note: `replaced by ${standby.teamId}: ${reason}` } });
      replaced = out.teamId;
    }
    await tx.r2Finalist.update({ where: { teamId: standby.teamId }, data: { status: "active", statusChangedAt: new Date(), note: `promoted: ${reason}` } });
    await audit(tx, "organizer", "promote-standby", { promoted: standby.teamId, replaced, reason, roundStarted: !!clock.startsAt });
    return { promoted: standby.teamId, replaced };
  });
}
type Check = { id: string; ok: boolean; blocking: boolean; message: string };
export async function readiness() {
  await requireAdmin();
  const { clock } = await clockNow();
  const [rows, confirmed] = await Promise.all([db.r2Finalist.groupBy({ by: ["status"], _count: true }), db.auditLog.count({ where: { actor: "organizer", action: "qualification-confirmed" } })]);
  const n = (s: string) => rows.find(r => r.status === s)?._count ?? 0;
  const content = partMax("A") === 60 && partMax("B") === 40 && r2Catalog.every(t => taskIdsWithDefs.includes(t.id));
  const checks: Check[] = [
    { id: "qualification-confirmed", ok: confirmed > 0, blocking: true, message: "Round 1 qualification confirmed by an organizer" },
    { id: "finalists-enrolled", ok: n("active") > 0, blocking: true, message: "Finalists enrolled from the confirmed snapshot" },
    { id: "content-complete", ok: content, blocking: true, message: "Content complete: Part A = 60, Part B = 40, every task has a grader" },
    { id: "round-not-started", ok: clock.phase === "not_started" && !clock.startsAt, blocking: true, message: "Round 2 has not already been started" },
    { id: "ten-active", ok: n("active") === MAX_ACTIVE, blocking: false, message: n("active") === MAX_ACTIVE ? `${MAX_ACTIVE} qualified teams enrolled` : `Only ${n("active")} of ${MAX_ACTIVE} qualified teams are enrolled. Check the qualification review before starting.` },
    { id: "two-standby", ok: n("standby") === MAX_STANDBY, blocking: false, message: `${n("standby")} of ${MAX_STANDBY} standby teams` },
  ];
  return { ready: checks.every(c => c.ok || !c.blocking), checks, active: n("active"), standby: n("standby"), withdrawn: n("withdrawn"), phase: clock.phase, confirmed: confirmed > 0, expected: MAX_ACTIVE };
}
