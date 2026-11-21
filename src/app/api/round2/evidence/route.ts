import { guarded, json } from "@/lib/round2/http.server";
import { requireFinalist } from "@/lib/round2/common.server";
import { r2Bundle } from "@/lib/round2/play.server";

export const GET = () => guarded(async () => { await requireFinalist(); return json(await r2Bundle()); });
