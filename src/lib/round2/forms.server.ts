import "server-only";
import { units, type Opt } from "./content.server";
import type { Field } from "./form-types";

// Machine-readable input metadata for every Round 2 task, derived from the participant-facing option lists in content.server.ts.
// It describes WHAT to render and WHERE each value goes in the answer object. It never says which option is correct.
// The shapes mirror the strict schemas in tasks.server.ts; tests/round2-ui.test.ts proves every perfect answer round-trips through these fields.
const prompts = new Map(units.flatMap(u => u.tasks).map(t => [t.id, t] as const));
const L = (task: string, list: string): Opt[] => prompts.get(task)?.lists?.[list] ?? [];
const single = (path: string[], label: string, options: Opt[], extra: Partial<Field> = {}): Field => ({ kind: "single", path, label, options, ...extra });
const multi = (path: string[], label: string, options: Opt[], min: number, max: number, extra: Partial<Field> = {}): Field => ({ kind: "multi", path, label, options, min, max, ...extra });
const rows = (task: string, list: string, base: string[], classes: Opt[]): Field[] => L(task, list).map(o => single([...base, o.id], o.id, classes, { ref: o.id }));
const TF: Opt[] = [{ id: "true", text: "True" }, { id: "false", text: "False" }];
const GRADES: Opt[] = [{ id: "accurate", text: "Accurate" }, { id: "false", text: "False" }, { id: "unverifiable", text: "Unverifiable from the evidence" }];
const HYP: Opt[] = [{ id: "H1", text: "H1 · Credential phishing or password spray gave the attacker a password" }, { id: "H2", text: "H2 · The employee (p.okafor) is a malicious insider" }, { id: "H3", text: "H3 · The LedgerBridge vendor was compromised and used to reach Meridian" }, { id: "H4", text: "H4 · A malicious browser extension stole the live session" }];
const ev = (task: string) => L(task, "records");

const fields: Record<string, () => Field[]> = {
  "i1.classify": () => rows("i1.classify", "records", ["classifications"], L("i1.classify", "classes")),
  "i1.assets": () => [multi(["assets"], "Confirmed-compromised assets", L("i1.assets", "assets"), 1, 6)],
  "i1.response": () => [multi(["actions"], "Immediate response actions", L("i1.response", "actions"), 1, 8)],
  "i1.justify": () => [multi(["evidenceIds"], "Records that justify the decision (3 to 5)", ev("i1.justify"), 3, 5)],
  "i2.identify": () => [multi(["connectionIds"], "Connections judged malicious", L("i2.identify", "connections"), 1, 10)],
  "i2.evidence": () => [{ kind: "keyed", path: ["evidence"], label: "Proof records per identified connection", keys: L("i2.identify", "connections"), options: ev("i2.evidence"), max: 4, maxKeys: 2 }],
  "i2.block": () => [multi(["blocks"], "Connections to BLOCK (simulation)", L("i2.block", "connections"), 1, 10)],
  "i3.verdicts": () => ["A", "B", "C"].map(c => single(["verdicts", c], `Claim ${c}`, TF, { ref: `AI-REPORT#${c}` })),
  "i3.contradictions": () => ["A", "C"].map(c => multi(["contradictions", c], `Contradicting records for claim ${c} (up to 3)`, ev("i3.contradictions"), 1, 3, { ref: `AI-REPORT#${c}` })),
  "i3.corrections": () => ["A", "C"].map(c => single(["corrections", c], `Corrected interpretation of claim ${c}`, L("i3.corrections", c), { ref: `AI-REPORT#${c}` })),
  "i4.contain": () => [multi(["actions"], "Containment decisions to hold", L("i4.contain", "actions"), 1, 5)],
  "i4.preserve": () => [multi(["items"], "Evidence preservation items", L("i4.preserve", "items"), 1, 7)],
  "i4.comms": () => ([["executives", "Executives"], ["staff", "Finance staff"], ["vendor", "Vendor (LedgerBridge)"], ["public", "Public"]] as const).map(([k, label]) => single(["choices", k], label, L("i4.comms", k))),
  "i4.prereq": () => [multi(["items"], "Prerequisites before restoring access", L("i4.prereq", "items"), 1, 6)],
  "i4.sequence": () => [{ kind: "order", path: ["order"], label: "Restoration order, first to last", options: L("i4.sequence", "steps") }],
  "b1.chain": () => [multi(["eventIds"], "Events in the attacker's causal chain", L("b1.chain", "events"), 1, 11)],
  "b1.order": () => [{ kind: "order", path: ["order"], label: "All events in real UTC order, earliest first", options: L("b1.order", "events") }],
  "b1.root": () => [single(["vector"], "Root cause", L("b1.root", "vector")), single(["firstAction"], "First action as an authenticated Meridian user", L("b1.root", "firstAction")), single(["dwell"], "Dwell time from root cause to the 2:14 AM alert", L("b1.root", "dwell"))],
  "b2.best": () => [single(["best"], "The explanation the evidence supports", HYP), multi(["supportIds"], "Supporting records (2 to 4)", ev("b2.best"), 2, 4)],
  "b2.eliminate": () => ["H1", "H2", "H3"].map(h => multi(["eliminate", h], `Records that defeat ${h} (up to 3)`, ev("b2.eliminate"), 1, 3)),
  "b3.classify": () => rows("b3.classify", "items", ["grades"], GRADES),
  "b3.verify": () => [{ kind: "keyed", path: ["refutations"], label: "Refuting record for each item you graded false (up to 3)", keys: L("b3.classify", "items"), options: ev("b3.verify"), max: 1, maxKeys: 3 }, single(["attributionLimit"], "Limitation that applies to an item you graded unverifiable (optional)", L("b3.verify", "attributionLimit"), { optional: true })],
  "b4.facts": () => [multi(["factIds"], "Statements the evidence confirms", L("b4.facts", "facts"), 1, 10)],
  "b4.attribution": () => [single(["level"], "Attribution level the evidence allows", L("b4.attribution", "level")), multi(["reasons"], "Reasons that limit attribution", L("b4.attribution", "reasons"), 1, 5)],
  "b4.plan": () => (["containment", "preservation", "recovery"] as const).map(k => single([k], k[0].toUpperCase() + k.slice(1), L("b4.plan", k))),
  "b4.comms": () => [single(["regulator"], "Regulator notification", L("b4.comms", "regulator")), single(["suppliers"], "Supplier notification", L("b4.comms", "suppliers")), { kind: "text", path: ["note"], label: "Optional note for human reviewers (never scored)", max: 500, optional: true }],
};
export const fieldsFor = (taskId: string): Field[] => (Object.hasOwn(fields, taskId) ? fields[taskId]() : []);
export const formTaskIds = Object.keys(fields);
