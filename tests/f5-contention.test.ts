import { writeFileSync, mkdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { initialProgress, score } from "../src/lib/game/engine";
import { inboxAnswers } from "./fixtures/inbox";
import { taskAnswer } from "./fixtures/tasks";

// F5 controlled contention measurements. OPT-IN (GHOST_F5=1), disposable local PostgreSQL only. Writes test-results/f5/<label>.json.
// Env: F5_MODE=serializable|lock, F5_POOL=<connections>, F5_SCENARIOS=comma list. One process = one pool/mode configuration.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));
const pct = (a: number[], p: number) => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;

describe.skipIf(process.env.GHOST_F5 !== "1")("F5 contention", { timeout: 600_000 }, () => {
  const mode = process.env.F5_MODE ?? "serializable", pool = process.env.F5_POOL ?? "5";
  it(`mode=${mode} pool=${pool}`, async () => {
    process.env.GHOST_TX_MODE = mode === "serializable" ? "serializable" : "lock";
    const temp = await createTempDatabase("f5");
    process.env.DATABASE_URL = temp.url; process.env.DIRECT_URL = temp.url; process.env.DB_POOL_SIZE = pool;
    const { db, txStats } = await import("../src/lib/db"), service = await import("../src/lib/game/service");
    await db.gameSession.create({ data: { id: 1, startsAt: new Date(), deadline: new Date(Date.now() + 3_600_000) } });
    const results: Record<string, unknown>[] = [];
    const run = async (name: string, teams: number, perTeam: number, kind: "full" | "tasks" | "dup", jitterMs: number) => {
      const ids = Array.from({ length: teams }, (_, i) => `${name}-${String(i + 1).padStart(2, "0")}`);
      for (const id of ids) await db.team.create({ data: { id, name: id, participants: "[]", codeHash: "x", variant: "A", progress: JSON.stringify(initialProgress()) } });
      const before = { ...txStats, byCode: { ...txStats.byCode } };
      let peak = 0; const sampler = setInterval(async () => { try { const r = await db.$queryRaw<{ n: bigint }[]>`select count(*)::bigint n from pg_stat_activity where datname = current_database()`; peak = Math.max(peak, Number(r[0].n)); } catch { /* sampling only */ } }, 40);
      const lat: number[] = [], outcome: Record<string, number> = {}, codes: Record<string, number> = {};
      const tasks = ["inbox.entry", "inbox.identity", "inbox.impact"];
      const jobs = ids.flatMap(id => Array.from({ length: perTeam }, (_, k) => async () => {
        if (jitterMs) await new Promise(r => setTimeout(r, Math.random() * jitterMs));
        const t0 = performance.now();
        try {
          const r = kind === "tasks" ? await service.mutateTeam(id, 0, "submit", taskAnswer(tasks[k % 3], "A"), tasks[k % 3]) : await service.mutateTeam(id, 0, "submit", inboxAnswers.A);
          const key = "error" in (r as object) ? "handled-error" : "ok"; outcome[key] = (outcome[key] ?? 0) + 1;
        } catch (e) { const c = (e as { code?: string }).code ?? "other"; outcome["failed"] = (outcome["failed"] ?? 0) + 1; codes[c] = (codes[c] ?? 0) + 1; }
        lat.push(performance.now() - t0);
      }));
      const wall0 = performance.now(); await Promise.all(jobs.map(j => j())); const wall = performance.now() - wall0; clearInterval(sampler);
      // correctness: every team ends at exactly 15 or (if some request failed) <= 15, never above, never a duplicate award
      const rows = await db.team.findMany({ where: { id: { in: ids } } });
      const scores = rows.map(r => score(JSON.parse(r.progress)));
      const subs = await db.submission.findMany({ where: { teamId: { in: ids } }, select: { teamId: true, awarded: true } });
      const awardedByTeam = new Map<string, number>(); for (const s of subs) awardedByTeam.set(s.teamId, (awardedByTeam.get(s.teamId) ?? 0) + (s.awarded ?? 0));
      const dupAwards = ids.filter(id => (awardedByTeam.get(id) ?? 0) > 15 || (awardedByTeam.get(id) ?? 0) !== score(JSON.parse(rows.find(r => r.id === id)!.progress))).length;
      results.push({ name, mode, pool, teams, perTeam, kind, jitterMs, requests: lat.length, outcome, failureCodes: codes, p50: Math.round(pct(lat, 0.5)), p95: Math.round(pct(lat, 0.95)), p99: Math.round(pct(lat, 0.99)), wallMs: Math.round(wall),
        retries: txStats.retries - before.retries, exhausted: txStats.exhausted - before.exhausted, conflictCodes: Object.fromEntries(Object.entries(txStats.byCode).map(([k, v]) => [k, v - (before.byCode[k] ?? 0)])), peakDbConnections: peak,
        teamsAt15: scores.filter(s => s === 15).length, maxScore: Math.max(...scores), duplicateAwardIncidents: dupAwards, scoreCorrect: scores.every(s => s <= 15) && dupAwards === 0 });
    };
    const want = (process.env.F5_SCENARIOS ?? "t10,t25,t50,t50x3,t50dup,t50jit").split(",");
    if (want.includes("t10")) await run("T10", 10, 1, "full", 0);
    if (want.includes("t25")) await run("T25", 25, 1, "full", 0);
    if (want.includes("t50")) await run("T50", 50, 1, "full", 0);
    if (want.includes("t50x3")) await run("T50X3", 50, 3, "tasks", 0);
    if (want.includes("t50dup")) await run("T50DUP", 50, 3, "full", 0);
    if (want.includes("t50jit")) await run("T50JIT", 50, 1, "full", 5000);
    mkdirSync("test-results/f5", { recursive: true });
    writeFileSync(`test-results/f5/${process.env.F5_LABEL ?? `${mode}-pool${pool}`}.json`, JSON.stringify(results, null, 1));
    console.log(JSON.stringify(results.map(r => ({ s: r.name, ok: (r.outcome as Record<string, number>).ok ?? 0, err: (r.outcome as Record<string, number>)["handled-error"] ?? 0, failed: (r.outcome as Record<string, number>).failed ?? 0, p50: r.p50, p95: r.p95, p99: r.p99, retries: r.retries, exhausted: r.exhausted, codes: r.conflictCodes, peakConn: r.peakDbConnections, at15: r.teamsAt15, dup: r.duplicateAwardIncidents }))));
    await db.$disconnect(); await temp.drop();
    expect(results.every(r => r.scoreCorrect)).toBe(true); // a failed request must never corrupt or double-award
  });
});
