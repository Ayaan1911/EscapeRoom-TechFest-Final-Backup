import "server-only";
// ORGANIZER-ONLY marking key for Round 2 (case document v2) and the Kill Switch target classification + wrong-block messages.
// The repository is public, so the key is NOT in source: it is read at runtime from a git-ignored JSON file
// (default private/round2-key-v2.json, or GHOST_R2_KEY_FILE). Without a valid file the terminal reports "awaiting approved answer set"
// and the printable key says it is missing. Format: docs/ghost404-round2-open60.md. Never import this from client code.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const ipv4 = z.string().regex(/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/);
const schema = z.object({
  version: z.literal("case-v2"),
  inject1: z.object({ answer: z.string(), rationale: z.string(), evidence: z.array(z.string()), decoys: z.array(z.string()), split: z.string() }),
  // wrongMessages: the service-disruption line returned (by the server, after a committed attempt) when that legitimate connection is blocked.
  inject2: z.object({ status: z.enum(["approved", "provisional"]), source: z.string(), malicious: z.array(ipv4).min(1), cleared: z.array(ipv4), wrongMessages: z.record(ipv4, z.string().max(200)), split: z.string(), hints: z.string() }),
  inject3: z.object({ claims: z.array(z.object({ n: z.number().int(), verdict: z.enum(["TRUE", "FALSE", "NOT ENOUGH EVIDENCE"]), reason: z.string() })).length(8), planted: z.string(), split: z.string() }),
  inject4: z.object({ calls: z.array(z.object({ n: z.number().int(), correct: z.enum(["A", "B", "C", "D"]), flaws: z.record(z.string(), z.string()) })).length(3),
    statements: z.object({ good: z.array(z.number().int()).length(2), bad: z.array(z.object({ n: z.number().int(), why: z.string() })) }), split: z.string() }),
}).strict();
export type CaseKey = z.infer<typeof schema>;

let cache: { path: string; key: CaseKey | null; at: number } | null = null;
/** Returns the validated key, or null when the file is absent or invalid (never throws, never logs contents). Re-read at most every 30 s. */
export function caseKey(): CaseKey | null {
  // turbopackIgnore: read at runtime only; the build must not trace (or ship) the private folder.
  const path = process.env.GHOST_R2_KEY_FILE || join(/* turbopackIgnore: true */ process.cwd(), "private", "round2-key-v2.json");
  if (cache && cache.path === path && Date.now() - cache.at < 30_000) return cache.key;
  let key: CaseKey | null = null;
  try {
    const parsed = schema.safeParse(JSON.parse(readFileSync(/* turbopackIgnore: true */ path, "utf8")));
    if (parsed.success && !parsed.data.inject2.malicious.some(ip => parsed.data.inject2.cleared.includes(ip))) key = parsed.data;
    else console.error("round2 case key file is invalid; the terminal stays disabled");
  } catch { key = null; }
  cache = { path, key, at: Date.now() };
  return key;
}
export const resetCaseKeyCache = () => { cache = null; };
