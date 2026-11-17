import { denied } from "@/lib/http";
import { qualificationReport, qualificationCsv } from "@/lib/game/qualification.server";

export async function GET() {
  const report = await qualificationReport();
  if (!report) return denied();
  return new Response(qualificationCsv(report), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=round-1-scores.csv", "Cache-Control": "no-store" } });
}
