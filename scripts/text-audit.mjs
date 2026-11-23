// Rendered-text audit of each Round 1 chapter's arrival state in Demo Mode (needs scripts/ui-dev.mjs running). Words = live main.innerText (closed disclosures excluded).
import { chromium } from "@playwright/test"; import { readFileSync } from "node:fs";
const { code, origin } = JSON.parse(readFileSync("D:/Ghost404-TestWorkspace/ui-session.json", "utf8")), [W, H] = (process.argv[2] ?? "1440x900").split("x").map(Number);
const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: W, height: H }, reducedMotion: "reduce" }), a = await ctx.newPage();
await a.goto(origin + "/organizer/login"); await a.getByLabel("Access code").fill(code); await a.getByRole("button", { name: "Sign in", exact: true }).click(); await a.waitForURL(/admin/);
const out = [];
for (const ch of ["inbox", "trail", "insider", "containment", "verdict"]) {
  await a.goto(`${origin}/admin/demo/round1/${ch}`, { waitUntil: "networkidle" }); await a.waitForTimeout(1500);
  const m = await a.evaluate(() => { const main = document.querySelector("main"); const t = main.innerText.trim(); const vh = innerHeight;
    const first = [...document.querySelectorAll(".pg-bench, .pg-console, .rm, .cn-board, .pg-board")].map(e => e.getBoundingClientRect().top + scrollY).sort((x, y) => x - y)[0];
    return { words: t.split(/\s+/).filter(Boolean).length, scrollH: document.documentElement.scrollHeight, screens: +(document.documentElement.scrollHeight / vh).toFixed(2), workspaceTop: Math.round(first ?? -1) }; });
  out.push({ chapter: ch, ...m });
}
console.log(`viewport ${W}x${H}`); console.table(out); await b.close();
