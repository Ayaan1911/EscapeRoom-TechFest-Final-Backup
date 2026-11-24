import { NextResponse } from "next/server";
import { denied } from "@/lib/http";
import { broadcast } from "@/lib/game/broadcast.server";

// Read-only, organizer-authenticated. No mutation, no POST.
export async function GET() {
  const board = await broadcast();
  if (!board) return denied();
  return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
}
