import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

// Private Round 1 case parameters.
//
// The five chapter generators are deterministic functions of the team's variant (A/B/C). Their built-in parameter tables are in the
// public repository, so anyone with the source can read which email, sign-in, export, trail event, insider, policy and hypothesis is
// correct. For the event, an organizer installs a PRIVATE file (default `private/round1-case-v1.json`, or GHOST_R1_CASE_FILE) with
// fresh values. The generators, narrative and grading rules are unchanged; only these labels/selections move out of the repository.
//
// The file is read ONCE per server process: answers never change while a round is running. In production a missing file is an
// error (fail closed); outside production the built-in (public) tables keep tests and demos working. An invalid file always throws.

const two = z.string().regex(/^\d{2}$/);
const distinct = (list: string[]) => new Set(list).size === list.length;
const variantSchema = (v: "A" | "B" | "C") => z.object({
  inbox: z.object({
    entry: z.enum(["payroll", "supplier", "security"]), // the generator's supported entry emails (project/alert/employee have fixed decoy roles)
    auth: z.union([z.literal(1), z.literal(2)]), database: z.union([z.literal(1), z.literal(2)]),
    session: z.string().regex(new RegExp(`^nx-${v.toLowerCase()}-[0-9a-f]{3}$`)), campaign: z.string().regex(/^NX-\d{2}$/),
  }).strict(),
  trail: z.object({ mint: z.number().int().min(1).max(144), replay: z.number().int().min(1).max(144), trap: z.number().int().min(1).max(144) }).strict()
    .refine(t => distinct([String(t.mint), String(t.replay), String(t.trap)]), "trail positions must differ"),
  insider: z.object({
    employee: z.union([z.literal(1), z.literal(3), z.literal(4)]), // only these roster members hold an identity-policy write privilege
    policy: two, message: two, access: two, approval: two,
  }).strict(),
  containment: z.object({
    events: z.array(two).length(7).refine(distinct, "event ids must differ"),
    immediate: z.array(two).length(4).refine(distinct).refine(l => l.every(x => Number(x) < 5 || Number(x) > 10), "05-10 are fixed decoy actions"),
    recovery: z.array(two).length(6).refine(distinct).refine(l => l.every(x => Number(x) < 5 || Number(x) > 7), "05-07 are fixed decoy steps"),
  }).strict(),
  verdict: z.object({ replay: two, employee: two, maintenance: two }).strict().refine(h => distinct([h.replay, h.employee, h.maintenance]), "hypothesis ids must differ"),
}).strict();
const schema = z.object({ version: z.literal("r1-case-v1"), variants: z.object({ A: variantSchema("A"), B: variantSchema("B"), C: variantSchema("C") }).strict() }).strict();
export type Round1Case = z.infer<typeof schema>;
export type Round1VariantCase = Round1Case["variants"]["A"];

// Built-in tables (public; the values every test fixture and demo was written against).
export const BUILTIN_CASE: Round1Case = {
  version: "r1-case-v1",
  variants: {
    A: { inbox: { entry: "payroll", auth: 2, database: 1, session: "nx-a-72c", campaign: "NX-41" }, trail: { mint: 22, replay: 74, trap: 109 }, insider: { employee: 3, policy: "04", message: "09", access: "11", approval: "06" }, containment: { events: ["46", "12", "73", "28", "61", "34", "85"], immediate: ["57", "19", "83", "42"], recovery: ["68", "24", "91", "37", "52", "16"] }, verdict: { replay: "27", employee: "64", maintenance: "91" } },
    B: { inbox: { entry: "supplier", auth: 1, database: 2, session: "nx-b-19f", campaign: "NX-73" }, trail: { mint: 57, replay: 113, trap: 37 }, insider: { employee: 1, policy: "07", message: "03", access: "14", approval: "08" }, containment: { events: ["53", "82", "19", "64", "37", "91", "26"], immediate: ["32", "76", "15", "89"], recovery: ["43", "87", "21", "65", "18", "94"] }, verdict: { replay: "83", employee: "16", maintenance: "42" } },
    C: { inbox: { entry: "security", auth: 2, database: 1, session: "nx-c-84d", campaign: "NX-26" }, trail: { mint: 103, replay: 52, trap: 82 }, insider: { employee: 4, policy: "02", message: "12", access: "06", approval: "04" }, containment: { events: ["78", "31", "56", "92", "14", "63", "47"], immediate: ["84", "23", "69", "51"], recovery: ["96", "35", "72", "14", "83", "49"] }, verdict: { replay: "38", employee: "72", maintenance: "15" } },
  },
};

export function parseRound1Case(raw: unknown): Round1Case { return schema.parse(raw); }

let loaded: { key: Round1Case; source: "private" | "builtin"; path: string } | null = null;
let override: Round1Case | null = null; // tests only
function load() {
  if (override) return { key: override, source: "private" as const, path: "(test override)" };
  if (loaded) return loaded;
  const path = process.env.GHOST_R1_CASE_FILE || join(/* turbopackIgnore: true */ process.cwd(), "private", "round1-case-v1.json");
  // Unit tests are written against the built-in tables: under Vitest the default private path is ignored (an explicit GHOST_R1_CASE_FILE still applies).
  const ignoreDefault = !!process.env.VITEST && !process.env.GHOST_R1_CASE_FILE;
  if (!ignoreDefault && existsSync(path)) {
    loaded = { key: parseRound1Case(JSON.parse(readFileSync(path, "utf8"))), source: "private", path }; // invalid file: throw (fail closed), never silently fall back
  } else {
    // Production fails closed: the built-in tables are public, so serving them would hand every team a lookup table.
    // (Development and tests keep the built-in tables; a deliberate public-table rehearsal can opt in explicitly.)
    if (process.env.NODE_ENV === "production" && process.env.GHOST_R1_ALLOW_PUBLIC_CASE !== "1") throw new Error(`[round1-case] private case file missing (${path}); refusing to serve the public answer tables`);
    loaded = { key: BUILTIN_CASE, source: "builtin", path };
  }
  return loaded;
}

export function round1Case(variant: string): Round1VariantCase {
  const variants = load().key.variants;
  if (!Object.hasOwn(variants, variant)) throw new Error("Unsupported Round 1 variant");
  return variants[variant as keyof typeof variants];
}
export const round1CaseSource = () => { const l = load(); return { source: l.source }; };
export const setRound1CaseForTests = (key: Round1Case | null) => { override = key; };
