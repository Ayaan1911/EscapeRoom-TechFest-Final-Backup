import { guarded, json } from "@/lib/round2/http.server";
import { requireFinalist } from "@/lib/round2/common.server";
import { participantStatus } from "@/lib/round2/paper/service.server";

// GHOST RETURNS. paper-40: ONLY the chapter the server clock has open. open-60: all four injects while the 60-minute clock runs, nothing otherwise.
export const GET = () => guarded(async () => { await requireFinalist(); return json(await participantStatus()); });
