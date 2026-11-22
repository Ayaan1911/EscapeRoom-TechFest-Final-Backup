import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Static + post-build guards for the paper edition: the answer key and the not-yet-released chapter text must never be in client JavaScript.
const walk = (dir: string, out: string[] = []) => { for (const e of readdirSync(dir)) { const p = join(dir, e); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const KEY_PHRASES = ["ORGANIZER ONLY", "Accept a clue like", "Legitimate look-alikes", "Attacker-controlled:", "fooled SENTINEL-AI", "Paper adaptation of the PDF", "unproven promise", "AI-report audit and explanation of response decisions"];
const CONTENT_PHRASES = ["ALR-0214", "wsvc_sync.exe", "updater_svc.exe", "Disconnect the infected machines", "salary_slip.pdf.exe", "We confirmed unauthorized access", "CONFIDENCE 99.9%"];

describe("paper edition isolation", () => {
  it("no client module imports the key or the chapter content", () => {
    const offenders = walk("src").filter(f => /\.(tsx?|mjs)$/.test(f)).filter(f => { const s = readFileSync(f, "utf8"); return /^\s*["']use client["']/.test(s) && /paper\/(key|content)\.server|server-only/.test(s); });
    expect(offenders).toEqual([]);
  });
  it("key and content are server-only modules", () => {
    for (const f of ["key", "content", "service"]) expect(readFileSync(`src/lib/round2/paper/${f}.server.ts`, "utf8")).toMatch(/import "server-only"/);
  });
  it("only admin-gated files import the key", () => {
    const users = walk("src").filter(f => /\.(tsx?|mjs)$/.test(f) && /paper\/key\.server/.test(readFileSync(f, "utf8"))).map(f => f.replaceAll("\\", "/")).sort();
    expect(users).toEqual(["src/app/admin/round2/print/docs.tsx"]); // rendered only by pages that call session("admin") first
    for (const page of ["src/app/admin/round2/print/[doc]/page.tsx", "src/app/admin/round2/print/page.tsx"]) expect(readFileSync(page, "utf8")).toMatch(/session\("admin"\)/);
  });
  it("the production client bundle contains no answer key and no chapter text (needs `npm run build`)", () => {
    expect(existsSync(".next/static")).toBe(true);
    const hits: string[] = [];
    for (const f of walk(".next/static").filter(x => /\.(js|css|html|json)$/.test(x))) { const s = readFileSync(f, "utf8"); for (const p of [...KEY_PHRASES, ...CONTENT_PHRASES]) if (s.includes(p)) hits.push(`${f}: ${p}`); }
    expect(hits).toEqual([]);
  });
  it("no public asset or contestant-downloadable file carries the key", () => {
    expect(existsSync("public")).toBe(false); // the app ships no public/ directory; nothing is served statically
  });
});
