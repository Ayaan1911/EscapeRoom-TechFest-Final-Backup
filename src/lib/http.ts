import { NextRequest, NextResponse } from "next/server";
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin === (process.env.APP_ORIGIN || request.nextUrl.origin)) return true;
  // Closed-LAN rehearsal only (GHOST_LAN_HTTP=1, no pinned APP_ORIGIN): behind `next start -H 0.0.0.0` nextUrl.origin is not the address the browser used,
  // so accept an Origin whose host equals the request Host. A cross-site page still sends a different Origin and is refused.
  if (process.env.GHOST_LAN_HTTP !== "1" || process.env.APP_ORIGIN || !origin) return false;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
export const denied = () => NextResponse.json({ error: "Access denied" }, { status: 401 });
