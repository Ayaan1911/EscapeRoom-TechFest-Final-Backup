import "server-only";
// Inject 2 simulated firewall terminal (open-60 format only). Pure game state: nothing here touches a real network, shell or firewall.
// Policy (documented in docs/ghost404-round2-open60.md):
//   - The only command is BLOCK <IPv4> (keyword case-insensitive). Anything else returns syntax guidance and uses NO attempt.
//   - An IPv4 address that is not on the Inject 2 monitor returns "no live connection" and uses NO attempt (typo protection; reveals nothing).
//   - Every other BLOCK uses one attempt, whether the target is an attacker connection, a cleared one, or already attempted.
//   - Four attempts per team per session, enforced in one serializable transaction plus a unique (team, session, seq) key with seq 1..4,
//     so concurrent tabs, reloads and re-logins cannot exceed the budget. The terminal also locks once every attacker target is caught,
//     and when the 60-minute clock ends. The target list never leaves the server.
import { db, serializable } from "@/lib/db";
import { audit, R2Error, readSession, requireAdmin, requireFinalist } from "../common.server";
import { asFormat, openClock } from "./format";
import { MONITOR_IPS } from "./content-v2.server";
import { caseKey } from "./private-key.server";
import type { TerminalState } from "./types";

export const MAX_BLOCKS = 4;
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
type Result = "caught" | "cleared" | "repeat";

/** Parses one terminal line. Returns the IP for a valid BLOCK command, or an error string (no attempt used). */
export function parseCommand(line: unknown): { ip: string } | { error: string } {
  if (typeof line !== "string" || line.length > 80) return { error: "Unknown command. Usage: BLOCK <IP>" };
  const m = /^\s*block\s+(\S+)\s*$/i.exec(line);
  if (!m) return { error: "Unknown command. Usage: BLOCK <IP>" };
  if (!IPV4.test(m[1])) return { error: `"${m[1].slice(0, 40)}" is not an IPv4 address. Usage: BLOCK <IP>` };
  return { ip: m[1] };
}
/** Classification for one consumed attempt. Anything on the monitor that is not an attacker target counts as cleared. */
export function classify(ip: string, previous: string[], malicious: readonly string[]): Result {
  if (previous.includes(ip)) return "repeat";
  return malicious.includes(ip) ? "caught" : "cleared";
}
function stateOf(rows: { seq: number; ip: string; result: string; createdAt: Date }[], open: boolean, malicious: readonly string[] | null): TerminalState {
  const caught = new Set(rows.filter(r => r.result === "caught").map(r => r.ip)), allCaught = !!malicious && malicious.every(ip => caught.has(ip));
  const remaining = Math.max(0, MAX_BLOCKS - rows.length);
  return { open, max: MAX_BLOCKS, remaining, allCaught, locked: !open || remaining === 0 || allCaught || !malicious, keyReady: !!malicious,
    attempts: rows.map(r => ({ seq: r.seq, ip: r.ip, result: r.result as Result, at: r.createdAt.toISOString() })) };
}
async function context(now: number) {
  const row = await readSession(), clock = openClock(row, now);
  return { row, open: asFormat(row.format) === "open-60" && clock.phase === "running" };
}
/** Current terminal state for the signed-in finalist team. */
export async function terminalState(now = Date.now()): Promise<TerminalState> {
  const teamId = await requireFinalist(), { row, open } = await context(now), key = caseKey();
  if (asFormat(row.format) !== "open-60" || !row.startsAt) return stateOf([], false, key?.inject2.malicious ?? null);
  const rows = await db.r2BlockAttempt.findMany({ where: { teamId, sessionStartsAt: row.startsAt }, orderBy: { seq: "asc" } });
  return stateOf(rows, open, key?.inject2.malicious ?? null);
}
/** Runs one terminal line for the signed-in finalist team. */
export async function runCommand(line: unknown, now = Date.now()): Promise<{ state: TerminalState; result?: Result; ip?: string; message?: string }> {
  const teamId = await requireFinalist();
  const parsed = parseCommand(line);
  if ("error" in parsed) return { state: await terminalState(now), message: parsed.error };
  if (!MONITOR_IPS.includes(parsed.ip)) return { state: await terminalState(now), message: `No live connection to ${parsed.ip} on the monitor. No attempt used.` };
  const key = caseKey();
  if (!key) throw new R2Error(409, "The terminal is awaiting the organizer's approved answer set. Write your findings on paper.");
  const malicious = key.inject2.malicious;
  return serializable(async tx => {
    const row = await readSession(tx), clock = openClock(row, now);
    if (asFormat(row.format) !== "open-60" || clock.phase !== "running" || !row.startsAt) throw new R2Error(409, "The terminal is closed. Pens down.");
    const rows = await tx.r2BlockAttempt.findMany({ where: { teamId, sessionStartsAt: row.startsAt }, orderBy: { seq: "asc" } });
    const before = stateOf(rows, true, malicious);
    if (before.locked) throw new R2Error(409, before.remaining === 0 ? "No attempts left. Ask a volunteer." : "Every attacker connection is already blocked.", { state: before });
    const result = classify(parsed.ip, rows.map(r => r.ip), malicious);
    const created = await tx.r2BlockAttempt.create({ data: { teamId, sessionStartsAt: row.startsAt, seq: rows.length + 1, ip: parsed.ip, result, createdAt: new Date(now) } });
    await audit(tx, teamId, "terminal-block", { seq: created.seq, ip: parsed.ip, result });
    return { state: stateOf([...rows, created], true, malicious), result, ip: parsed.ip };
  });
}
/** Organizer demo: classify one IP for the disposable demo terminal. Nothing is stored; the caller keeps its own local history. */
export async function demoClassify(ip: string, previous: string[]): Promise<{ result: Result | null; message?: string }> {
  await requireAdmin();
  if (!IPV4.test(ip) || !MONITOR_IPS.includes(ip)) return { result: null, message: `No live connection to ${ip.slice(0, 40)} on the monitor. No attempt used.` };
  const key = caseKey();
  if (!key) return { result: null, message: "Awaiting the approved answer set (private/round2-key-v2.json). Nothing classified." };
  return { result: classify(ip, previous.slice(0, MAX_BLOCKS), key.inject2.malicious) };
}
