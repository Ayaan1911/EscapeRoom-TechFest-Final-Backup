import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { r2Catalog, taskMax, UNITS } from "../src/lib/round2/catalog";
import { fieldsFor } from "../src/lib/round2/forms.server";
import { units } from "../src/lib/round2/content.server";
import { UnitView } from "../src/components/round2/unit-view";
import { DraftProvider } from "../src/components/round2/use-draft-store";
import { Restricted, WaitingRoom } from "../src/components/round2/states";
import type { Bundle, ClockView, StatusPayload } from "../src/components/round2/types";

// Server-side render smoke tests with isolated fixtures built from the static content (no network, no database).
const clock = (phase: ClockView["phase"]): ClockView => ({ phase, serverNow: 0, elapsedMs: 0, startsAt: "2026-12-05T01:00:00Z", partAClosesAt: "2026-12-05T01:25:00Z", endsAt: "2026-12-05T01:50:00Z", releasedIncidents: [1, 2, 3, 4], partBReleased: phase === "part_b", nextEvent: null });
const bundle = (phase: ClockView["phase"]): Bundle => ({ clock: clock(phase), brief: "x", contentVersion: "t", units: units.map(u => ({ part: u.part, unit: u.unit, title: u.title, story: u.story, records: u.records, tasks: u.tasks.map(t => ({ id: t.id, prompt: t.prompt, max: taskMax(r2Catalog.find(c => c.id === t.id)!), availability: "open" as const, fields: fieldsFor(t.id) })) })) });
const status = (phase: ClockView["phase"], availability: "open" | "closed" = "open"): StatusPayload => ({ clock: clock(phase), score: { partA: 0, partB: 0, total: 0, partAMax: 60, partBMax: 40, max: 100 }, tasks: r2Catalog.map(t => ({ id: t.id, part: t.part, unit: t.unit, title: t.title, earned: 0, max: taskMax(t), availability, attempts: { used: 0, cap: 3, remaining: 3 } })), units: { A: UNITS.A.map((title, i) => ({ unit: i + 1, title, max: 15, released: true })), B: UNITS.B.map((title, i) => ({ unit: i + 1, title, max: 10, released: true })) }, hints: "disabled" });
// eslint-disable-next-line react/no-children-prop -- createElement without JSX in a .ts test
const render = (unitIndex: number, st: StatusPayload) => { const b = bundle(st.clock.phase), u = b.units[unitIndex]; return renderToStaticMarkup(createElement(DraftProvider, { initial: [], children: createElement(UnitView, { unit: u, bundle: b, status: st, clock: st.clock, now: Date.parse("2026-12-05T01:10:00Z"), onScored: () => undefined, onNeedRefresh: () => undefined }) })); };

describe("Round 2 UI renders every incident and challenge", () => {
  units.forEach((u, i) => {
    it(`${u.part}${u.unit} ${u.title}: every task renders with its inputs and a submit control`, () => {
      const html = render(i, status(u.part === "A" ? "part_a" : "part_b"));
      for (const t of u.tasks) { const title = r2Catalog.find(c => c.id === t.id)!.title; expect(html, t.id).toContain(`data-task="${t.id}"`); expect(html, t.id).toContain(title.replace(/&/g, "&amp;")); }
      expect(html.match(/Submit task/g)).toHaveLength(u.tasks.length);
      expect(html).toMatch(/<(input|select|textarea)/);
      expect(html).not.toMatch(/dangerouslySetInnerHTML/);
    });
  });
  it("Kill Switch has the map, all ten connections in an accessible table, and simulated BLOCK controls", () => {
    const html = render(1, status("part_a"));
    expect(html).toContain("Connection map"); expect(html).toContain("<svg"); expect(html).toContain('aria-hidden="true" focusable="false"');
    expect((html.match(/Queue simulated BLOCK for C-\d\d/g) ?? []).length).toBe(10); expect(html).toContain("Simulation only: no command is ever executed");
  });
  it("Audit the AI separates untrusted AI output from retained evidence", () => {
    const html = render(2, status("part_a"));
    expect(html).toContain("UNTRUSTED · AI-GENERATED"); expect(html).toContain("Retained evidence"); expect(html).toContain("AI claim · unverified");
  });
  it("closed phases render read-only: inputs disabled and submit disabled", () => {
    const html = render(0, status("part_b", "closed"));
    const buttons = html.match(/<button[^>]*>Submit task<\/button>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0); expect(buttons.every(b => b.includes('disabled=""'))).toBe(true);
    expect(html).toContain('<fieldset class="r2-row" disabled=""'); // inputs are disabled through their fieldset
    expect(html).toMatch(/Closed: read-only/);
  });
  it("ordering controls have keyboard move buttons with labels", () => {
    const html = render(3, status("part_a"));
    expect(html).toMatch(/aria-label="Move sq-\d up"/); expect(html).toMatch(/aria-label="Move sq-\d down"/);
  });
  it("access states: outsiders and standby see no challenge content; the waiting room shows rules only", () => {
    for (const kind of ["outsider", "standby", "withdrawn"] as const) { const html = renderToStaticMarkup(createElement(Restricted, { kind })); expect(html).not.toMatch(/E-10\d|C-0\d|Incident 1 /); }
    const wr = renderToStaticMarkup(createElement(WaitingRoom, { teamName: "T1" }));
    expect(wr).toContain("50 minutes"); expect(wr).not.toMatch(/E-10\d|C-0\d|P-30\d/);
  });
});
