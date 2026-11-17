import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { status } from "@/lib/game/engine";

// Unauthenticated liveness/readiness probe for hosting health checks. Returns no team data or secrets.
export async function GET() {
  try {
    const round = await db.gameSession.findUnique({ where: { id: 1 } });
    return NextResponse.json({ ok: true, database: "up", round: round ? status(round) : "waiting" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, database: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
