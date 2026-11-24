import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { db, serializable } from "./db";
import { digest, verifyPasswordAsync } from "./password.mjs";
import { authorized, cookieSecure } from "./auth-policy";

type Role = "team" | "admin";
// Independent per-role cookies: signing in/out as one role never touches the other.
export const cookieNames: Record<Role, string> = { team: "ghost_team_session", admin: "ghost_admin_session" };
const legacyCookie = "ghost_session"; // pre-Phase-8 shared cookie: never honoured, always cleared
export async function session(role: Role) {
  const raw = (await cookies()).get(cookieNames[role])?.value;
  const found = raw ? await db.teamSession.findUnique({ where: { tokenHash: digest(raw) } }) : null;
  return authorized(found, role) ? found : null;
}
export async function login(role: Role, typedId: string, code: string) {
  const id = role === "team" && /^team-\d{2}$/i.test(typedId) ? typedId.toUpperCase() : typedId; // final event IDs are exactly TEAM-NN; the same letters typed in lower case still reach that account
  const key = digest(`${role}:${id}`);
  // Persistent throttling also covers unknown IDs; no credentials enter audit logs.
  const allowed = await serializable(async tx => {
    const old = await tx.loginAttempt.findUnique({ where: { key } });
    const fresh = !old || Date.now() - old.windowStart.getTime() >= 15 * 60_000;
    if (!fresh && old.failures >= 10) return false;
    await tx.loginAttempt.upsert({ where: { key }, create: { key, failures: 1, windowStart: new Date() }, update: fresh ? { failures: 1, windowStart: new Date() } : { failures: { increment: 1 } } });
    return true;
  });
  if (!allowed) return false;
  const team = role === "team" ? await db.team.findUnique({ where: { id } }) : null;
  const hash = role === "admin" ? process.env.ADMIN_ACCESS_HASH : team?.codeHash;
  // Event passwords are printed as XXX-XXX-XXX (uppercase): accept the same letters typed in lower case. Any other credential is compared exactly as before.
  const supplied = role === "team" && /^[A-Za-z]{3}-[A-Za-z]{3}-[A-Za-z]{3}$/.test(code) ? code.toUpperCase() : code;
  if (!hash || !await verifyPasswordAsync(supplied, hash)) return false;
  const raw = randomBytes(32).toString("hex");
  const jar = await cookies();
  const old = jar.get(cookieNames[role])?.value;
  const legacy = jar.get(legacyCookie)?.value;
  await db.$transaction(async tx => {
    // Successful authentication must not consume the failed-attempt budget.
    await tx.loginAttempt.deleteMany({ where: { key } });
    if (legacy) await tx.teamSession.deleteMany({ where: { tokenHash: digest(legacy) } });
    if (old) await tx.teamSession.deleteMany({ where: { tokenHash: digest(old) } });
    await tx.teamSession.create({ data: { tokenHash: digest(raw), role, teamId: team?.id ?? null, expiresAt: new Date(Date.now() + 12 * 60 * 60_000) } });
  });
  jar.delete(legacyCookie);
  jar.set(cookieNames[role], raw, { httpOnly: true, secure: cookieSecure(), sameSite: "strict", path: "/", maxAge: 12 * 60 * 60 });
  return true;
}
/** Ends the given role's session only; with no role, ends every session this browser holds. */
export async function logout(role?: Role) {
  const jar = await cookies();
  for (const name of role ? [cookieNames[role]] : [...Object.values(cookieNames), legacyCookie]) {
    const raw = jar.get(name)?.value;
    if (raw) await db.teamSession.deleteMany({ where: { tokenHash: digest(raw) } });
    jar.delete(name);
  }
}
