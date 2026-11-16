import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { session } from "@/lib/auth";
import { denied, sameOrigin } from "@/lib/http";
import { mutateTeam, teamState } from "@/lib/game/service";

export async function GET() {
  const auth = await session("team");
  if (!auth?.teamId) return denied();
  return NextResponse.json(await teamState(auth.teamId), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: NextRequest) {
  const auth = await session("team");
  if (!auth?.teamId) return denied();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (Number(req.headers.get("content-length")) > 16_384) return new NextResponse(null, { status: 413 });
  const raw = await req.text();
  if (raw.length > 16_384) return new NextResponse(null, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = z.object({ action: z.enum(["submit", "hint"]), chapter: z.number().int().min(0).max(4), answer: z.unknown().optional() }).strict().safeParse(value);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const result = await mutateTeam(auth.teamId, parsed.data.chapter, parsed.data.action, parsed.data.answer);
    return NextResponse.json(result, { status: "retryAfter" in result ? 429 : "error" in result ? 409 : 200, headers: "retryAfter" in result ? { "Retry-After": String(result.retryAfter) } : undefined });
  } catch { return NextResponse.json({ error: "Unable to save request. Refresh and retry." }, { status: 409 }); }
}
