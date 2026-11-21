import { guarded, json } from "@/lib/round2/http.server";
import { requireFinalist } from "@/lib/round2/common.server";
import { r2Status } from "@/lib/round2/play.server";

export const GET = () => guarded(async () => json(await r2Status(await requireFinalist())));
