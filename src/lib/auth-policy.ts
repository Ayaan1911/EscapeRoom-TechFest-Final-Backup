export function authorized(session: { role: string; teamId: string | null; expiresAt: Date } | null, role: "team" | "admin", now = Date.now()) {
  return !!session && session.expiresAt.getTime() > now && session.role === role && (role === "admin" || !!session.teamId);
}

/**
 * Session cookies are Secure in production. The ONLY exception is an explicit closed-LAN rehearsal: GHOST_LAN_HTTP=1 and APP_ORIGIN not https
 * (browsers drop Secure cookies on plain-HTTP LAN addresses). Any https:// APP_ORIGIN (Render/hosted) keeps Secure on regardless of the flag.
 */
export function cookieSecure(env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV !== "production") return false;
  return !(env.GHOST_LAN_HTTP === "1" && !/^https:\/\//.test(env.APP_ORIGIN ?? ""));
}
