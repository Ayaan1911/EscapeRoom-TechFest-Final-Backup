import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { criterionPoints, r2Catalog, taskMax } from "../src/lib/round2/catalog";
import { fieldsFor, formTaskIds } from "../src/lib/round2/forms.server";
import { buildAnswer, draftBytes, DRAFT_LIMIT_BYTES, fieldValue, getAt, missingFields, setAt, type Field } from "../src/lib/round2/form-types";
import { clockOffset, effectiveAvailability, formatClock, refreshDelay } from "../src/lib/round2/client-clock";
import { gradeValidated, validateAnswer } from "../src/lib/round2/tasks.server";
import { units } from "../src/lib/round2/content.server";
import { claimOf } from "../src/components/round2/fields";
import { parseConn } from "../src/components/round2/visuals";
import { describeError, describeOutcome } from "../src/components/round2/task-card";
import { ApiError } from "../src/components/round2/api";
import { perfect } from "./fixtures/round2";

const score = (id: string, a: unknown) => { const v = validateAnswer(id, a); return v.ok ? gradeValidated(id, v.data).reduce((n, c) => n + (criterionPoints.get(c) ?? 0), 0) : -1; };
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const asAnswer = (id: string) => perfect[id] as Record<string, unknown>;

describe("Round 2 UI: all 26 task forms match the strict server schemas", () => {
  it("every catalog task has input metadata, and nothing else does", () => {
    expect(r2Catalog).toHaveLength(26);
    expect([...formTaskIds].sort()).toEqual(r2Catalog.map(t => t.id).sort());
    for (const t of r2Catalog) expect(fieldsFor(t.id).length, t.id).toBeGreaterThan(0);
  });
  it("the form assembles EXACTLY the answer the server expects (perfect answer round-trips and scores the maximum)", () => {
    for (const t of r2Catalog) {
      const built = buildAnswer(fieldsFor(t.id), asAnswer(t.id));
      expect(built, t.id).toEqual(perfect[t.id]);
      expect(score(t.id, built), t.id).toBe(taskMax(t));
      expect(missingFields(fieldsFor(t.id), built), t.id).toEqual([]);
      expect(draftBytes(built)).toBeLessThan(DRAFT_LIMIT_BYTES);
    }
  });
  it("an empty form reports every required field and builds an empty answer", () => {
    for (const t of r2Catalog) { const f = fieldsFor(t.id), required = f.filter(x => !x.optional); expect(missingFields(f, {})).toHaveLength(required.length); expect(buildAnswer(f, {})).toEqual({}); }
  });
  it("stale ids, duplicates and stray keys never reach the payload", () => {
    expect(buildAnswer(fieldsFor("i1.assets"), { assets: ["as-12", "as-12", "nope"], score: 15, __x: 1 })).toEqual({ assets: ["as-12"] });
    const comms = buildAnswer(fieldsFor("b4.comms"), { regulator: "cr-2", suppliers: "cs-2", points: 99 });
    expect(comms).toEqual({ regulator: "cr-2", suppliers: "cs-2" });
    expect(score("b4.comms", comms)).toBe(2);
  });
  it("ordering counts only once it is a full permutation the participant set", () => {
    const f = fieldsFor("i4.sequence")[0];
    expect(fieldValue(f, ["sq-1"])).toBeUndefined();
    expect(fieldValue(f, ["sq-1", "sq-1", "sq-2", "sq-3", "sq-4", "sq-5"])).toBeUndefined();
    expect(fieldValue(f, (perfect["i4.sequence"] as { order: string[] }).order)).toHaveLength(6);
  });
  it("keyed evidence allows at most two connections and four records each", () => {
    const f = fieldsFor("i2.evidence")[0] as Field;
    expect(fieldValue(f, { "C-03": ["N-201"], "C-08": ["N-203"], "C-01": ["N-205"] })).toBeUndefined();
    expect(fieldValue(f, { "C-03": ["N-201", "N-202", "N-203", "N-204", "N-205"] })).toEqual({ "C-03": ["N-201", "N-202", "N-203", "N-204"] });
  });
  it("setAt is immutable and refuses prototype-polluting paths", () => {
    const a = { x: { y: 1 } }, b = setAt(a, ["x", "z"], 2);
    expect(a).toEqual({ x: { y: 1 } }); expect(getAt(b, ["x", "z"])).toBe(2);
    expect(setAt({}, ["__proto__", "p"], 1)).toEqual({}); expect(({} as Record<string, unknown>).p).toBeUndefined();
  });
});

describe("Round 2 UI: participant payloads reveal no answers", () => {
  it("form metadata never mentions criteria, solutions or correctness", () => {
    const keys = new Set<string>();
    JSON.stringify(r2Catalog.map(t => fieldsFor(t.id)), (k, v) => { if (k && Number.isNaN(Number(k))) keys.add(k); return v; });
    expect([...keys].sort()).toEqual(["id", "keys", "kind", "label", "max", "maxKeys", "min", "optional", "options", "path", "ref", "text"]); // structure only: no solution-bearing field exists
  });
  it("client code never imports server-only modules or answer keys", () => {
    const files = [...walk("src/components/round2"), ...walk("src/app/round2")].filter(f => /\.(ts|tsx)$/.test(f));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (f.endsWith("page.tsx") || f.endsWith("admin.tsx")) continue; // the server page may import server modules; admin.tsx is organizer-only (solutions panel)
      expect(src, f).not.toMatch(/from "@\/lib\/round2\/(tasks|content|forms|play|enrollment|organizer|common|access|http)\.server"/);
      expect(src, f).not.toMatch(/tasks\.server|explanation/);
    }
  });
  it("evidence text is never rendered as HTML", () => {
    for (const f of walk("src/components/round2")) expect(readFileSync(f, "utf8"), f).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
  });
  it("administrative mutations are POST-only calls made from one explicit handler", () => {
    const admin = readFileSync("src/components/round2/admin.tsx", "utf8");
    expect(admin.match(/adminPost/g)!.length).toBe(2); // import + the single act() helper
    expect(admin).toMatch(/READ-ONLY refresh/);
  });
});

