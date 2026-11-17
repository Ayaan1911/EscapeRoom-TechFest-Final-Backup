import { db, serializable } from "../db";
import { bonus, complete, current, hints, permit, progressSchema, ranking, score, start, status, useHint } from "./engine";
import { validators } from "./validators";
import { matchesInsiderFragments } from "./insider-fragments.server";

export async function roundState() {
  // Read first (no write on the hot polling path). The row is created once; concurrent first requests must not fail on the unique id, so use skipDuplicates instead of upsert.
  const found = await db.gameSession.findUnique({ where: { id: 1 } });
  if (found) return found;
  await db.gameSession.createMany({ data: [{ id: 1 }], skipDuplicates: true });
  return db.gameSession.findUniqueOrThrow({ where: { id: 1 } });
}
export async function teamState(id: string) {
  const team = await db.team.findUniqueOrThrow({ where: { id }, include: { insiderAccess: { select: { unlockedAt: true } } } });
  const progress = progressSchema.parse(JSON.parse(team.progress));
  const round = await roundState();
  return { id: team.id, name: team.name, participants: JSON.parse(team.participants) as string[], variant: team.variant, progress, score: score(progress), hints: hints(progress), current: current(progress), round, status: status(round), serverNow: Date.now(), chapterHints: progress.chapters.map((chapter, i) => validators[i]?.hints.slice(0, chapter.hints) ?? []), insiderUnlocked: !!team.insiderAccess?.unlockedAt };
}
export async function leaderboard() {
  const teams = await db.team.findMany({ select: { id: true, name: true, progress: true, variant: true, participants: true } });
  return ranking(teams.map(t => ({ ...t, progress: progressSchema.parse(JSON.parse(t.progress)) })));
}
export async function recentAudit() {
  return db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
}
export async function mutateTeam(id: string, chapter: number, action: "submit" | "hint" | "unlock", answer: unknown) {
  return serializable(async tx => {
    const team = await tx.team.findUniqueOrThrow({ where: { id }, include: { insiderAccess: { select: { unlockedAt: true } } } });
    const round = await tx.gameSession.findUniqueOrThrow({ where: { id: 1 } });
    const p = progressSchema.parse(JSON.parse(team.progress));
    const now = Date.now();
    let reason = "";
    try { permit(p, round, chapter, now); } catch (e) { reason = (e as Error).message; }
    const validator = validators[chapter];
    if (!reason && !validator) reason = "Chapter content is not implemented yet";
    if (!reason && action === "unlock" && chapter !== 2) reason = "Invalid unlock request";
    if (!reason && chapter === 2 && action === "submit" && !team.insiderAccess?.unlockedAt) reason = "Unlock the dossier using both physical fragments first";
    if (reason) {
      await tx.submission.create({ data: { teamId: id, chapter, accepted: false, reason, answer: action === "submit" ? JSON.stringify(answer ?? null) : null } });
      return { error: reason };
    }
    if (action === "hint") {
      if (p.chapters[chapter].hints >= 2) return { error: "Maximum two hints per chapter" };
      useHint(p, chapter);
      await tx.team.update({ where: { id }, data: { progress: JSON.stringify(p) } });
      await tx.auditLog.create({ data: { actor: id, action: "hint", detail: JSON.stringify({ chapter, number: p.chapters[chapter].hints }) } });
      return { hint: validator!.hints[p.chapters[chapter].hints - 1] };
    }
    if (action === "unlock" && team.insiderAccess?.unlockedAt) return { unlocked: true };
    const previous = await tx.submission.findFirst({ where: { teamId: id, chapter }, orderBy: { createdAt: "desc" } });
    if (previous && now - previous.createdAt.getTime() < 3000) return { error: "Please wait between evidence submissions.", retryAfter: Math.max(1, Math.ceil((3000 - (now - previous.createdAt.getTime())) / 1000)) };
    if (action === "unlock") {
      const access = await tx.insiderAccess.findUnique({ where: { teamId: id } });
      const unlocked = !!access && matchesInsiderFragments(access, answer);
      await tx.submission.create({ data: { teamId: id, chapter, accepted: false, reason: unlocked ? "dossier-unlocked" : "fragment-rejected", answer: null } });
      if (unlocked) {
        await tx.insiderAccess.update({ where: { teamId: id }, data: { unlockedAt: new Date(now) } });
        await tx.auditLog.create({ data: { actor: id, action: "dossier-unlock", detail: JSON.stringify({ chapter }) } });
      }
      return { unlocked };
    }
    const result = validator!.validate(answer, team.variant);
    const decidedAt = Date.now();
    if (status(round, decidedAt) !== "active") {
      const error = "Round is not active";
      await tx.submission.create({ data: { teamId: id, chapter, accepted: false, reason: error, answer: JSON.stringify(answer ?? null) } });
      return { error };
    }
    const tamperAwarded = !!result.tamperDetected && !p.bonus;
    if (tamperAwarded) {
      bonus(p);
      await tx.auditLog.create({ data: { actor: id, action: "tamper-alert", detail: JSON.stringify({ chapter }) } });
    }
    if (result.correct) {
      complete(p, chapter, result.points, decidedAt);
    }
    if (result.correct || tamperAwarded) {
      await tx.team.update({ where: { id }, data: { progress: JSON.stringify(p) } });
    }
    await tx.submission.create({ data: { teamId: id, chapter, accepted: result.correct, reason: result.correct ? "completed" : "incorrect", answer: JSON.stringify(answer ?? null) } });
    return { accepted: result.correct, tamperAwarded };
  });
}
export async function control(action: "start" | "stop" | "unlock", teamId?: string, reason?: string) {
  return serializable(async tx => {
    const round = await tx.gameSession.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    if (action === "start") await tx.gameSession.update({ where: { id: 1 }, data: start(round) });
    if (action === "stop") {
      if (!round.startsAt || status(round) !== "active") throw new Error("Round is not active");
      await tx.gameSession.update({ where: { id: 1 }, data: { endedAt: new Date() } });
    }
    if (action === "unlock") {
      if (!teamId || !reason?.trim()) throw new Error("Team and override reason are required");
      const t = await tx.team.findUniqueOrThrow({ where: { id: teamId } });
      const p = progressSchema.parse(JSON.parse(t.progress));
      permit(p, round, current(p));
      // Overrides advance without awarding unearned chapter points.
      complete(p, current(p), 0, Date.now(), true);
      await tx.team.update({ where: { id: teamId }, data: { progress: JSON.stringify(p) } });
    }
    await tx.auditLog.create({ data: { actor: "organizer", action, detail: JSON.stringify({ teamId, reason }) } });
  });
}
