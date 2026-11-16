import { trailAccess } from "@/lib/game/trail-access.server";
import { trailCsv } from "@/lib/game/trail-csv.server";

export async function GET() {
  const access = await trailAccess();
  if (access.status !== 200) return Response.json({ error: "Access denied" }, { status: access.status, headers: { "Cache-Control": "no-store" } });
  return new Response(trailCsv(access.evidence.rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=nexus-trail-login-events.csv", "Cache-Control": "no-store" } });
}
