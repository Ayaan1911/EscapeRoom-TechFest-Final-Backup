import type { TrailEvent } from "@/types/trail";

export const emptyTrailFilters = { search: "", account: "", sourceIp: "", result: "", eventType: "", sessionId: "", descending: false };
export function filterTrailRows(rows: TrailEvent[], filters: typeof emptyTrailFilters) {
  const search = filters.search.trim().toLowerCase();
  return rows.filter(row => (!search || Object.values(row).some(value => value.toLowerCase().includes(search))) && (!filters.account || row.account === filters.account) && (!filters.sourceIp || row.sourceIp === filters.sourceIp) && (!filters.result || row.result === filters.result) && (!filters.eventType || row.eventType === filters.eventType) && (!filters.sessionId || row.sessionId === filters.sessionId)).sort((a, b) => (filters.descending ? -1 : 1) * (a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)));
}
