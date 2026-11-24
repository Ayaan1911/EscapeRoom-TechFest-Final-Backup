import { guarded, json } from "@/lib/round2/http.server";
import { requireFinalist } from "@/lib/round2/common.server";
import { participantStatus } from "@/lib/round2/paper/service.server";

// GHOST RETURNS Part A (the only Round 2 format): all four injects while the 60-minute clock runs, nothing before or after.
export const GET = () => guarded(async () => { await requireFinalist(); return json(await participantStatus()); });
