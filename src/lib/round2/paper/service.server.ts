import "server-only";
import { serializable } from "@/lib/db";
import { audit, R2Error, readSession, requireAdmin } from "../common.server";
import { readiness } from "../enrollment.server";
import { CHAPTERS, paperClock, schedule, TAUNTS, TAUNT_WINDOW_MS, type ChapterNo } from "./clock";
import { chapterContent } from "./content.server";
import type { ChapterView, InjectView, OpenStatus, PaperStatus } from "./types";
import { asFormat, DEFAULT_FORMAT, OPEN_BUFFER, OPEN_MS, OPEN_PACE, openClock, type Format } from "./format";
import { INJECT_CONTENT } from "./content-v2.server";

export const PAPER_VERSION = "paper-v1";
const rail = (active: number) => CHAPTERS.map(c => ({ n: c.n, title: c.title, state: (c.n < active ? "done" : c.n === active ? "active" : "locked") as "done" | "active" | "locked" }));

/** Participant status. The server clock alone decides which single chapter (if any) is returned; future and past chapters are never included. */
export async function paperStatus(now = Date.now()): Promise<PaperStatus> {
  const row = await readSession(), c = paperClock(row, now), serverNow = new Date(now).toISOString();
  if (c.phase === "not_started") return { serverNow, phase: "not_started", endsAt: null, chapter: null, rail: rail(0) };
  if (c.phase === "complete") return { serverNow, phase: "complete", endsAt: null, endedEarly: c.endedEarly, chapter: null, rail: rail(5) };
  const meta = CHAPTERS.find(x => x.n === c.chapter)!;
  const chapter: ChapterView = { n: c.chapter, title: meta.title, endsAt: new Date(c.chapterEndsAt).toISOString(), content: chapterContent(c.chapter) };
  return { serverNow, phase: "running", endsAt: new Date(c.endsAt).toISOString(), chapter, rail: rail(c.chapter) };
}

export const OPEN_VERSION = "case-v2";
/** open-60 participant status: all four injects while the clock runs, nothing before the start or after pens down. */
export async function openStatus(now = Date.now()): Promise<OpenStatus> {
  const row = await readSession(), c = openClock(row, now), serverNow = new Date(now).toISOString(), startsAt = row.startsAt?.toISOString() ?? null;
  if (c.phase === "not_started") return { format: "open-60", serverNow, phase: "not_started", startsAt: null, endsAt: null, injects: null };
  if (c.phase === "complete") return { format: "open-60", serverNow, phase: "complete", startsAt, endsAt: null, endedEarly: c.endedEarly, injects: null };
  const injects: InjectView[] = OPEN_PACE.map(p => ({ n: p.n, title: p.title, pace: { fromMin: p.fromMin, toMin: p.toMin }, content: INJECT_CONTENT[p.n] }));
  return { format: "open-60", serverNow, phase: "running", startsAt, endsAt: new Date(c.endsAt).toISOString(), injects };
}
/** The participant status for whichever format the organizer started (paper-40 when nothing has started yet, or the session says so). */
export async function participantStatus(now = Date.now()): Promise<PaperStatus | OpenStatus> {
  const row = await readSession();
  return asFormat(row.format) === "open-60" ? openStatus(now) : paperStatus(now);
}

/** Organizer view: where we are, remaining time, fixed schedule, and the taunt that is on the projector right now (if any). */
export async function paperTiming(now = Date.now()) {
  await requireAdmin();
  const row = await readSession();
  if (asFormat(row.format) === "open-60") return openTiming(row, now);
  const c = paperClock(row, now);
  let taunt: string | null = null;
  if (c.phase === "running") { const start = row.startsAt!.getTime(), meta = CHAPTERS.find(x => x.n === c.chapter)!; if (now - (start + meta.fromMin * 60_000) < TAUNT_WINDOW_MS) taunt = TAUNTS[c.chapter as ChapterNo]; }
  if (c.phase === "complete" && row.startsAt) { const end = row.endedAt ? Math.min(row.endedAt.getTime(), row.startsAt.getTime() + 40 * 60_000) : row.startsAt.getTime() + 40 * 60_000; if (now - end < TAUNT_WINDOW_MS * 3) taunt = TAUNTS[5]; }
  const base = { format: asFormat(row.format), serverNow: new Date(now).toISOString(), phase: c.phase, startsAt: row.startsAt?.toISOString() ?? null, schedule: row.startsAt ? schedule(row.startsAt).map(s => ({ at: new Date(s.at).toISOString(), event: s.event })) : null, taunt, chapters: CHAPTERS.map(x => ({ n: x.n, title: x.title })) };
  if (c.phase === "running") return { ...base, chapter: c.chapter, chapterTitle: CHAPTERS[c.chapter - 1].title, chapterEndsAt: new Date(c.chapterEndsAt).toISOString(), endsAt: new Date(c.endsAt).toISOString() };
  return { ...base, chapter: null, chapterTitle: null, chapterEndsAt: null, endsAt: c.phase === "complete" ? (row.endedAt?.toISOString() ?? null) : null };
}

