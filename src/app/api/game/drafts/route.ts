import { NextRequest, NextResponse } from "next/server";
import { session } from "@/lib/auth";
import { denied, sameOrigin } from "@/lib/http";
import { DRAFT_MAX_BYTES, listDrafts, saveDraft } from "@/lib/game/drafts.server";

const noStore = { "Cache-Control": "no-store" };
// The team id always comes from the session cookie, never from the request: there is no way to name another team's drafts.
export async function GET(req: NextRequest) {
  const auth = await session("team");
  if (!auth?.teamId) return denied();
  const chapter = Number(req.nextUrl.searchParams.get("chapter"));
  if (!Number.isInteger(chapter) || chapter < 0 || chapter > 4) return NextResponse.json({ error: "Invalid chapter" }, { status: 400 });
  const drafts = await listDrafts(auth.teamId, chapter);
  return drafts ? NextResponse.json({ drafts }, { headers: noStore }) : NextResponse.json({ error: "Chapter is locked" }, { status: 403, headers: noStore });
}
export async function PUT(req: NextRequest) {
  const auth = await session("team");
  if (!auth?.teamId) return denied();
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (Number(req.headers.get("content-length")) > DRAFT_MAX_BYTES * 2) return new NextResponse(null, { status: 413 });
  const raw = await req.text();
  if (raw.length > DRAFT_MAX_BYTES * 2) return new NextResponse(null, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  try {
    const result = await saveDraft(auth.teamId, value);
    return result.ok ? NextResponse.json(result.draft, { headers: noStore }) : NextResponse.json({ error: result.error, ...(result.current !== undefined ? { current: result.current } : {}) }, { status: result.status, headers: noStore });
  } catch { return NextResponse.json({ error: "Unable to save draft. Retry." }, { status: 503, headers: noStore }); }
}
