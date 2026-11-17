import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { session } from "@/lib/auth";
import { progressSchema, status } from "./engine";
import { qualificationRows } from "./results";
import { csvCell } from "@/lib/csv";

async function snapshot(tx: Prisma.TransactionClient) {
  const round = await tx.gameSession.findUnique({ where: { id: 1 } }) ?? { startsAt: null, deadline: null, endedAt: null };
  const teams = await tx.team.findMany({ select: { id: true, name: true, variant: true, participants: true, progress: true } });
  const rows = qualificationRows(teams.map(team => ({ ...team, progress: progressSchema.parse(JSON.parse(team.progress)) })));
  const digest = createHash("sha256").update(JSON.stringify({ round, rows })).digest("hex");
  return { round, rows, digest, roundStatus: status(round) };
}
export async function qualificationReport() {
  if (!await session("admin")) return null;
  return db.$transaction(async tx => {
    const data = await snapshot(tx);
    const confirmation = await tx.auditLog.findFirst({ where: { actor: "organizer", action: "qualification-confirmed", detail: { contains: `"digest":"${data.digest}"` } }, orderBy: { createdAt: "desc" } });
    const overrides = await tx.auditLog.findMany({ where: { actor: "organizer", action: "unlock" }, orderBy: { createdAt: "asc" } });
    return { ...data, confirmation, overrides, label: data.roundStatus !== "finished" ? "PROVISIONAL" : confirmation ? "FINAL / ORGANIZER CONFIRMED" : "FINAL / PENDING ORGANIZER CONFIRMATION" };
  });
}
export async function confirmQualification(reason: string) {
  if (!await session("admin")) throw new Error("Organizer authorization required");
  if (reason.trim().length < 5 || reason.length > 500) throw new Error("Review reason required");
  return db.$transaction(async tx => {
    const data = await snapshot(tx);
    if (data.roundStatus !== "finished") throw new Error("Round must be closed before confirmation");
    if (!await tx.auditLog.findFirst({ where: { actor: "organizer", action: "qualification-confirmed", detail: { contains: `"digest":"${data.digest}"` } } })) await tx.auditLog.create({ data: { actor: "organizer", action: "qualification-confirmed", detail: JSON.stringify({ digest: data.digest, top10: data.rows.slice(0, 10).map(row => row.id), standby: data.rows.slice(10, 12).map(row => row.id), reason: reason.trim(), effect: "Review record only; no Round 2 advancement or score/progress mutation" }) } });
  }, { isolationLevel: "Serializable" });
}
export function qualificationCsv(report: NonNullable<Awaited<ReturnType<typeof qualificationReport>>>) {
  const rows = [["Rank", "Team ID", "Team", "Score", "Hints", "Completed", "Ranking state", "Candidate group", ...[1, 2, 3, 4, 5].map(i => `Chapter ${i} raw`), ...[1, 2, 3, 4, 5].map(i => `Chapter ${i} hints`), ...[1, 2, 3, 4, 5].map(i => `Chapter ${i} deduction`), "Total deduction", "Bonus", "Chapter 2 + 3 raw", "Investigation", "Override chapters"], ...report.rows.map(row => [row.rank, row.id, row.name, row.total, row.hintCount, row.completedAt === null ? "" : new Date(row.completedAt).toISOString(), report.label, row.selection, ...row.rawScores, ...row.progress.chapters.map(chapter => chapter.hints), ...row.deductions, row.totalDeduction, row.bonus, row.chapter23, row.completedAt === null ? "Incomplete" : "Complete", row.overrides.join("; ")])];
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}
