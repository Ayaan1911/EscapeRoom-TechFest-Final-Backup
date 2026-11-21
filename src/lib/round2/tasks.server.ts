import "server-only";
import { z } from "zod";
import { units } from "./content.server";
import { criterionPoints, r2TaskById } from "./catalog";

// ANSWER KEYS AND GRADERS. Server-only: never imported by a client component or serialized into a response.
// Each grader is a pure, deterministic function of one validated answer: it returns which catalog criteria the answer satisfies.
// Criteria are earned once (union with what is stored) by the service; wrong answers can never remove earned points.
// Over-selection rule (stated in the prompts): where a task says so, selecting too many items forfeits the per-item credit,
// so ticking every box never pays. Option ids and list contents come from content.server.ts, the single source of ids.

const prompts = new Map(units.flatMap(u => u.tasks).map(t => [t.id, t] as const));
const L = (task: string, list: string): string[] => (prompts.get(task)?.lists?.[list] ?? []).map(o => o.id);
const oneOf = (values: string[]) => z.enum(values as [string, ...string[]]);
const unique = (a: readonly string[]) => new Set(a).size === a.length;
const pick = (values: string[], max: number) => z.array(oneOf(values)).max(max).refine(unique, "Duplicate selections");
const subset = (a: readonly string[], of: readonly string[]) => a.length > 0 && a.every(x => of.includes(x));
const has = (a: readonly string[], ...ids: string[]) => ids.every(id => a.includes(id));
const none = (a: readonly string[], ...ids: string[]) => ids.every(id => !a.includes(id));
const count = (a: readonly string[], of: readonly string[]) => a.filter(x => of.includes(x)).length;
const before = (order: readonly string[], a: string, b: string) => order.indexOf(a) < order.indexOf(b);
const perm = (values: string[]) => z.array(oneOf(values)).length(values.length).refine(unique, "Must be a permutation");
const mapOf = (keys: string[], value: z.ZodType) => z.object(Object.fromEntries(keys.map(k => [k, value]))).strict();

