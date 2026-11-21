import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { session } from "@/lib/auth";
import { r2Clock, type R2Session } from "./clock";

/** Expected, user-facing failure with an HTTP status. Deliberately has no `code` so serializable() never retries it. */
export class R2Error extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 429, message: string, public extra?: Record<string, unknown>) { super(message); }
}
type Tx = Prisma.TransactionClient | typeof db;
export const NO_SESSION: R2Session = { startsAt: null, endedAt: null };

/** Organizer authorization. Every privileged Round 2 operation calls this itself; routes are not trusted to have checked. */
export async function requireAdmin() {
  if (!await session("admin")) throw new R2Error(401, "Organizer authorization required");
}
/** The authenticated team, which must be an ACTIVE finalist. The team id only ever comes from the session cookie. */
export async function requireFinalist(): Promise<string> {
  const auth = await session("team");
  if (!auth?.teamId) throw new R2Error(401, "Sign in as a team");
  const finalist = await db.r2Finalist.findUnique({ where: { teamId: auth.teamId }, select: { status: true } });
  if (finalist?.status !== "active") throw new R2Error(403, "Round 2 is open to confirmed finalists only");
  return auth.teamId;
}
export async function readSession(tx: Tx = db) {
  return (await tx.r2Session.findUnique({ where: { id: 1 } })) ?? { id: 1, ...NO_SESSION, resultsPublishedAt: null as Date | null, contentVersion: null as string | null, scoringPolicy: null as string | null };
}
export async function clockNow(tx: Tx = db, now = Date.now()) {
  const row = await readSession(tx);
  return { row, clock: r2Clock(row, now), now };
}
export const audit = (tx: Tx, actor: string, action: string, detail: unknown) => tx.r2Audit.create({ data: { actor, action, detail: JSON.stringify(detail) } });
