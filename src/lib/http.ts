import { NextRequest, NextResponse } from "next/server";
export function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === (process.env.APP_ORIGIN || request.nextUrl.origin);
}
export const denied = () => NextResponse.json({ error: "Access denied" }, { status: 401 });
