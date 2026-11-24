import "server-only";
// Kill Switch simulated SOC terminal (Round 2, Inject 2). Pure game state: nothing here touches a real network, shell or firewall.
// Policy (docs/ghost404-round2-open60.md):
//   - BLOCK <ipv4> (keyword case-insensitive, exactly one argument). help / clear are handled by the browser and never reach the server.
//   - Unknown command, missing IP, invalid IP, too many arguments, an IP not on the monitor, an IP the team already blocked, and any
//     command after the terminal locked: a message only, NO attempt used.
//   - A first BLOCK of a monitored IP uses one attempt, right or wrong. Four per team per session, enforced in one serializable
//     transaction plus a unique (team, session, seq) key with seq 1..4: tabs, reloads, re-logins and parallel requests cannot exceed it.
//   - Locks when both attacker connections are contained, when attempts run out, at pens down / early end, or without an approved key.
//   - Feedback lines are built here, after the attempt is committed, and only for that IP. The target list never leaves the server.
//   - Score (15 max) is derived from the stored attempts every time it is read, so it cannot drift or be farmed.
import { db, serializable } from "@/lib/db";
import { audit, R2Error, readSession, requireAdmin, requireFinalist } from "../common.server";
import { FORMAT, openClock } from "./format";
import { MONITOR_IPS } from "./content-v2.server";
import { caseKey, type CaseKey } from "./private-key.server";
import type { AttemptResult, TerminalState } from "./types";

export const MAX_BLOCKS = 4;
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const USAGE = "Usage: BLOCK <ip address>";
export type Line = { kind: "ok" | "bad" | "warn" | "info" | "fail"; text: string };

/** Parses one terminal line. Returns the IP for a valid BLOCK command, or the exact message to show (no attempt used). */
export function parseCommand(line: unknown): { ip: string } | { message: string } {
  if (typeof line !== "string" || line.length > 120) return { message: `Unknown command. ${USAGE}` };
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (!parts.length || parts[0].toLowerCase() !== "block") return { message: `Unknown command. ${USAGE}` };
  if (parts.length === 1) return { message: `Missing IP address. ${USAGE}` };
  if (parts.length > 2) return { message: `Too many arguments. ${USAGE}` };
  if (!IPV4.test(parts[1])) return { message: "Invalid IP address format." };
  return { ip: parts[1] };
}
/** 15-point Kill Switch terminal score from committed attempts: +5 per attacker connection contained, +5 if no legitimate connection
 *  was blocked, -2 per legitimate connection blocked, clamped to 0..15. An untouched terminal scores 5 (formula as written; see docs). */
export function terminalScore(results: readonly string[]): number {
  const caught = Math.min(2, results.filter(r => r === "caught").length), wrong = results.filter(r => r === "cleared").length;
  return Math.max(0, Math.min(15, caught * 5 + (wrong === 0 ? 5 : 0) - 2 * wrong));
}
const wrongLine = (key: CaseKey, ip: string) => key.inject2.wrongMessages[ip] ?? "A legitimate service just went down.";
function attemptLine(key: CaseKey, ip: string, result: AttemptResult, containedSoFar: number): string {
  return result === "caught" ? `[OK] ${ip} BLOCKED. Suspicious traffic stopped. ${containedSoFar} of ${key.inject2.malicious.length} threats contained.` : `[BLOCKED] ${ip}. ${wrongLine(key, ip)}`;
}
type Row = { seq: number; ip: string; result: string; createdAt: Date };
function stateOf(rows: Row[], open: boolean, key: CaseKey | null): TerminalState {
  const caught = new Set(rows.filter(r => r.result === "caught").map(r => r.ip)), total = key?.inject2.malicious.length ?? 2;
  const contained = caught.size, remaining = Math.max(0, MAX_BLOCKS - rows.length);
  const lockReason = !key ? "no-key" : contained >= total ? "contained" : remaining === 0 ? "exhausted" : !open ? "closed" : "none";
  let n = 0;
  const attempts = rows.map(r => { const result = (r.result === "caught" ? "caught" : "cleared") as AttemptResult; if (result === "caught") n++;
    return { seq: r.seq, ip: r.ip, result, at: r.createdAt.toISOString(), message: key ? attemptLine(key, r.ip, result, n) : "" }; });
  return { open, max: MAX_BLOCKS, remaining, contained, locked: lockReason !== "none", lockReason, attempts };
}
/** Lines that close a terminal: shown once after the attempt that locked it, and again whenever the history is reloaded. */
export function closingLines(st: TerminalState): Line[] {
  if (st.lockReason === "contained") return [{ kind: "ok", text: "[OK] Both threats contained. Terminal locked." }];
  if (st.lockReason === "exhausted") return [{ kind: "fail", text: "[FAIL] Out of attempts. Terminal locked. See a volunteer." }, { kind: "bad", text: "CALL THE VOLUNTEERS . ASAP , IT IS EATING THE DATABASE !!" }];
  return [];
}
async function sessionContext(now: number) {
  const row = await readSession();
  const open = row.format === FORMAT && openClock(row, now).phase === "running";
  return { row, open };
}

// Rate limit: at most 6 terminal commands per team per 10 seconds (single-process event server). A refused command changes nothing.
const RATE = { max: 6, windowMs: 10_000 }, recent = new Map<string, number[]>();
function rateLimited(teamId: string, now: number) {
  const list = (recent.get(teamId) ?? []).filter(t => now - t < RATE.windowMs);
  if (list.length >= RATE.max) { recent.set(teamId, list); return true; }
  list.push(now); recent.set(teamId, list); return false;
}
export const resetRateLimit = () => recent.clear();

