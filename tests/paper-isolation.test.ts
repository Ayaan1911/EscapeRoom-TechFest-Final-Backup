import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Static + post-build guards for Round 2 (GHOST RETURNS, one 60-minute format): the private answer key, the Kill Switch classification
// and wrong-block messages, and the inject content must never be in client JavaScript, public assets or the repository.
const walk = (dir: string, out: string[] = []) => { for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; };
// Phrases that exist only in the private key file (its wrong-block messages and marking notes). They are read from that git-ignored file at test
// time, never written into this public repository; without the file the key-specific checks fall back to the generic marker only.
const KEY_FILE = process.env.GHOST_R2_KEY_FILE || "private/round2-key-v2.json";
const privateKey = existsSync(KEY_FILE) ? JSON.parse(readFileSync(KEY_FILE, "utf8")) : null;
const KEY_PHRASES: string[] = ["ORGANIZER ONLY", ...(privateKey ? [...Object.values(privateKey.inject2.wrongMessages as Record<string, string>), privateKey.inject2.hints.slice(0, 40), privateKey.inject1.rationale.slice(0, 40)] : [])];
const CONTENT_PHRASES = ["ALR-0214", "wsvc_sync.exe", "backup-agent2.exe", "salary_slip.pdf.exe", "AI SUMMARY TOOL", "Turn those machines off", "IT-4518"];

describe("Round 2 isolation", () => {
  it("no client module imports the key, the terminal engine or the inject content", () => {
    const offenders = walk("src").filter(f => /\.(tsx?|mjs)$/.test(f)).filter(f => { const s = readFileSync(f, "utf8"); return /^\s*["']use client["']/.test(s) && /paper\/(private-key|terminal|content-v2|service)\.server|server-only/.test(s); });
    expect(offenders).toEqual([]);
  });
  it("key, terminal, content and service are server-only modules", () => {
    for (const f of ["private-key", "terminal", "content-v2", "service"]) expect(readFileSync(`src/lib/round2/paper/${f}.server.ts`, "utf8")).toMatch(/import "server-only"/);
  });
  it("only the terminal engine and admin-gated print pages import the key", () => {
    const users = walk("src").filter(f => /\.(tsx?|mjs)$/.test(f) && /from ["'][^"']*private-key\.server/.test(readFileSync(f, "utf8"))).map(f => f.replaceAll("\\", "/")).sort();
    expect(users).toEqual(["src/app/admin/round2/print/docs-v2.tsx", "src/lib/round2/paper/terminal.server.ts"]);
    for (const page of ["src/app/admin/round2/print/[doc]/page.tsx", "src/app/admin/round2/print/page.tsx"]) expect(readFileSync(page, "utf8")).toMatch(/session\("admin"\)/);
  });
  it("the private key is git-ignored and no tracked source file carries its wrong-block messages", () => {
    expect(readFileSync(".gitignore", "utf8")).toMatch(/^\/private\/$/m);
    const tracked = walk("src").concat(walk("tests"), walk("docs")).filter(f => /\.(tsx?|mjs|json|md)$/.test(f));
    const hits = tracked.flatMap(f => { const s = readFileSync(f, "utf8"); return KEY_PHRASES.slice(1).filter(p => s.includes(p)).map(p => `${f}: ${p}`); });
    expect(hits).toEqual([]);
  });
  it("the production client bundle contains no key material and no inject text (needs `npm run build`)", () => {
    expect(existsSync(".next/static")).toBe(true);
    const hits: string[] = [];
    for (const f of walk(".next/static").filter(x => /\.(js|css|html|json)$/.test(x))) { const s = readFileSync(f, "utf8"); for (const p of [...KEY_PHRASES, ...CONTENT_PHRASES]) if (s.includes(p)) hits.push(`${f}: ${p}`); }
    expect(hits).toEqual([]);
  });
  it("no public asset directory exists", () => { expect(existsSync("public")).toBe(false); });
});
