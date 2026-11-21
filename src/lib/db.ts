import { Prisma, PrismaClient } from "@prisma/client";

const globalDb = globalThis as unknown as { prisma?: PrismaClient };
function open() {
  // DATABASE_URL is the pooled PostgreSQL URL (Neon pgbouncer). Keep the app pool small: one Node process, free-tier connection limits.
  const url = process.env.DATABASE_URL;
  const datasourceUrl = url && !url.includes("connection_limit") ? `${url}${url.includes("?") ? "&" : "?"}connection_limit=${process.env.DB_POOL_SIZE ?? "5"}` : undefined;
  return new PrismaClient({ datasourceUrl, transactionOptions: { maxWait: 15_000, timeout: 15_000 } }); // queue, do not fail, during a login burst
}
export const db = globalDb.prisma ?? open();
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;

const RETRYABLE = new Set(["P2034", "P2002", "P2028"]); // write conflict / serialization failure, unique race, transaction expired while queued
/** Process-wide transaction counters (cheap; read by load tests and the readiness view to show retry pressure). */
export const txStats = { transactions: 0, retries: 0, exhausted: 0, byCode: {} as Record<string, number> };
/**
 * Serializable transaction with bounded, jittered retries. PostgreSQL aborts one of two conflicting serializable
 * transactions (instead of queueing them like SQLite); retrying re-reads the winner's committed state, so a repeated
 * submission is still rejected by the same validation and can never award points twice.
 */
export async function serializable<T>(run: (tx: Prisma.TransactionClient) => Promise<T>, attempts = 8): Promise<T> {
  txStats.transactions++;
  for (let attempt = 1; ; attempt++) {
    try { return await db.$transaction(run, { isolationLevel: "Serializable" }); }
    catch (error) {
      const code = (error as { code?: string }).code;
      if (!code || !RETRYABLE.has(code)) throw error;
      txStats.byCode[code] = (txStats.byCode[code] ?? 0) + 1;
      if (attempt >= attempts) { txStats.exhausted++; throw error; }
      txStats.retries++;
      await new Promise(resolve => setTimeout(resolve, Math.random() * 25 * 2 ** Math.min(attempt, 5)));
    }
  }
}
/**
 * Per-team transaction. Every competition write that matters is scoped to ONE team, so instead of letting PostgreSQL's serializable
 * predicate locks arbitrate (they are page/relation granular on small tables and abort UNRELATED teams: measured in docs/phase6a-release-hardening.md),
 * take a per-team advisory lock and run READ COMMITTED. The round row is locked FOR SHARE, so an organizer stop/end (which updates it) waits for
 * in-flight submissions and every later submission sees it. Default since Phase 6A; GHOST_TX_MODE=serializable restores the old behaviour.
 */
export async function teamTx<T>(teamId: string, run: (tx: Prisma.TransactionClient) => Promise<T>, round: "GameSession" | "R2Session" = "GameSession"): Promise<T> {
  if (process.env.GHOST_TX_MODE === "serializable") return serializable(run);
  txStats.transactions++;
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${teamId}))`;
    if (round === "GameSession") await tx.$queryRaw`SELECT 1 FROM "GameSession" WHERE id = 1 FOR SHARE`; else await tx.$queryRaw`SELECT 1 FROM "R2Session" WHERE id = 1 FOR SHARE`;
    return run(tx);
  }, { isolationLevel: "ReadCommitted" });
}
/** Inside a transaction that already runs in lock mode, take the team lock (no-op in the legacy serializable mode). */
export const lockTeam = async (tx: Prisma.TransactionClient, teamId: string) => { if (process.env.GHOST_TX_MODE !== "serializable") await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${teamId}))`; };
