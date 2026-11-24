import "server-only";
import { z } from "zod";
import { session } from "@/lib/auth";
import { db, serializable } from "@/lib/db";
import { initialProgress } from "./engine";
import { newInsiderFragments } from "./insider-fragments.server";

export class ReserveError extends Error { constructor(message: string) { super(message); } }
const input = z.object({ reserveId: z.string().max(40), replacesId: z.string().max(40), reason: z.string().trim().min(5).max(500), acknowledgeProgress: z.boolean().default(false) }).strict();

/** Organizer-only, audited REPLACEMENT of one primary team by a reserve account. It is a replacement, never a 31st competitor: the primary is withdrawn from every ranking in the same transaction
 *  (kept as history, nothing deleted), the reserve takes the primary's Insider group (so the active split stays 10/10/10) and starts with its OWN blank progress. Scores, terminal attempts and
 *  solved state are NEVER transferred. The reserve keeps its login ID and password. No secret is read or written here. */
export async function activateReserve(raw: unknown) {
  if (!await session("admin")) throw new ReserveError("Organizer authorization required.");
  const data = input.safeParse(raw); if (!data.success) throw new ReserveError("Choose a reserve account, the primary team it replaces, and give a reason of at least five characters.");
  const { reserveId, replacesId, reason, acknowledgeProgress } = data.data;
  return serializable(async tx => {
    const [reserve, primary] = await Promise.all([tx.team.findUnique({ where: { id: reserveId }, include: { provision: true } }), tx.team.findUnique({ where: { id: replacesId }, include: { provision: true } })]);
    if (!reserve?.provision || reserve.provision.kind !== "reserve") throw new ReserveError("The first account is not a provisioned reserve.");
    if (reserve.provision.activatedAt) throw new ReserveError("That reserve is already active.");
    if (!primary?.provision || primary.provision.kind !== "primary") throw new ReserveError("The replaced account must be a provisioned primary team.");
    if (primary.provision.withdrawnAt) throw new ReserveError("That primary slot has already been replaced.");
    const member = await tx.insiderGroupMember.findUnique({ where: { teamId: primary.id } });
    if (!member) throw new ReserveError("The primary team has no Insider group yet; provision the event first.");
    const used = JSON.stringify(JSON.parse(primary.progress)) !== JSON.stringify(initialProgress()) || await tx.submission.count({ where: { teamId: primary.id } }) > 0;
    if (used && !acknowledgeProgress) throw new ReserveError("That team already has progress. Its score and attempts are NOT transferred; tick the acknowledgement to replace it anyway.");
    const now = new Date();
    await tx.teamProvision.update({ where: { teamId: reserve.id }, data: { activatedAt: now, replacesTeamId: primary.id } });
    await tx.teamProvision.update({ where: { teamId: primary.id }, data: { withdrawnAt: now } });
    await tx.insiderAccess.upsert({ where: { teamId: reserve.id }, create: { teamId: reserve.id, ...newInsiderFragments() }, update: {} });
    await tx.insiderGroupMember.upsert({ where: { teamId: reserve.id }, create: { teamId: reserve.id, group: member.group }, update: {} }); // the slot's group, unsolved
    await tx.teamSession.deleteMany({ where: { teamId: primary.id } }); // the replaced card stops working in open browsers too
    await tx.auditLog.create({ data: { actor: "organizer", action: "reserve-activated", detail: JSON.stringify({ reserveId: reserve.id, replacesId: primary.id, group: member.group, reason, hadProgress: used }) } });
    return { reserveId: reserve.id, replacesId: primary.id, group: member.group as "A" | "B" | "C" };
  });
}

/** Non-secret roster status for the organizer page. */
export async function rosterStatus() {
  if (!await session("admin")) return null;
  const [rows, codes, members, audit] = await Promise.all([
    db.teamProvision.findMany({ orderBy: { slot: "asc" }, include: { team: { select: { name: true } } } }), db.insiderGroupCode.count(),
    db.insiderGroupMember.findMany({ select: { teamId: true, group: true } }), db.auditLog.findFirst({ where: { action: "credentials-provisioned" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, detail: true } }),
  ]);
  const groupOf = new Map(members.map(m => [m.teamId, m.group])), live = rows.filter(r => r.kind === "reserve" ? !!r.activatedAt : !r.withdrawnAt);
  const counts = { A: 0, B: 0, C: 0 }; for (const r of live) { const g = groupOf.get(r.teamId); if (g === "A" || g === "B" || g === "C") counts[g]++; }
  const slots = new Set(rows.map(r => r.slot)), bundles = [...new Set(rows.map(r => r.bundleId))];
  const primaries = rows.filter(r => r.kind === "primary"), reserves = rows.filter(r => r.kind === "reserve");
  const complete = rows.length === 32 && primaries.length === 30 && reserves.length === 2 && slots.size === 32 && bundles.length === 1;
  return { prepared: rows.length, primary: primaries.length, reserve: reserves.length, active: live.length, counts, codes, bundles, complete, matches: complete && counts.A === 10 && counts.B === 10 && counts.C === 10 && codes === 3,
    lastProvisioned: audit ? { at: audit.createdAt, detail: audit.detail } : null,
    reserves: reserves.map(r => ({ id: r.teamId, name: r.team.name, active: !!r.activatedAt, replaces: r.replacesTeamId, group: groupOf.get(r.teamId) ?? null })),
    primaries: primaries.map(r => ({ id: r.teamId, name: r.team.name, withdrawn: !!r.withdrawnAt, group: groupOf.get(r.teamId) ?? null })) };
}
