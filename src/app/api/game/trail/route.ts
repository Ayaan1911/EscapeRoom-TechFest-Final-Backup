import { trailAccess } from "@/lib/game/trail-access.server";

export async function GET() {
  const access = await trailAccess();
  if (access.status !== 200) return Response.json({ error: "Access denied" }, { status: access.status, headers: { "Cache-Control": "no-store" } });
  return Response.json(access.evidence, { headers: { "Cache-Control": "no-store" } });
}