function openTiming(row: { startsAt: Date | null; endedAt: Date | null }, now: number) {
  const c = openClock(row, now), start = row.startsAt?.getTime() ?? null;
  const schedule = start === null ? null : [...OPEN_PACE.map(p => ({ at: new Date(start + p.fromMin * 60_000).toISOString(), event: `Suggested: Inject ${p.n} · ${p.title} (${p.toMin - p.fromMin} min)` })),
    { at: new Date(start + OPEN_BUFFER.fromMin * 60_000).toISOString(), event: `${OPEN_BUFFER.label} (3 min)` }, { at: new Date(start + OPEN_MS).toISOString(), event: "PENS DOWN · all injects close" }];
  const base = { format: "open-60" as Format, serverNow: new Date(now).toISOString(), phase: c.phase, startsAt: row.startsAt?.toISOString() ?? null, schedule, taunt: null, chapters: OPEN_PACE.map(p => ({ n: p.n, title: p.title })) };
  if (c.phase === "running") { const p = OPEN_PACE.find(x => x.n === c.suggested);
    return { ...base, chapter: c.suggested, chapterTitle: p ? p.title : OPEN_BUFFER.label, chapterEndsAt: new Date(start! + (p ? p.toMin : OPEN_BUFFER.toMin) * 60_000).toISOString(), endsAt: new Date(c.endsAt).toISOString() }; }
  return { ...base, chapter: null, chapterTitle: null, chapterEndsAt: null, endsAt: c.phase === "complete" ? (row.endedAt?.toISOString() ?? new Date(start! + OPEN_MS).toISOString()) : null };
}

/** Start the 40-minute investigation. Explicit organizer action only. Needs enrolled finalists and a confirmed qualification (same readiness gate as before). */
export async function startPaper(format: Format = DEFAULT_FORMAT) {
  await requireAdmin();
  if (format !== "paper-40" && format !== "open-60") throw new R2Error(400, "Unknown format");
  const ready = await readiness();
  const blocking = ready.checks.filter(c => !c.ok && c.blocking && c.id !== "content-complete").map(c => c.id);
  if (blocking.length) throw new R2Error(409, "Round 2 is not ready to start", { checks: blocking });
  return serializable(async tx => {
    const row = await tx.r2Session.findUnique({ where: { id: 1 } });
    if (row?.startsAt || row?.endedAt) throw new R2Error(409, "Round 2 was already started");
    const now = new Date(), version = format === "open-60" ? OPEN_VERSION : PAPER_VERSION, minutes = format === "open-60" ? 60 : 40;
    await tx.r2Session.upsert({ where: { id: 1 }, create: { id: 1, startsAt: now, contentVersion: version, format }, update: { startsAt: now, contentVersion: version, format } });
    await audit(tx, "organizer", "start", { startsAt: now.toISOString(), contentVersion: version, format });
    return { startsAt: now, endsAt: new Date(now.getTime() + minutes * 60_000), format };
  });
}
/** Stop now: every chapter closes immediately and the PENS DOWN screen appears. */
export async function endPaper(reason: string) {
  await requireAdmin();
  const why = reason?.trim() ?? "";
  if (why.length < 5 || why.length > 500) throw new R2Error(400, "A reason of 5 to 500 characters is required");
  return serializable(async tx => {
    const row = await tx.r2Session.findUnique({ where: { id: 1 } });
    const r = row ?? { startsAt: null, endedAt: null, format: null }, open = asFormat(r.format) === "open-60";
    const c = open ? openClock(r) : paperClock(r);
    if (c.phase !== "running") throw new R2Error(409, "The investigation is not running");
    const end = new Date();
    await tx.r2Session.update({ where: { id: 1 }, data: { endedAt: end } });
    await audit(tx, "organizer", "end", { reason: why, format: asFormat(r.format), chapterAtEnd: "chapter" in c ? c.chapter : c.suggested, startsAt: row?.startsAt?.toISOString() });
    return { endedAt: end };
  });
}
