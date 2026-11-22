import { guarded, json } from "@/lib/round2/http.server";
import { requireFinalist } from "@/lib/round2/common.server";
import { paperStatus } from "@/lib/round2/paper/service.server";

// GHOST RETURNS (paper edition). Returns ONLY the chapter the server clock has currently open; never a past or future chapter.
export const GET = () => guarded(async () => { await requireFinalist(); return json(await paperStatus()); });
