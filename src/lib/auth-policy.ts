export function authorized(session: { role: string; teamId: string | null; expiresAt: Date } | null, role: "team" | "admin", now = Date.now()) {
  return !!session && session.expiresAt.getTime() > now && session.role === role && (role === "admin" || !!session.teamId);
}
