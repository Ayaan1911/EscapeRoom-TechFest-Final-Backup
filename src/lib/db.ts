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
/**
 * Serializable transaction with bounded, jittered retries. PostgreSQL aborts one of two conflicting serializable
 * transactions (instead of queueing them like SQLite); retrying re-reads the winner's committed state, so a repeated
 * submission is still rejected by the same validation and can never award points twice.
 */
export async function serializable<T>(run: (tx: Prisma.TransactionClient) => Promise<T>, attempts = 8): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await db.$transaction(run, { isolationLevel: "Serializable" }); }
    catch (error) {
      const code = (error as { code?: string }).code;
      if (!code || !RETRYABLE.has(code) || attempt >= attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.random() * 25 * 2 ** Math.min(attempt, 5)));
    }
  }
}
