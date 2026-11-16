import { session } from "@/lib/auth";
import { denied } from "@/lib/http";
import { leaderboard } from "@/lib/game/service";
import { hints, score } from "@/lib/game/engine";

function csv(value: string | number) { const text = String(value); return `"${(/^[=+@\-\t\r\n]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`; }
export async function GET() {
  if (!await session("admin")) return denied();
  const teams = await leaderboard();
  const rows = [["Rank", "Team ID", "Team", "Score", "Hints", "Completed"], ...teams.map((t,i) => [i+1, t.id, t.name, score(t.progress), hints(t.progress), t.progress.completedAt ? new Date(t.progress.completedAt).toISOString() : ""] )];
  return new Response(rows.map(r => r.map(csv).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=round-1-scores.csv", "Cache-Control": "no-store" } });
}
