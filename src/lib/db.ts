import { PrismaClient } from "@prisma/client";

const globalDb = globalThis as unknown as { prisma?: PrismaClient };
function open() {
  const url = process.env.DATABASE_URL;
  // Load-tested default: one SQLite connection avoids write-lock contention (see docs/phase-7-round1-readiness.md).
  const datasourceUrl = url?.startsWith("file:") && !url.includes("connection_limit") ? `${url}${url.includes("?") ? "&" : "?"}connection_limit=1` : undefined;
  const client = new PrismaClient({ datasourceUrl, transactionOptions: { maxWait: 15_000, timeout: 15_000 } }); // queue, do not fail, during a login burst
  // WAL lets dashboard/poll reads proceed during writes and survives crashes better; the setting persists in the database file.
  if (process.env.DATABASE_URL?.startsWith("file:")) void client.$queryRawUnsafe("PRAGMA journal_mode=WAL").catch(() => undefined);
  return client;
}
export const db = globalDb.prisma ?? open();
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;
