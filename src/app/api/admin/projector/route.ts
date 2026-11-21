import { NextResponse } from "next/server";
import { denied } from "@/lib/http";
import { projectorBoard } from "@/lib/game/projector.server";

// Read-only, organizer-authenticated. No mutation, no POST.
export async function GET() {
  const board = await projectorBoard();
  if (!board) return denied();
  return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
}
