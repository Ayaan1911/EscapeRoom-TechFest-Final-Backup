import { verdictAccess } from "@/lib/game/verdict-access.server";

export async function GET(request: Request) {
  if (new URL(request.url).search) return Response.json({ error: "Access denied" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const access = await verdictAccess();
  if (access.status !== 200) return Response.json({ error: "Access denied" }, { status: access.status, headers: { "Cache-Control": "no-store" } });
  return Response.json({ evidence: access.evidence }, { headers: { "Cache-Control": "no-store" } });
}
