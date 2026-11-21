import { NextRequest } from "next/server";
import { guarded, json, readBody } from "@/lib/round2/http.server";
import { requireFinalist } from "@/lib/round2/common.server";
import { DRAFT_MAX_BYTES, listR2Drafts, saveR2Draft } from "@/lib/round2/play.server";

export const GET = () => guarded(async () => json({ drafts: await listR2Drafts(await requireFinalist()) }));
export const PUT = (req: NextRequest) => guarded(async () => {
  const teamId = await requireFinalist();
  const result = await saveR2Draft(teamId, await readBody(req, DRAFT_MAX_BYTES * 2));
  return result.ok ? json(result.draft) : json({ error: result.error, ...(result.current !== undefined ? { current: result.current } : {}) }, result.status);
});
