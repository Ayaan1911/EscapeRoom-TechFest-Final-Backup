import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { insiderPrintPages, insiderWallStation, matchesInsiderFragments, newInsiderFragments } from "../src/lib/game/insider-fragments.server";
import { containmentCctv } from "../src/lib/game/containment.server";
import { generatedTeams, planTeams } from "../scripts/provision-lib.mjs";

describe("physical kit consistency for 50 teams", () => {
  const teams = planTeams(generatedTeams(50), []).map(t => ({ ...t, ...newInsiderFragments() }));
  it("gives every team a unique private A fragment and a public B card at exactly one station; fragments never cross parts", () => {
    expect(new Set(teams.map(t => t.fragmentA)).size).toBe(50);
    expect(new Set(teams.map(t => t.fragmentB)).size).toBe(50);
    const a = insiderPrintPages(teams.map(t => ({ teamId: t.id, station: insiderWallStation(t.id), fragment: t.fragmentA })), "A");
    const b = insiderPrintPages(teams.map(t => ({ teamId: t.id, station: insiderWallStation(t.id), fragment: t.fragmentB })), "B");
    expect(a.every(page => page.station === "PRIVATE" && page.cards.length <= 12)).toBe(true);
    expect(a.flatMap(p => p.cards).map(c => c.teamId).sort()).toEqual(teams.map(t => t.id).sort());
    const placed = b.flatMap(p => p.cards.map(c => ({ ...c, pageStation: p.station })));
    expect(placed).toHaveLength(50);
    for (const card of placed) expect(card.pageStation).toBe(insiderWallStation(card.teamId));
    expect(JSON.stringify(a)).not.toMatch(/"B-[0-9A-F]{6}-/); // Part A sheets carry no public B material
    expect(JSON.stringify(b)).not.toMatch(/"A-[0-9A-F]{6}-/);
    expect(new Set(placed.map(c => c.pageStation)).size).toBeGreaterThan(2); // wall spreads across stations
  });
  it("accepts only the matching A+B pair for the owning team", () => {
    teams.slice(0, 10).forEach((t, i) => {
      const other = teams[(i + 1) % 50];
      expect(matchesInsiderFragments(t, { fragmentA: t.fragmentA, fragmentB: t.fragmentB })).toBe(true);
      expect(matchesInsiderFragments(t, { fragmentA: other.fragmentA, fragmentB: t.fragmentB })).toBe(false);
      expect(matchesInsiderFragments(t, { fragmentA: t.fragmentA, fragmentB: other.fragmentB })).toBe(false);
      expect(matchesInsiderFragments(t, { fragmentA: t.fragmentB, fragmentB: t.fragmentA })).toBe(false);
    });
  });
  it("matches each team's CCTV sheet to its own variant", () => {
    for (const variant of ["A", "B", "C"]) {
      const cctv = containmentCctv(variant);
      expect(cctv.variant).toBe(variant);
      expect(JSON.stringify(cctv)).toContain(`-${variant}-`);
      for (const other of ["A", "B", "C"].filter(v => v !== variant)) expect(JSON.stringify(cctv)).not.toContain(`CCTV-${other}-`);
    }
  });
});

// Requires `npm run build`; skipped (not failed) when no build output exists.
describe.runIf(existsSync(".next/static"))("production client bundles", () => {
  const files: string[] = [];
  const walk = (dir: string) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|json|html|css)$/.test(name)) files.push(p); } };
  walk(".next/static");
  const corpus = files.map(f => readFileSync(f, "utf8")).join("\n");
  it("contains no secrets, validators, hashes or physical fragments", () => {
    for (const marker of ["ADMIN_ACCESS_HASH", "GHOST_E2E", "scryptSync", "verdictValidator", "insiderSolution", "newInsiderFragments", "matchesInsiderFragments", "DATABASE_URL", "codeHash"]) expect(corpus, marker).not.toContain(marker);
    expect(corpus).not.toMatch(/\b[AB][0-9A-F]{24}\b/);
    expect(corpus).not.toMatch(/[0-9a-f]{32}:[0-9a-f]{128}/);
  });
  it("does not ship any complete answer object", () => {
    expect(corpus).not.toMatch(/employeeId:"EMP-[ABC]-0\d",actionId:"POL/);
    expect(corpus).not.toMatch(/chain:\{emailId:"MAIL-/);
    expect(corpus).not.toMatch(/eventOrder:\["INC-/);
  });
});
