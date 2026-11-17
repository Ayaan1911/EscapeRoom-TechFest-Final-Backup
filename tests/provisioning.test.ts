import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTempDatabase } from "../scripts/pg-temp.mjs";
import { generateCode, generatedTeams, parseCsv, planTeams, teamsFromCsv, csvField } from "../scripts/provision-lib.mjs";
import { hashPassword, verifyPassword, verifyPasswordAsync } from "../src/lib/password.mjs";

describe("real-team provisioning", () => {
  it("plans 50 unique teams with balanced variants and unique strong codes", () => {
    const plan = planTeams(generatedTeams(50), []);
    expect(new Set(plan.map(t => t.id)).size).toBe(50);
    const count = (v: string) => plan.filter(t => t.variant === v).length;
    expect([count("A"), count("B"), count("C")].sort()).toEqual([16, 17, 17]);
    const codes = Array.from({ length: 500 }, () => generateCode());
    expect(new Set(codes).size).toBe(500);
    for (const code of codes) expect(code).toMatch(/^([A-HJ-NP-Z2-9]{4}-){4}[A-HJ-NP-Z2-9]{4}$/);
  });
  it("never overwrites or collides with registered teams and keeps variants balanced across batches", () => {
    const existing = [{ id: "GH-01", variant: "A" }, { id: "GH-02", variant: "A" }];
    expect(() => planTeams([{ id: "GH-01", name: "x", participants: ["a", "b", "c"] }], existing)).toThrow(/already registered/);
    const next = planTeams(generatedTeams(3), existing);
    expect(next.map(t => t.id)).toEqual(["GH-03", "GH-04", "GH-05"]);
    expect(next.map(t => t.variant)).toEqual(["B", "C", "B"]);
  });
  it("rejects duplicate IDs, bad IDs, wrong participant counts and oversize input", () => {
    const t = (id: string, p = ["a", "b", "c"]) => ({ id, name: "n", participants: p });
    expect(() => planTeams([t("X1"), t("X1")], [])).toThrow(/Duplicate/);
    expect(() => planTeams([t("bad id")], [])).toThrow(/Invalid team ID/);
    expect(() => planTeams([t("OK-1", ["a", "b"])], [])).toThrow(/three participant/);
    expect(() => planTeams([], [])).toThrow();
    expect(() => planTeams(generatedTeams(101), [])).toThrow();
  });
  it("parses CSV with quoting and validates the header", () => {
    expect(parseCsv('a,"b,""q""",c\r\n1,2,3\n')).toEqual([["a", 'b,"q"', "c"], ["1", "2", "3"]]);
    expect(teamsFromCsv('id,name,participant1,participant2,participant3\nt-1,"Red, Team",A,B,C\n,Blue,D,E,F')).toEqual([{ id: "T-1", name: "Red, Team", participants: ["A", "B", "C"] }, { id: "", name: "Blue", participants: ["D", "E", "F"] }]);
    expect(() => teamsFromCsv("id,name\n1,2")).toThrow(/header/);
    expect(csvField("=HYPERLINK(1)")).toBe('"\'=HYPERLINK(1)"');
  });
  it("hashed codes verify only for their own team (sync and async)", async () => {
    const teams = Array.from({ length: 5 }, () => generateCode()).map(code => ({ code, hash: hashPassword(code) }));
    for (const [i, t] of teams.entries()) {
      expect(t.hash).not.toContain(t.code);
      expect(verifyPassword(t.code, t.hash)).toBe(true);
      expect(await verifyPasswordAsync(t.code, t.hash)).toBe(true);
      expect(await verifyPasswordAsync(teams[(i + 1) % 5].code, t.hash)).toBe(false);
    }
    expect(await verifyPasswordAsync("x", "malformed")).toBe(false);
  });
});