/** Current terminal state for the signed-in finalist team (only its own attempts). */
export async function terminalState(now = Date.now()): Promise<TerminalState> {
  const teamId = await requireFinalist(), { row, open } = await sessionContext(now), key = caseKey();
  if (row.format !== FORMAT || !row.startsAt) return stateOf([], false, key);
  const rows = await db.r2BlockAttempt.findMany({ where: { teamId, sessionStartsAt: row.startsAt }, orderBy: { seq: "asc" } });
  return stateOf(rows, open, key);
}
/** Runs one BLOCK line for the signed-in finalist team. Returns the new state and the lines to print. */
export async function runCommand(line: unknown, now = Date.now()): Promise<{ state: TerminalState; lines: Line[]; used: boolean }> {
  const teamId = await requireFinalist();
  if (rateLimited(teamId, now)) throw new R2Error(429, "Too many commands. Wait a few seconds; no attempt was used.");
  const parsed = parseCommand(line);
  if ("message" in parsed) return { state: await terminalState(now), lines: [{ kind: "warn", text: parsed.message }], used: false };
  const key = caseKey();
  return serializable(async tx => {
    const row = await readSession(tx), open = row.format === FORMAT && openClock(row, now).phase === "running";
    const rows = row.startsAt && row.format === FORMAT ? await tx.r2BlockAttempt.findMany({ where: { teamId, sessionStartsAt: row.startsAt }, orderBy: { seq: "asc" } }) : [];
    const before = stateOf(rows, open, key);
    if (!key) return { state: before, lines: [{ kind: "warn", text: "Terminal offline: awaiting the organizer's approved answer set. Write your findings on paper." }], used: false };
    if (!open) return { state: before, lines: [{ kind: "warn", text: "Round 2 is not running. Terminal locked." }], used: false };
    if (before.locked) return { state: before, lines: [{ kind: "warn", text: "Terminal locked." }], used: false };
    if (!MONITOR_IPS.includes(parsed.ip)) return { state: before, lines: [{ kind: "warn", text: "Not a connection on this list." }], used: false };
    if (rows.some(r => r.ip === parsed.ip)) return { state: before, lines: [{ kind: "warn", text: "Already blocked." }], used: false };
    const result: AttemptResult = key.inject2.malicious.includes(parsed.ip) ? "caught" : "cleared";
    const created = await tx.r2BlockAttempt.create({ data: { teamId, sessionStartsAt: row.startsAt!, seq: rows.length + 1, ip: parsed.ip, result, createdAt: new Date(now) } });
    await audit(tx, teamId, "terminal-block", { seq: created.seq, ip: parsed.ip, result });
    const after = stateOf([...rows, created], true, key), last = after.attempts[after.attempts.length - 1];
    return { state: after, lines: [{ kind: result === "caught" ? "ok" : "bad", text: last.message }, ...closingLines(after)], used: true };
  });
}

/** Organizer / volunteer review: every active finalist's attempts, lock state and derived 15-point terminal score. */
export async function terminalReview(now = Date.now()) {
  await requireAdmin();
  const row = await readSession(), key = caseKey(), open = row.format === FORMAT && openClock(row, now).phase === "running";
  const finalists = await db.r2Finalist.findMany({ where: { status: "active" }, include: { team: { select: { name: true } } }, orderBy: { seed: "asc" } });
  const rows = row.startsAt && row.format === FORMAT ? await db.r2BlockAttempt.findMany({ where: { sessionStartsAt: row.startsAt }, orderBy: [{ teamId: "asc" }, { seq: "asc" }] }) : [];
  return {
    keyReady: !!key, keyStatus: key?.inject2.status ?? null, open, maxScore: 15,
    teams: finalists.map(f => { const mine = rows.filter(r => r.teamId === f.teamId), st = stateOf(mine, open, key);
      return { teamId: f.teamId, name: f.team.name, attempts: st.attempts.map(a => ({ seq: a.seq, ip: a.ip, result: a.result, at: a.at })), remaining: st.remaining, contained: st.contained, lockReason: st.lockReason, untouched: mine.length === 0, score: key ? terminalScore(mine.map(r => r.result)) : null }; }),
  };
}

/** Organizer-only: whether the private answer key is installed on this server. Reveals nothing about its contents. */
export async function keyInstalled() { await requireAdmin(); return caseKey() !== null; }

/** Organizer demo: classify one IP for the disposable demo terminal. Nothing is stored; the browser keeps its own history. */
export async function demoClassify(ip: string, previous: string[]): Promise<{ lines: Line[]; result: AttemptResult | null }> {
  await requireAdmin();
  const parsed = parseCommand(`BLOCK ${ip}`);
  if ("message" in parsed) return { lines: [{ kind: "warn", text: parsed.message }], result: null };
  if (!MONITOR_IPS.includes(parsed.ip)) return { lines: [{ kind: "warn", text: "Not a connection on this list." }], result: null };
  if (previous.includes(parsed.ip)) return { lines: [{ kind: "warn", text: "Already blocked." }], result: null };
  const key = caseKey();
  if (!key) return { lines: [{ kind: "warn", text: "Terminal offline: awaiting the approved answer set (private/round2-key-v2.json)." }], result: null };
  const prev = previous.slice(0, MAX_BLOCKS), result: AttemptResult = key.inject2.malicious.includes(parsed.ip) ? "caught" : "cleared";
  const caughtBefore = prev.filter(p => key.inject2.malicious.includes(p)).length;
  const after = stateOf([...prev, parsed.ip].map((p, i) => ({ seq: i + 1, ip: p, result: key.inject2.malicious.includes(p) ? "caught" : "cleared", createdAt: new Date() })), true, key);
  return { lines: [{ kind: result === "caught" ? "ok" : "bad", text: attemptLine(key, parsed.ip, result, caughtBefore + (result === "caught" ? 1 : 0)) }, ...closingLines(after)], result };
}