describe("Round 2 UI: clock, release and feedback behaviour", () => {
  it("calibrates the display clock to the server and never grants permission", () => {
    expect(clockOffset(10_000, 1_000, 1_400)).toBe(10_000 - 1_200);
    expect(effectiveAvailability("open", "2026-12-05T01:25:00Z", Date.parse("2026-12-05T01:24:59Z"))).toBe("open");
    expect(effectiveAvailability("open", "2026-12-05T01:25:00Z", Date.parse("2026-12-05T01:25:00Z"))).toBe("closed"); // may disable early
    expect(effectiveAvailability("not_released", null, 0)).toBe("not_released");
    expect(effectiveAvailability("closed", "2999-01-01T00:00:00Z", 0)).toBe("closed"); // a local clock can never enable
  });
  it("re-asks the server just after a boundary and formats countdowns", () => {
    expect(refreshDelay(null, 0)).toBeNull();
    expect(refreshDelay("2026-12-05T01:06:00Z", Date.parse("2026-12-05T01:05:59Z"))).toBe(1400);
    expect(refreshDelay("2020-01-01T00:00:00Z", Date.now())).toBe(250);
    expect(formatClock(25 * 60_000)).toBe("25:00"); expect(formatClock(3_661_000)).toBe("1:01:01"); expect(formatClock(-5)).toBe("00:00"); expect(formatClock(null)).toBe("--:--");
  });
  it("describes every documented backend outcome honestly", () => {
    const o = { duplicate: false, accepted: false, awarded: 2, task: { id: "i1.assets", earned: 2, max: 3 }, score: { partA: 2, partB: 0, total: 2 } };
    expect(describeOutcome(o).text).toMatch(/\+2 points.*2\/3.*1 still available/);
    expect(describeOutcome({ ...o, duplicate: true, awarded: 0 }).text).toMatch(/already sent/);
    expect(describeOutcome({ ...o, awarded: 0 }).tone).toBe("warn");
    expect(describeError(new ApiError(429, "Please wait between submissions.", 3)).text).toMatch(/3s/);
    expect(describeError(new ApiError(429, "Attempt limit reached for this task.")).text).toMatch(/Attempt limit/);
    expect(describeError(new ApiError(403, "Submissions for this part are closed")).text).toMatch(/closed/);
    expect(describeError(new ApiError(403, "This challenge has not been released yet")).text).toMatch(/not been released/);
    expect(describeError(new ApiError(400, "Invalid answer format")).text).toMatch(/format/);
    expect(describeError(new ApiError(401, "x")).text).toMatch(/Sign in/);
    expect(describeError(new ApiError(0, "x")).text).toMatch(/could not confirm/i);
    expect(describeError(new ApiError(503, "x")).text).toMatch(/unavailable/);
    for (const e of [new ApiError(0, ""), new ApiError(503, "")]) expect(describeError(e).text).not.toMatch(/submitted|saved/i);
  });
});

describe("Round 2 UI: visual data adapters", () => {
  const records = new Map(units.flatMap(u => u.records).map(r => [r.id, r]));
  it("parses all ten connection records for the network map", () => {
    const conns = units[1].records.filter(r => r.id.startsWith("C-")).map(parseConn);
    expect(conns.every(Boolean)).toBe(true); expect(conns).toHaveLength(10);
    expect(conns.find(c => c!.id === "C-05")!.inbound).toBe(true); expect(conns.find(c => c!.id === "C-04")!.bytes).toBe(480e9);
  });
  it("extracts the three AI claims", () => {
    for (const l of ["A", "B", "C"]) expect(claimOf(records, l).length, l).toBeGreaterThan(20);
    expect(claimOf(records, "A")).toMatch(/phishing/);
  });
});

describe("Round 2 content: no prompt or form reveals which items are the answers (Phase 5 regression)", () => {
  it("no task prompt names an option or record id", () => {
    const idLike = /(?:[A-Z]{1,3}-\d{2,3}|[a-z]{2}-\d+|INT-\d)/;
    for (const t of units.flatMap(u => u.tasks)) expect(t.prompt, t.id).not.toMatch(idLike);
  });
  it("Challenge 3 verification lets the team choose which bulletin items to refute (any of the six, at most three)", () => {
    const f = fieldsFor("b3.verify")[0] as Field;
    expect(f.keys!.map(k => k.id)).toEqual(["INT-1", "INT-2", "INT-3", "INT-4", "INT-5", "INT-6"]);
    expect(score("b3.verify", { refutations: { "INT-3": ["E-105"], "INT-6": ["E-107"], "INT-1": ["E-102"], "INT-2": ["E-105"] } })).toBe(-1); // four keys
    expect(score("b3.verify", { refutations: { "INT-3": ["E-105"] } })).toBe(0); // optional limitation, wrong item: nothing earned, nothing leaked
  });
});