describe("provisioning CLI and backup/restore against disposable databases", () => {
  it("dry-run writes nothing; apply registers teams hashed, refuses reuse of credentials file and existing IDs; backup/verify/restore round-trips", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ghost-prov-")), temp = await createTempDatabase("prov");
    try {
      const env = { ...process.env, DATABASE_URL: temp.url, DIRECT_URL: temp.url };
      const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/provision-teams.mjs", ...args, ...(args.includes("--apply") ? ["--expect-database", temp.name] : [])], { env, encoding: "utf8" });
      const bare = (...args: string[]) => spawnSync(process.execPath, ["scripts/provision-teams.mjs", ...args], { env, encoding: "utf8" });
      const backupCli = (...args: string[]) => spawnSync(process.execPath, ["scripts/db-backup.mjs", ...args], { env, encoding: "utf8" });
      const out = join(dir, "private", "creds.csv");
      const dry = run("--generate", "50", "--out", out); expect(dry.stdout, dry.stderr).toContain("DRY RUN");
      expect(run("--list").stdout).toContain("0 registered");
      const noGuard = bare("--generate", "1", "--out", join(dir, "x.csv"), "--apply"); expect(noGuard.status).not.toBe(0); expect(noGuard.stderr).toContain("--expect-database"); expect(existsSync(join(dir, "x.csv"))).toBe(false);
      const wrong = spawnSync(process.execPath, ["scripts/provision-teams.mjs", "--generate", "1", "--out", join(dir, "y.csv"), "--apply", "--expect-database", "ghost404_preview"], { env, encoding: "utf8" }); expect(wrong.status).not.toBe(0); expect(existsSync(join(dir, "y.csv"))).toBe(false);
      const applied = run("--generate", "50", "--out", out, "--apply");
      expect(applied.status, applied.stderr).toBe(0);
      const creds = readFileSync(out, "utf8").trim().split(/\r?\n/);
      expect(creds).toHaveLength(51);
      const list = run("--list").stdout;
      expect(list).toContain("50 registered");
      for (const line of creds.slice(1)) expect(list).not.toContain(line.split(",").at(-1)!.replaceAll('"', "")); // codes never listed
      expect(run("--generate", "1", "--out", out, "--apply").status).not.toBe(0); // credentials file never overwritten
      const csv = join(dir, "in.csv"); writeFileSync(csv, "id,name,participant1,participant2,participant3\nGH-01,Dup,A,B,C\n");
      const dup = run("--input", csv, "--out", join(dir, "c2.csv"), "--apply");
      expect(dup.status).not.toBe(0); expect(dup.stderr).toContain("already registered");
      expect(run("--list").stdout).toContain("50 registered");
      // backup -> verify -> restore (refused into a populated database; allowed into an empty one)
      const backup = backupCli("backup", join(dir, "bk"));
      expect(backup.status, backup.stderr).toBe(0);
      const file = /Backup written: (.+\.json)/.exec(backup.stdout)![1];
      expect(backup.stdout).toContain("teams: 50");
      expect(backupCli("verify", file).stdout).toContain("team: 50");
      expect(backupCli("restore", file).status).not.toBe(0); // needs --yes
      expect(backupCli("restore", file, "--yes").status).not.toBe(0); // populated database refused
      const empty = await createTempDatabase("restore");
      try {
        const restored = spawnSync(process.execPath, ["scripts/db-backup.mjs", "restore", file, "--yes"], { env: { ...process.env, DATABASE_URL: empty.url, DIRECT_URL: empty.url }, encoding: "utf8" });
        expect(restored.status, restored.stderr).toBe(0); expect(restored.stdout).toContain("Restored 50 teams");
        expect(spawnSync(process.execPath, ["scripts/provision-teams.mjs", "--list"], { env: { ...process.env, DATABASE_URL: empty.url, DIRECT_URL: empty.url }, encoding: "utf8" }).stdout).toContain("50 registered");
      } finally { await empty.drop(); }
    } finally { rmSync(dir, { recursive: true, force: true }); await temp.drop(); }
  }, 180_000);
});