type Def = { schema: z.ZodType; grade: (v: never) => Record<string, boolean>; explain: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const def = <S extends z.ZodType>(schema: S, grade: (v: z.infer<S>) => Record<string, boolean>, explain: string): Def => ({ schema, grade: grade as any, explain });

const CLS = ["benign", "suspicious", "compromise"] as const;
const I1_KEYS = ["E-101", "E-102", "E-103", "E-107", "E-108", "E-110"];
const I1_TRUTH = ["suspicious", "compromise", "benign", "compromise", "benign", "suspicious"];
const CONNS = L("i2.identify", "connections");
const SUPPORT_KIND: Record<string, string> = { "E-102": "identity", "E-112": "identity", "E-105": "endpoint", "E-106": "endpoint", "E-107": "network", "E-111": "network" };
const I2_PROOF: Record<string, string[]> = { "C-03": ["N-201", "N-202"], "C-08": ["N-203", "N-204"] };
const I3_TRUTH = { A: ["P-301", "P-302", "P-303"], C: ["P-304", "P-305", "P-306"] };
const B2_SUPPORT_KIND: Record<string, string> = { "E-102": "identity", "E-105": "endpoint", "E-106": "endpoint", "T-502": "endpoint", "E-107": "network" };
const B2_CONTRA: Record<string, string[]> = { H1: ["E-101", "P-302"], H2: ["T-502", "E-102"], H3: ["T-503", "P-305", "T-504"] };
const B3_REFUTE: Record<string, string[]> = { "INT-2": ["E-105", "T-508"], "INT-4": ["P-308", "T-509"], "INT-5": ["E-103", "E-104"] };
const B3_KEYS = ["INT-1", "INT-2", "INT-3", "INT-4", "INT-5", "INT-6"];
const B3_GRADES = ["accurate", "false", "unverifiable"] as const;
const B3_TRUTH = ["unverifiable", "false", "accurate", "false", "false", "accurate"];
const B4_TRUE = ["fx-1", "fx-3", "fx-5", "fx-7", "fx-9"];

const defs: Record<string, Def> = {
  "i1.classify": def(z.object({ classifications: mapOf(I1_KEYS, z.enum(CLS)) }).strict(),
    v => Object.fromEntries(I1_KEYS.map((id, i) => [`o${i + 1}`, v.classifications[id] === I1_TRUTH[i]])),
    "E-102 (token replay from a hosting IP, no MFA, unknown device) and E-107 (beaconing to the same IP) are confirmed compromise. E-103 (Lagos: registered device, fresh MFA, TRV-882) and E-108 (CHG-5521) are benign: the 'impossible travel' alert pairs the real sign-in with the attacker's. E-101 (36 failures, 0 successes) and E-110 (unrelated PUA, no link to the attacker IP) are suspicious but unconfirmed."),
  "i1.assets": def(z.object({ assets: pick(L("i1.assets", "assets"), 6) }).strict(),
    v => ({ account: has(v.assets, "as-12") && v.assets.length <= 3, device: has(v.assets, "as-27") && v.assets.length <= 3, noExtra: subset(v.assets, ["as-12", "as-27"]) && v.assets.length === 2 }),
    "Confirmed: account p.okafor and laptop FIN-LT-07 (E-102/E-112 and E-105/E-106/E-111). FIN-LT-09/d.reyes (E-110, E-114), ERP and the VLAN (E-111) have no compromise evidence. Per-asset credit requires 3 or fewer selections."),
  "i1.response": def(z.object({ actions: pick(L("i1.response", "actions"), 8) }).strict(),
    v => ({ identity: has(v.actions, "rx-2"), endpoint: has(v.actions, "rx-6") && none(v.actions, "rx-3"), proportionate: has(v.actions, "rx-4") && none(v.actions, "rx-1", "rx-5", "rx-7", "rx-8") }),
    "Revoke sessions and reset credentials (rx-2), isolate the laptop but keep it powered for memory (rx-6; rx-3 destroys evidence), block only the attacker IP at egress (rx-4). Department-wide disables, a VLAN shutdown, blocking the authorized vendor and a company-wide reset are overbroad."),
  "i1.justify": def(z.object({ evidenceIds: pick(L("i1.justify", "records"), 5).refine(a => a.length >= 3, "Select at least 3 records") }).strict(),
    v => { const kinds = new Set(v.evidenceIds.flatMap(id => SUPPORT_KIND[id] ? [SUPPORT_KIND[id]] : [])); return { sources: kinds.size >= 2, corroborated: kinds.size >= 3, precise: v.evidenceIds.every(id => id in SUPPORT_KIND) }; },
    "Supporting records: identity E-102, E-112; endpoint E-105, E-106; network E-107, E-111. Credit needs 2 and then 3 independent source types among the selected supporting records; any benign or unrelated record forfeits 'precise'."),
  "i2.identify": def(z.object({ connectionIds: pick(CONNS, 10) }).strict(),
    v => ({ c3: has(v.connectionIds, "C-03") && v.connectionIds.length <= 3, c8: has(v.connectionIds, "C-08") && v.connectionIds.length <= 3, exact: v.connectionIds.length === 2 && has(v.connectionIds, "C-03", "C-08") }),
    "Malicious: C-03 (unsigned process beaconing every 300 s to a self-signed host) and C-08 (DNS tunnel of a staged archive). C-01/C-02/C-04/C-07/C-09/C-10 are change-controlled or approved; C-05 was dropped (0 bytes); C-06 only shares an ASN."),
  "i2.evidence": def(z.object({ evidence: z.object(Object.fromEntries(CONNS.map(c => [c, pick(L("i2.evidence", "records"), 4).optional()]))).strict().refine(e => Object.values(e).filter(x => x && x.length).length <= 2, "At most two connections") }).strict(),
    v => { const e = v.evidence as Record<string, string[] | undefined>, a = e["C-03"] ?? [], b = e["C-08"] ?? [];
      return { c3a: has(a, "N-201"), c3b: has(a, "N-202"), c8a: has(b, "N-203"), c8b: has(b, "N-204"), precise: subset(a, I2_PROOF["C-03"]) && subset(b, I2_PROOF["C-08"]) && Object.values(e).filter(x => x && x.length).length === 2 }; },
    "C-03: N-201 (beacon analytics) and N-202 (self-signed TLS, JA3 equals the extension host). C-08: N-203 (unique base32 labels, young domain) and N-204 (staging archive chunked into the queries). N-205..N-210 describe other traffic or unrelated reputation."),
  "i2.block": def(z.object({ blocks: pick(CONNS, 10) }).strict(),
    v => ({ b3: has(v.blocks, "C-03") && v.blocks.length <= 3, b8: has(v.blocks, "C-08") && v.blocks.length <= 3, noCollateral: subset(v.blocks, ["C-03", "C-08"]) }),
    "Block exactly C-03 and C-08. Per-connection credit needs 3 or fewer blocks; any legitimate connection forfeits the collateral points. Simulation only."),
  "i3.verdicts": def(z.object({ verdicts: z.object({ A: z.enum(["true", "false"]), B: z.enum(["true", "false"]), C: z.enum(["true", "false"]) }).strict() }).strict(),
    v => ({ a: v.verdicts.A === "false", b: v.verdicts.B === "true", c: v.verdicts.C === "false" }),
    "A false (no phish delivered, no password event, extension sideload). B true (P-307). C false (the 210 MB transfer is the approved CHG-5521 sync)."),
  "i3.contradictions": def(z.object({ contradictions: z.object({ A: pick(L("i3.contradictions", "records"), 3), C: pick(L("i3.contradictions", "records"), 3) }).strict() }).strict(),
    v => { const { A, C } = v.contradictions; return { a1: A.includes("P-301") || A.includes("P-302"), a2: A.includes("P-303"), aClean: subset(A, I3_TRUTH.A), c1: C.includes("P-304"), c2: C.includes("P-305") || C.includes("P-306"), cClean: subset(C, I3_TRUTH.C) }; },
    "Claim A: P-301 (no phish, no click), P-302 (no password verification, token replay), P-303 (the real initial vector). Claim C: P-304 (authorized change), P-305 (vendor receipt hash matches signed output), P-306 (allow-list history). P-307 supports claim B; P-308/P-309 are unrelated to A and C."),
  "i3.corrections": def(z.object({ corrections: z.object({ A: oneOf(L("i3.corrections", "A")), C: oneOf(L("i3.corrections", "C")) }).strict() }).strict(),
    v => ({ a: v.corrections.A === "ca-2", c: v.corrections.C === "cc-2" }),
    "A: sideloaded extension stole the live session token; no password or phishing. C: the 210 MB transfer is the authorized ledger sync; the exfiltration channels are the 38.2 MB beacon and the 4.1 MB DNS tunnel."),
  "i4.contain": def(z.object({ actions: pick(L("i4.contain", "actions"), 5) }).strict(),
    v => ({ hold: has(v.actions, "kx-1", "kx-3"), proportion: none(v.actions, "kx-2", "kx-4", "kx-5") && count(v.actions, ["kx-1", "kx-3"]) >= 1 }),
    "Hold isolation and apply the egress/DNS blocks. Company-wide shutdowns, lifting isolation and disabling every account are overbroad or unsafe."),
  "i4.preserve": def(z.object({ items: pick(L("i4.preserve", "items"), 7) }).strict(),
    v => ({ volatile: has(v.items, "vx-4"), logs: has(v.items, "vx-5", "vx-6"), nodestroy: none(v.items, "vx-1", "vx-3") && v.items.length >= 2 }),
    "Memory image first (D-403), then disk; export proxy/DNS/SSO logs and the mailbox audit with the rule definition. Reimaging first or deleting the rule before export destroys evidence. A full ERP backup is neutral."),
  "i4.comms": def(z.object({ choices: z.object({ executives: oneOf(L("i4.comms", "executives")), staff: oneOf(L("i4.comms", "staff")), vendor: oneOf(L("i4.comms", "vendor")), public: oneOf(L("i4.comms", "public")) }).strict() }).strict(),
    v => ({ exec: v.choices.executives === "mx-1", staff: v.choices.staff === "ms-3", external: v.choices.vendor === "mv-2" && v.choices.public === "mp-3" }),
    "Executives: facts, unknowns, phased plan. Staff: do not self-remediate; verify bank-detail changes out of band. Vendor: share indicators and the confirmation, accuse no one (P-305). Public: no statement yet; hold a statement for legal review (D-404)."),
  "i4.prereq": def(z.object({ items: pick(L("i4.prereq", "items"), 6) }).strict(),
    v => ({ required: has(v.items, "qx-2", "qx-4", "qx-6"), precise: none(v.items, "qx-1", "qx-3", "qx-5") && v.items.length >= 2 }),
    "Required: identity reset + MFA re-enrolment + revocation, device rebuilt after imaging, rule removed and indicators blocked. A fixed wait, bare sign-off and replacing every laptop are not prerequisites."),
  "i4.sequence": def(z.object({ order: perm(L("i4.sequence", "steps")) }).strict(),
    v => { const o = v.order; return { p1: before(o, "sq-4", "sq-1"), p2: before(o, "sq-5", "sq-3"), p3: before(o, "sq-3", "sq-6"), p4: before(o, "sq-1", "sq-6"), p5: before(o, "sq-6", "sq-2") }; },
    "Pairwise dependencies: image before rebuild; reset credentials before removing the rule (a live token could recreate it); remove the rule before restoring access; rebuild before restoring access; restore access before re-enabling the payment-approval role."),
  "b1.chain": def(z.object({ eventIds: pick(L("b1.chain", "events"), 11) }).strict(),
    v => ({ complete: has(v.eventIds, "EV-47", "EV-18", "EV-63", "EV-21", "EV-56", "EV-39", "EV-92", "EV-14"), clean: none(v.eventIds, "EV-32", "EV-75", "EV-84") && v.eventIds.length >= 4 }),
    "Causal chain: EV-47, EV-18, EV-63, EV-21, EV-56, EV-39, EV-92, EV-14. Decoys: EV-32 (spray, 0 successes), EV-75 (authorized sync), EV-84 (approved Lagos sign-in)."),
  "b1.order": def(z.object({ order: perm(L("b1.order", "events")) }).strict(),
    v => { const o = v.order; return { p1: before(o, "EV-47", "EV-18"), p2: before(o, "EV-18", "EV-63"), p3: before(o, "EV-75", "EV-21"), p4: before(o, "EV-21", "EV-56"), p5: before(o, "EV-21", "EV-92") }; },
    "UTC order: EV-47 01:12, EV-18 01:15 (NDR +6), EV-63 01:20, EV-32 01:30, EV-75 02:00 (UTC+1 record), EV-21 02:05, EV-56 02:06 (UTC-5 record, 12-04), EV-84 02:09, EV-39 02:14 (NDR +6), EV-92 02:24 (UTC-5), EV-14 02:41. Scored pairs are the ones a naive reading of raw times gets wrong."),
  "b1.root": def(z.object({ vector: oneOf(L("b1.root", "vector")), firstAction: oneOf(L("b1.root", "firstAction")), dwell: oneOf(L("b1.root", "dwell")) }).strict(),
    v => ({ vector: v.vector === "vc-2", firstAction: v.firstAction === "EV-21", dwell: v.dwell === "dw-3" }),
    "Vector: sideloaded extension. First authenticated attacker action: the 02:05 replay sign-in (the spray had no successes; the beacon is unauthenticated automation). Dwell 01:12 to 02:14 = 62 minutes."),
  "b2.best": def(z.object({ best: z.enum(["H1", "H2", "H3", "H4"]), supportIds: pick(L("b2.best", "records"), 4).refine(a => a.length >= 2, "Select at least 2 records") }).strict(),
    v => { const kinds = new Set(v.supportIds.flatMap(id => B2_SUPPORT_KIND[id] ? [B2_SUPPORT_KIND[id]] : [])); return { best: v.best === "H4", support: count(v.supportIds, Object.keys(B2_SUPPORT_KIND)) >= 2 && kinds.size >= 2, supportClean: v.supportIds.every(id => id in B2_SUPPORT_KIND) }; },
    "H4. Supporting records: E-102 (identity), E-105/E-106/T-502 (endpoint), E-107 (network). Credit needs two supporting records from two source types; any non-supporting record forfeits 'supportClean'."),
  "b2.eliminate": def(z.object({ eliminate: z.object({ H1: pick(L("b2.eliminate", "records"), 3), H2: pick(L("b2.eliminate", "records"), 3), H3: pick(L("b2.eliminate", "records"), 3) }).strict() }).strict(),
    v => { const e = v.eliminate; const out: Record<string, boolean> = {}; (["H1", "H2", "H3"] as const).forEach(h => { out[`${h.toLowerCase()}a`] = count(e[h], B2_CONTRA[h]) >= 1; out[`${h.toLowerCase()}b`] = subset(e[h], B2_CONTRA[h]); }); return out; },
    "H1: E-101 (0 successes), P-302 (no password verification). H2: T-502 (the machine acted without the user), E-102 (session from a hosting IP, unknown device). H3: T-503, P-305 (vendor side intact), T-504 (the attacker channel precedes vendor traffic by 40 minutes)."),
  "b3.classify": def(z.object({ grades: mapOf(B3_KEYS, z.enum(B3_GRADES)) }).strict(),
    v => Object.fromEntries(B3_KEYS.map((k, i) => [`i${i + 1}`, (v.grades as Record<string, string>)[k] === B3_TRUTH[i]])),
    "INT-1 unverifiable (one shared-hosting IP, uncited). INT-2 false (sideloaded, unsigned; T-508). INT-3 accurate (N-203). INT-4 false (0 database queries; 42.3 MB total outbound). INT-5 false (approved travel, registered device, MFA). INT-6 accurate (E-107)."),
  "b3.verify": def(z.object({ refutations: mapOf(["INT-2", "INT-4", "INT-5"], oneOf(L("b3.verify", "records"))), attributionLimit: oneOf(L("b3.verify", "attributionLimit")) }).strict(),
    v => { const r = v.refutations as Record<string, string>; return { i1: v.attributionLimit === "al-3", i2: B3_REFUTE["INT-2"].includes(r["INT-2"]), i4: B3_REFUTE["INT-4"].includes(r["INT-4"]), i5: B3_REFUTE["INT-5"].includes(r["INT-5"]) }; },
    "INT-2: E-105 or T-508. INT-4: P-308 or T-509. INT-5: E-103 or E-104. INT-1: the shared-hosting / uncited-assertion limitation (al-3)."),
  "b4.facts": def(z.object({ factIds: pick(L("b4.facts", "facts"), 10) }).strict(),
    v => ({ core: count(v.factIds, B4_TRUE) >= 3, complete: has(v.factIds, ...B4_TRUE), clean: count(v.factIds, B4_TRUE) >= 3 && v.factIds.every(id => B4_TRUE.includes(id)) }),
    "Confirmed: fx-1, fx-3, fx-5, fx-7, fx-9. Unsupported or false: insider (fx-2), ERP exfiltration (fx-4), GHOST attribution (fx-6), vendor breach (fx-8), confirmed customer data theft (fx-10)."),
  "b4.attribution": def(z.object({ level: oneOf(L("b4.attribution", "level")), reasons: pick(L("b4.attribution", "reasons"), 5) }).strict(),
    v => ({ level: v.level === "at-3", reasons: count(v.reasons, ["ar-1", "ar-3", "ar-5"]) >= 2 && none(v.reasons, "ar-2", "ar-4") }),
    "Unattributed. Valid limits: shared hosting, commodity tooling, no corroboration. Vendor confidence labels and domain age do not establish an actor."),
  "b4.plan": def(z.object({ containment: oneOf(L("b4.plan", "containment")), preservation: oneOf(L("b4.plan", "preservation")), recovery: oneOf(L("b4.plan", "recovery")) }).strict(),
    v => ({ containment: v.containment === "pc-2", preservation: v.preservation === "pp-1", recovery: v.recovery === "pr-3" }),
    "Targeted containment; image before reimage; gated recovery."),
  "b4.comms": def(z.object({ regulator: oneOf(L("b4.comms", "regulator")), suppliers: oneOf(L("b4.comms", "suppliers")), note: z.string().max(500).optional() }).strict(),
    v => ({ regulator: v.regulator === "cr-2", suppliers: v.suppliers === "cs-2" }),
    "Hold the regulator notice and notify suppliers after the scope assessment (T-505). The optional note is stored for humans and never graded."),
};

export const taskIdsWithDefs = Object.keys(defs);
export const explanation = (taskId: string) => defs[taskId]?.explain ?? null;

/** Strict schema validation. A failure means the payload is malformed: the service rejects it without consuming an attempt. */
export function validateAnswer(taskId: string, answer: unknown): { ok: true; data: unknown } | { ok: false } {
  const d = Object.hasOwn(defs, taskId) ? defs[taskId] : undefined;
  const parsed = d?.schema.safeParse(answer);
  return parsed?.success ? { ok: true, data: parsed.data } : { ok: false };
}
/** Criterion ids satisfied by an already-validated answer. Only the task's own catalog criteria can ever be returned. */
export function gradeValidated(taskId: string, data: unknown): string[] {
  const d = Object.hasOwn(defs, taskId) ? defs[taskId] : undefined;
  if (!d || !r2TaskById.has(taskId)) return [];
  let ok: Record<string, boolean>;
  try { ok = (d.grade as (v: unknown) => Record<string, boolean>)(data); } catch { return []; }
  return Object.entries(ok).filter(([, pass]) => pass).map(([key]) => `${taskId}:${key}`).filter(id => criterionPoints.has(id));
}
