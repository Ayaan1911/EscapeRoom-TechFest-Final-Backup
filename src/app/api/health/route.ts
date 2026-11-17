import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { status } from "@/lib/game/engine";

const headers = { "Cache-Control": "no-store" };
// Unauthenticated probe; returns no team data or secrets.
//   /api/health        liveness only (no database access, so frequent platform health checks never wake a scale-to-zero database)
//   /api/health?db=1   readiness: also queries the database and reports the round state (use for manual and post-deploy checks)
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("db") !== "1") return NextResponse.json({ ok: true }, { headers });
  try {
    const round = await db.gameSession.findUnique({ where: { id: 1 } });
    return NextResponse.json({ ok: true, database: "up", round: round ? status(round) : "waiting" }, { headers });
  } catch {
    return NextResponse.json({ ok: false, database: "down" }, { status: 503, headers });
  }
}
