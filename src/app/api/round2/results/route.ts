import { guarded, json } from "@/lib/round2/http.server";
import { requireFinalist } from "@/lib/round2/common.server";
import { publishedResults } from "@/lib/round2/organizer.server";

// Teams see results only after an organizer explicitly publishes them.
export const GET = () => guarded(async () => { await requireFinalist(); const r = await publishedResults(); return r ? json(r) : json({ error: "Results have not been published" }, 404); });
