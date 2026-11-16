import "server-only";
import { csvCell } from "@/lib/csv";
import type { TrailEvent } from "@/types/trail";

export function trailCsv(rows: TrailEvent[]) {
  const columns: (keyof TrailEvent)[] = ["id", "timestamp", "account", "sourceIp", "eventType", "result", "method", "device", "sessionId", "conditionalAccess", "correlationId", "details"];
  return [columns.map(csvCell).join(","), ...rows.map(row => columns.map(column => csvCell(row[column])).join(","))].join("\r\n");
}
