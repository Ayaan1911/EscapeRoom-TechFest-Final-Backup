// Design probe: top-level blocks of each chapter's main column with their vertical position (needs scripts/ui-dev.mjs running).
import { chromium } from "@playwright/test"; import { readFileSync } from "node:fs";
const { code, origin } = JSON.parse(readFileSync("D:/Ghost404-TestWorkspace/ui-session.json", "utf8")), [W, H] = (process.argv[2] ?? "1366x768").split("x").map(Number);
const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: W, height: H } }), p = await ctx.newPage();
await p.goto(origin + "/login"); await p.getByLabel("Team ID").fill("SHOT-MID"); await p.getByLabel("Access code").fill(code); await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(/play/);
const pages = [["inbox", "/play/inbox"], ["trail", "/play/trail"], ["insider", "/play/insider"]];
const a = await ctx.newPage(); await a.goto(origin + "/organizer/login"); await a.getByLabel("Access code").fill(code); await a.getByRole("button", { name: "Sign in", exact: true }).click(); await a.waitForURL(/admin/);
for (const [n, u, pg] of [...pages.map(x => [...x, p]), ["containment", "/admin/demo/round1/containment", a], ["verdict", "/admin/demo/round1/verdict", a]]) {
  await pg.goto(origin + u, { waitUntil: "networkidle" }); await pg.waitForTimeout(1500);
  const r = await pg.evaluate(() => [...document.querySelectorAll(".pg-main > *")].map(e => `${e.tagName.toLowerCase()}.${String(e.className).split(" ").slice(0, 2).join(".")} y=${Math.round(e.getBoundingClientRect().top + scrollY)} h=${Math.round(e.getBoundingClientRect().height)}`).concat([`TOTAL h=${document.documentElement.scrollHeight}`]));
  console.log("\n" + n + " (" + W + "x" + H + ")\n  " + r.join("\n  "));
}
await b.close();
