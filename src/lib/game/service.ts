import { db, serializable } from "../db";
import { applyRaw, bonus, current, hints, overrideChapter, permit, points, progressSchema, ranking, score, start, status, unlockThresholds, unlocked, useHint } from "./engine";
import { catalog, criterionPoints, gradeTask, MAX_SCORED_ATTEMPTS, taskIds, taskMax } from "./scoring";
import { taskDefs, validators } from "./validators";
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
  const taskRows = await db.taskScore.findMany({ where: { teamId: id }, select: { taskId: true, earned: true } });
  const earned = new Map(taskRows.map(row => [row.taskId, row.earned]));
  return { id: team.id, name: team.name, participants: JSON.parse(team.participants) as string[], variant: team.variant, progress, score: score(progress), hints: hints(progress), current: current(progress), round, status: status(round), serverNow: Date.now(), chapterHints: progress.chapters.map((chapter, i) => validators[i]?.hints.slice(0, chapter.hints) ?? []), insiderUnlocked: !!team.insiderAccess?.unlockedAt, unlocked: points.map((_, i) => unlocked(progress, i)), unlockThresholds, tasks: catalog.map(list => list.map(task => ({ id: task.id, title: task.title, earned: earned.get(task.id) ?? 0, max: taskMax(task) }))) };
}
export async function leaderboard() {
  const teams = await db.team.findMany({ select: { id: true, name: true, progress: true, variant: true, participants: true } });
  return ranking(teams.map(t => ({ ...t, progress: progressSchema.parse(JSON.parse(t.progress)) })));
}
export async function recentAudit() {
  return db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
}
export async function mutateTeam(id: string, chapter: number, action: "submit" | "hint" | "unlock", answer: unknown, task?: string) {
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
    if (!reason && task !== undefined && (action !== "submit" || !taskIds(chapter).includes(task))) reason = "Unknown task";
    if (!reason && chapter === 2 && action === "submit" && !team.insiderAccess?.unlockedAt) reason = "Unlock the dossier using both physical fragments first";
    if (reason) {
      await tx.submission.create({ data: { teamId: id, chapter, accepted: false, reason, answer: action === "submit" ? JSON.stringify(task ? { task, answer: answer ?? null } : answer ?? null) : null } });
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
    if (action === "submit") {
      const attempts = await tx.submission.count({ where: { teamId: id, chapter, scoringVersion: { not: null } } });
      if (attempts >= MAX_SCORED_ATTEMPTS) {
        const error = "Submission limit reached for this chapter. Ask an organizer if you need it reviewed.";
        await tx.submission.create({ data: { teamId: id, chapter, accepted: false, reason: error, answer: JSON.stringify(answer ?? null) } });
        return { error };
      }
    }
    const stored = await tx.taskScore.findMany({ where: { teamId: id, chapter } });
    const recorded = JSON.stringify(task ? { task, answer: answer ?? null } : answer ?? null);
    const taskDef = task ? catalog[chapter].find(t => t.id === task)! : undefined;
    if (taskDef && (stored.find(r => r.taskId === task)?.earned ?? 0) >= taskMax(taskDef)) {
      const error = "Task already complete";
      await tx.submission.create({ data: { teamId: id, chapter, accepted: false, reason: error, answer: recorded } });
      return { error };
    }
    // A task submission is graded by that task's own schema and grader only; a chapter submission by the full-chapter validator.
    const result = task ? { correct: false, points: 0, tamperDetected: false } : validator!.validate(answer, team.variant);
    const graded = (task ? gradeTask(taskDefs[chapter], task, answer, team.variant) : validator!.grade(answer, team.variant)).filter(criterion => criterionPoints.has(criterion));
    const decidedAt = Date.now();
    if (status(round, decidedAt) !== "active") {
      const error = "Round is not active";
      await tx.submission.create({ data: { teamId: id, chapter, accepted: false, reason: error, answer: recorded } });
      return { error };
    }
    const tamperAwarded = !!result.tamperDetected && !p.bonus;
    if (tamperAwarded) {
      bonus(p);
      await tx.auditLog.create({ data: { actor: id, action: "tamper-alert", detail: JSON.stringify({ chapter }) } });
    }
    // Task scoring: every criterion is earned at most once (union with what is stored) and points are derived only from the server catalog.
    const before = p.chapters[chapter].score;
    let taskSum = 0, newlyEarned: string[] = [];
    const tasks: { id: string; earned: number; max: number }[] = [];
    for (const task of catalog[chapter]) {
      const row = stored.find(r => r.taskId === task.id);
      const had = new Set<string>(row ? JSON.parse(row.criteria) : []);
      const fresh = graded.filter(criterion => criterion.startsWith(`${task.id}:`) && !had.has(criterion));
      const all = [...had, ...fresh];
      const earned = all.reduce((n, criterion) => n + (criterionPoints.get(criterion) ?? 0), 0);
      taskSum += earned;
      tasks.push({ id: task.id, earned, max: taskMax(task) });
      if (fresh.length) {
        newlyEarned = [...newlyEarned, ...fresh];
        const data = { earned, max: taskMax(task), criteria: JSON.stringify(all) };
        await tx.taskScore.upsert({ where: { teamId_taskId: { teamId: id, taskId: task.id } }, create: { teamId: id, chapter, taskId: task.id, ...data }, update: data });
      }
    }
    const unlockedNow = applyRaw(p, chapter, taskSum, decidedAt);
    const awarded = p.chapters[chapter].score - before;
    const full = taskSum === points[chapter];
    if (awarded > 0 || unlockedNow.length || tamperAwarded) await tx.team.update({ where: { id }, data: { progress: JSON.stringify(p) } });
    for (const next of unlockedNow) await tx.auditLog.create({ data: { actor: id, action: "chapter-unlock", detail: JSON.stringify({ chapter: next, rawAfter: p.chapters[chapter].score, threshold: unlockThresholds[chapter] }) } });
    await tx.submission.create({ data: { teamId: id, chapter, accepted: full, reason: full ? "completed" : graded.length ? "partial" : "incorrect", answer: recorded, scoringVersion: 2, awarded, chapterRaw: p.chapters[chapter].score, criteria: JSON.stringify(newlyEarned) } });
    const taskResult = task ? tasks.find(t => t.id === task) : undefined;
    return { accepted: full, partial: !full && graded.length > 0, awarded, task: task ?? null, taskEarned: taskResult?.earned ?? null, taskMax: taskResult?.max ?? null, chapterRaw: p.chapters[chapter].score, chapterMax: points[chapter], tasks, unlocked: unlockedNow, tamperAwarded };
  });
}
export async function control(action: "start" | "stop" | "unlock", teamId?: string, reason?: string) {
  return serializable(async tx => {
    let chapter: number | undefined;
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
      if (status(round) !== "active") throw new Error("Round is not active");
      // Overrides advance without awarding unearned chapter points and never remove earned ones.
      chapter = overrideChapter(p, Date.now());
      await tx.team.update({ where: { id: teamId }, data: { progress: JSON.stringify(p) } });
    }
    await tx.auditLog.create({ data: { actor: "organizer", action, detail: JSON.stringify({ teamId, reason, ...(chapter === undefined ? {} : { chapter }) }) } });
  });
}
