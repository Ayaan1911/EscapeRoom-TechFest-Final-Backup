import { db } from "../db";
import { bonus, complete, current, hints, permit, progressSchema, ranking, score, start, status, useHint } from "./engine";
import { validators } from "./validators";

export async function roundState() {
  return db.gameSession.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}
export async function teamState(id: string) {
  const team = await db.team.findUniqueOrThrow({ where: { id } });
  const progress = progressSchema.parse(JSON.parse(team.progress));
  const round = await roundState();
  return { id: team.id, name: team.name, participants: JSON.parse(team.participants) as string[], variant: team.variant, progress, score: score(progress), hints: hints(progress), current: current(progress), round, status: status(round), serverNow: Date.now() };
}
export async function leaderboard() {
  const teams = await db.team.findMany({ select: { id: true, name: true, progress: true, variant: true, participants: true } });
  return ranking(teams.map(t => ({ ...t, progress: progressSchema.parse(JSON.parse(t.progress)) })));
}
export async function recentAudit() {
  return db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
}
export async function mutateTeam(id: string, chapter: number, action: "submit" | "hint", answer: unknown) {
  return db.$transaction(async tx => {
    const team = await tx.team.findUniqueOrThrow({ where: { id } });
    const round = await tx.gameSession.findUniqueOrThrow({ where: { id: 1 } });
    const p = progressSchema.parse(JSON.parse(team.progress));
    const now = Date.now();
    let reason = "";
    try { permit(p, round, chapter, now); } catch (e) { reason = (e as Error).message; }
    const validator = validators[chapter];
    if (!reason && !validator) reason = "Chapter content is not implemented yet";
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
    const result = validator!.validate(answer, team.variant);
    if (result.correct) {
      complete(p, chapter, result.points, now);
      if (result.tamperDetected && !p.bonus) bonus(p);
      await tx.team.update({ where: { id }, data: { progress: JSON.stringify(p) } });
    }
    await tx.submission.create({ data: { teamId: id, chapter, accepted: result.correct, reason: result.correct ? "completed" : "incorrect", answer: JSON.stringify(answer ?? null) } });
    return { accepted: result.correct };
  }, { isolationLevel: "Serializable" });
}
export async function control(action: "start" | "stop" | "unlock", teamId?: string, reason?: string) {
  return db.$transaction(async tx => {
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
  }, { isolationLevel: "Serializable" });
}
