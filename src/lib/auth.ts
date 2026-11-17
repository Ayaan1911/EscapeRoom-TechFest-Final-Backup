import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { digest, verifyPasswordAsync } from "./password.mjs";
import { authorized } from "./auth-policy";

export const cookieName = "ghost_session";
export async function session(role: "team" | "admin") {
  const raw = (await cookies()).get(cookieName)?.value;
  const found = raw ? await db.teamSession.findUnique({ where: { tokenHash: digest(raw) } }) : null;
  return authorized(found, role) ? found : null;
}
export async function login(role: "team" | "admin", id: string, code: string) {
  const key = digest(`${role}:${id}`);
  // Persistent throttling also covers unknown IDs; no credentials enter audit logs.
  const allowed = await db.$transaction(async tx => {
    const old = await tx.loginAttempt.findUnique({ where: { key } });
    const fresh = !old || Date.now() - old.windowStart.getTime() >= 15 * 60_000;
    if (!fresh && old.failures >= 10) return false;
    await tx.loginAttempt.upsert({ where: { key }, create: { key, failures: 1, windowStart: new Date() }, update: fresh ? { failures: 1, windowStart: new Date() } : { failures: { increment: 1 } } });
    return true;
  });
  if (!allowed) return false;
  const team = role === "team" ? await db.team.findUnique({ where: { id } }) : null;
  const hash = role === "admin" ? process.env.ADMIN_ACCESS_HASH : team?.codeHash;
  if (!hash || !await verifyPasswordAsync(code, hash)) return false;
  const raw = randomBytes(32).toString("hex");
  const jar = await cookies();
  const old = jar.get(cookieName)?.value;
  await db.$transaction(async tx => {
    if (old) await tx.teamSession.deleteMany({ where: { tokenHash: digest(old) } });
    await tx.teamSession.create({ data: { tokenHash: digest(raw), role, teamId: team?.id ?? null, expiresAt: new Date(Date.now() + 12 * 60 * 60_000) } });
  });
  jar.set(cookieName, raw, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 12 * 60 * 60 });
  return true;
}
export async function logout() {
  const jar = await cookies();
  const raw = jar.get(cookieName)?.value;
  if (raw) await db.teamSession.deleteMany({ where: { tokenHash: digest(raw) } });
  jar.delete(cookieName);
}
