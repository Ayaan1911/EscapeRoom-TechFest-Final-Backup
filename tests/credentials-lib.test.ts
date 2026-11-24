import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PASSWORD_RE, decryptBundle, encryptBundle, fingerprint, generateBundle, generatePassword, renderCardsHtml, validateBundle, type Bundle } from "../scripts/credentials-lib.mjs";

const PASS = "correct horse battery staple 2026";
const clone = (b: Bundle): Bundle => JSON.parse(JSON.stringify(b));

describe("final event credential bundle", () => {
  const bundle = generateBundle();

  it("has exactly 32 accounts TEAM-01..TEAM-32: 30 primary, then 2 reserve", () => {
    expect(bundle.teams).toHaveLength(32);
    expect(bundle.teams.map(t => t.id)).toEqual(Array.from({ length: 32 }, (_, i) => `TEAM-${String(i + 1).padStart(2, "0")}`));
    expect(bundle.teams.filter(t => t.kind === "primary").map(t => t.slot)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(bundle.teams.filter(t => t.kind === "reserve").map(t => t.id)).toEqual(["TEAM-31", "TEAM-32"]);
    expect(() => validateBundle(bundle)).not.toThrow();
  });

  it("every password is exactly XXX-XXX-XXX in uppercase letters, unique, and not derived from the team number", () => {
    for (const t of bundle.teams) { expect(t.password).toMatch(PASSWORD_RE); expect(t.password).toMatch(/^[A-Z]{3}-[A-Z]{3}-[A-Z]{3}$/); expect(t.password).toHaveLength(11); }
    expect(new Set(bundle.teams.map(t => t.password)).size).toBe(32);
    expect(bundle.teams.every(t => !/\d/.test(t.password))).toBe(true); // letters only: the team number cannot be in it
    const other = generateBundle(); expect(other.teams.map(t => t.password)).not.toEqual(bundle.teams.map(t => t.password)); // not deterministic
    expect(other.bundleId).not.toBe(bundle.bundleId);
  });

  it("primary teams split exactly 10/10/10 across A, B and C (not in team order); reserves have no group", () => {
    const count = (g: string) => bundle.teams.filter(t => t.group === g).length;
    expect([count("A"), count("B"), count("C")]).toEqual([10, 10, 10]);
    expect(bundle.teams.filter(t => t.kind === "reserve").every(t => t.group === null)).toBe(true);
    const seq = bundle.teams.slice(0, 30).map(t => t.group).join(""); expect(seq).not.toBe("ABC".repeat(10)); expect(seq).not.toBe("A".repeat(10) + "B".repeat(10) + "C".repeat(10));
  });

  it("holds exactly six unique shared Insider codes (three private, three public) in the print-friendly format", () => {
    const codes = (["A", "B", "C"] as const).flatMap(g => [bundle.fragments[g].private, bundle.fragments[g].public]);
    expect(new Set(codes)).toHaveProperty("size", 6);
    for (const g of ["A", "B", "C"] as const) { expect(bundle.fragments[g].private).toMatch(/^P-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/); expect(bundle.fragments[g].public).toMatch(/^W-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/); }
  });

  it("uses a cryptographically secure source only (no Math.random anywhere in the credential code)", () => {
    for (const file of ["scripts/credentials-lib.mjs", "scripts/credentials-db.mjs", "scripts/credentials.mjs"]) expect(readFileSync(file, "utf8")).not.toMatch(/Math\.random\s*\(/);
    expect(readFileSync("scripts/credentials-lib.mjs", "utf8")).toContain("randomInt");
    const stub = generatePassword(max => max - 1); expect(stub).toMatch(PASSWORD_RE); // the generator really draws from the injected source
  });

  it("rejects malformed bundles without echoing any secret", () => {
    const bad = (mutate: (b: Bundle) => void) => { const b = clone(bundle); mutate(b); return b; };
    const cases: [Bundle, RegExp][] = [
      [bad(b => { b.teams[3].password = "abc-def-ghi"; }), /XXX-XXX-XXX/], [bad(b => { b.teams[3].password = "ABCDEFGHI"; }), /XXX-XXX-XXX/], [bad(b => { b.teams[3].password = b.teams[4].password; }), /duplicate password/],
      [bad(b => { b.teams.pop(); }), /exactly 32/], [bad(b => { b.teams[0].id = "GH-001"; }), /TEAM-01/], [bad(b => { b.teams[30].kind = "primary"; }), /kind must be reserve/],
      [bad(b => { b.teams[0].group = b.teams[0].group === "A" ? "B" : "A"; }), /10\/10\/10/], [bad(b => { b.teams[30].group = "A"; }), /no group/], [bad(b => { b.fragments.A.public = b.fragments.A.private; }), /malformed|duplicate/],
      [bad(b => { b.fragments.B.private = b.fragments.A.private; }), /duplicate code/], [bad(b => { b.bundleId = "nope"; }), /bundleId/],
    ];
    for (const [b, re] of cases) { let message = ""; try { validateBundle(b); } catch (e) { message = (e as Error).message; } expect(message).toMatch(re); for (const t of bundle.teams) expect(message).not.toContain(t.password); expect(message).not.toContain(bundle.fragments.A.private); }
  });

  it("the fingerprint identifies the provisioning set but contains no password or code", () => {
    const f = fingerprint(bundle); expect(f).toMatch(/^[0-9a-f]{16}$/); expect(fingerprint(clone(bundle))).toBe(f);
    const changed = clone(bundle); changed.teams[0].group = changed.teams[0].group === "A" ? "B" : "A"; expect(fingerprint(changed)).not.toBe(f);
    const pw = clone(bundle); pw.teams[0].password = "ZZZ-ZZZ-ZZZ"; expect(fingerprint(pw)).toBe(f); // passwords are not part of it
  });
});

describe("protected storage (AES-256-GCM, scrypt key)", () => {
  const bundle = generateBundle();
  it("round-trips, and the file contains no plaintext password or code", () => {
    const file = encryptBundle(bundle, PASS), back = decryptBundle(file, PASS);
    expect(back).toEqual(bundle);
    for (const t of bundle.teams) expect(file).not.toContain(t.password);
    expect(file).not.toContain(bundle.fragments.A.private); expect(file).not.toContain("TEAM-01"); expect(JSON.parse(file)).toMatchObject({ format: "ghost404-credentials-enc", kdf: "scrypt" });
  });
  it("two encryptions of the same bundle differ (fresh salt and IV) but both decrypt to the same credentials", () => {
    const a = encryptBundle(bundle, PASS), b = encryptBundle(bundle, PASS); expect(a).not.toBe(b); expect(decryptBundle(a, PASS)).toEqual(decryptBundle(b, PASS));
  });
  it("a wrong passphrase or any altered byte is refused (authenticated encryption)", () => {
    const file = encryptBundle(bundle, PASS);
    expect(() => decryptBundle(file, "wrong passphrase wrong passphrase")).toThrow(/wrong passphrase|altered/);
    const env = JSON.parse(file); const raw = Buffer.from(env.ciphertext, "base64"); raw[5] ^= 1; env.ciphertext = raw.toString("base64"); expect(() => decryptBundle(JSON.stringify(env), PASS)).toThrow(/altered/);
    const header = JSON.parse(file); header.N = 2 ** 14; expect(() => decryptBundle(JSON.stringify(header), PASS)).toThrow(); // the KDF parameters are authenticated / change the key
    expect(() => decryptBundle("not json", PASS)).toThrow(/not a credential bundle/);
  });
  it("refuses a weak passphrase and refuses to encrypt an invalid bundle", () => {
    expect(() => encryptBundle(bundle, "short")).toThrow(/at least 16/);
    const broken = clone(bundle); broken.teams[1].password = "bad"; expect(() => encryptBundle(broken, PASS)).toThrow(/invalid/);
  });
});

describe("printable access cards", () => {
  const bundle = generateBundle();
  it("each primary card carries the team ID, its password, its group and its PRIVATE code, and never a public code", () => {
    const html = renderCardsHtml(bundle, { include: "primary" });
    expect((html.match(/<article class="card/g) ?? [])).toHaveLength(30);
    for (const t of bundle.teams.filter(x => x.kind === "primary")) {
      const card = html.split("<article ").find(part => part.includes(`>${t.id}</code>`))!;
      expect(card).toContain(t.password); expect(card).toContain(`GROUP ${t.group}`); expect(card).toContain(bundle.fragments[t.group!].private);
      for (const g of ["A", "B", "C"] as const) { expect(card).not.toContain(bundle.fragments[g].public); if (g !== t.group) expect(card).not.toContain(bundle.fragments[g].private); } // only ITS private code
    }
    for (const g of ["A", "B", "C"] as const) expect(html).not.toContain(bundle.fragments[g].public);
    expect(html).toContain("OPERATION GHOST_404"); expect(html).toContain("TEAM ACCESS CARD"); expect(html).toContain("Keep this card secure"); expect(html).not.toMatch(/RESERVE ACCESS CARD/);
  });
  it("reserve cards are clearly marked, carry no group before activation, and carry the replaced slot's private code after", () => {
    const before = renderCardsHtml(bundle, { include: "reserve" });
    expect((before.match(/<article class="card/g) ?? [])).toHaveLength(2); expect(before).toContain("RESERVE ACCESS CARD"); expect(before).toContain("NOT ASSIGNED"); expect(before).toContain("TEAM-31"); expect(before).toContain("TEAM-32");
    for (const g of ["A", "B", "C"] as const) { expect(before).not.toContain(bundle.fragments[g].private); expect(before).not.toContain(bundle.fragments[g].public); }
    const after = renderCardsHtml(bundle, { include: "reserve", activations: { "TEAM-31": { group: "B" } } });
    const card31 = after.split("<article ").find(p => p.includes(">TEAM-31</code>"))!, card32 = after.split("<article ").find(p => p.includes(">TEAM-32</code>"))!;
    expect(card31).toContain("GROUP B"); expect(card31).toContain(bundle.fragments.B.private); expect(card31).not.toContain(bundle.fragments.B.public); expect(card32).toContain("NOT ASSIGNED");
  });
  it("reprinting from the same bundle yields identical credentials every time", () => {
    const strip = (h: string) => h.replace(/Bundle B-[0-9A-F]{12} · /, "");
    expect(strip(renderCardsHtml(bundle))).toBe(strip(renderCardsHtml(decryptBundle(encryptBundle(bundle, PASS), PASS))));
  });
  it("escapes HTML and marks the file as confidential and noindex", () => {
    const html = renderCardsHtml(bundle); expect(html).toContain("CONFIDENTIAL"); expect(html).toContain('name="robots" content="noindex"'); expect(html).not.toContain("<script");
  });
});
