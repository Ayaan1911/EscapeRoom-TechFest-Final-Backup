import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, json, readBody } from "@/lib/round2/http.server";
import { R2Error } from "@/lib/round2/common.server";
import { enrollFinalists, inspectQualification, promoteStandby, readiness } from "@/lib/round2/enrollment.server";
import { auditTrail, endRound, publishResults, reviewResults, reviewScores, resultsCsv, solutions, startRound, timing } from "@/lib/round2/organizer.server";

// Organizer-only. Authorization is enforced inside every service function (requireAdmin), not only here.
const views: Record<string, () => Promise<unknown>> = { qualification: inspectQualification, readiness, timing, scores: reviewScores, audit: () => auditTrail(), results: reviewResults, solutions };
export const GET = (req: NextRequest) => guarded(async () => {
  const view = req.nextUrl.searchParams.get("view") ?? "";
  if (view === "results-csv") return new Response(await resultsCsv(), { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": "attachment; filename=round2-results.csv" } });
  if (!Object.hasOwn(views, view)) throw new R2Error(400, "Unknown view");
  return json(await views[view]());
});
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll") }).strict(),
  z.object({ action: z.literal("promote"), standbyTeamId: z.string().min(1).max(80), replacesTeamId: z.string().min(1).max(80).optional(), reason: z.string().max(500) }).strict(),
  z.object({ action: z.literal("start") }).strict(),
  z.object({ action: z.literal("end"), reason: z.string().max(500) }).strict(),
  z.object({ action: z.literal("publish") }).strict(),
]);
export const POST = (req: NextRequest) => guarded(async () => {
  const parsed = action.safeParse(await readBody(req, 4096));
  if (!parsed.success) throw new R2Error(400, "Invalid request");
  const a = parsed.data;
  return json(a.action === "enroll" ? await enrollFinalists() : a.action === "promote" ? await promoteStandby(a) : a.action === "start" ? await startRound() : a.action === "end" ? await endRound(a.reason) : await publishResults());
});
