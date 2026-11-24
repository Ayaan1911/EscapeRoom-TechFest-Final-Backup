import { insiderAccess } from "@/lib/game/insider-access.server";

export async function GET() {
  const access = await insiderAccess();
  if (access.status !== 200) return Response.json({ error: "Access denied" }, { status: access.status, headers: { "Cache-Control": "no-store" } });
  return Response.json({ unlocked: access.state.insiderUnlocked, ...(access.state.insiderPairs ? { pairs: access.state.insiderPairs } : {}), ...(access.state.insiderGroup ? { group: access.state.insiderGroup } : {}), dossier: access.dossier }, { headers: { "Cache-Control": "no-store" } });
}
