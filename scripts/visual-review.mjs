// Local visual review: disposable PostgreSQL + production build + Chromium screenshots of every screen at 4 widths.
//   npm run build && node scripts/visual-review.mjs <outDir> [--widths 390,768,1366,1920]
// Teams are fictional fixtures with generated throwaway codes; nothing leaves this machine.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createTempDatabase } from "./pg-temp.mjs";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress, complete, bonus } from "../src/lib/game/engine.ts";

const out = process.argv[2]; if (!out) throw new Error("usage: visual-review.mjs <outDir>");
const widths = (process.argv.includes("--widths") ? process.argv[process.argv.indexOf("--widths") + 1] : "390,768,1366,1920").split(",").map(Number);
mkdirSync(out, { recursive: true });
const PORT = 3200, origin = `http://127.0.0.1:${PORT}`, code = randomBytes(18).toString("hex");
const temp = await createTempDatabase("shots"), db = new PrismaClient({ datasourceUrl: temp.url });
const env = { ...process.env, DATABASE_URL: temp.url, DIRECT_URL: temp.url, ADMIN_ACCESS_HASH: hashPassword(code), APP_ORIGIN: origin, NODE_ENV: "production" };
let server;
const stop = () => server?.pid && spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
try {
  await db.gameSession.create({ data: { id: 1, startsAt: new Date(), deadline: new Date(Date.now() + 3600_000) } });
  const points = [15, 25, 25, 20, 15];
  for (let n = 0; n <= 5; n++) {
    const p = initialProgress(); for (let c = 0; c < n; c++) complete(p, c, points[c], Date.now()); if (n >= 1) bonus(p);
    await db.team.create({ data: { id: `SHOT-${n}`, name: `Shot team ${n}`, participants: JSON.stringify(["Investigator One", "Investigator Two", "Investigator Three"]), codeHash: hashPassword(code), variant: "A", progress: JSON.stringify(p),
      insiderAccess: { create: { fragmentA: "A" + randomBytes(12).toString("hex").toUpperCase(), fragmentB: "B" + randomBytes(12).toString("hex").toUpperCase(), unlockedAt: n >= 2 ? new Date() : null } } } });
    for (let c = 0; c < n; c++) await db.submission.create({ data: { teamId: `SHOT-${n}`, chapter: c, accepted: true, reason: "completed" } });
    if (n >= 2) await db.auditLog.create({ data: { actor: `SHOT-${n}`, action: "dossier-unlock", detail: JSON.stringify({ chapter: 2 }) } });
  }
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: "ignore", windowsHide: true });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(origin + "/login")).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 500)); }
  const browser = await chromium.launch();
  const findings = [];
  for (const w of widths) {
    const shot = async (page, name) => {
      await page.waitForTimeout(700);
      const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth, h: document.documentElement.scrollHeight }));
      if (m.over > 1) findings.push(`${w}px ${name}: horizontal overflow ${m.over}px`);
      await page.screenshot({ path: join(out, `${w}-${name}.png`), fullPage: true });
    };
    const newPage = async () => { const ctx = await browser.newContext({ viewport: { width: w, height: w < 700 ? 844 : 900 } }), page = await ctx.newPage(); page.on("console", m => { if (m.type() === "error") findings.push(`${w}px console error: ${m.text().slice(0, 120)}`); }); return page; };
    const team = async n => { const page = await newPage(); await page.goto(origin + "/login"); await page.getByLabel("Team ID").fill(`SHOT-${n}`); await page.getByLabel("Access code").fill(code); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL("**/play"); return page; };
    let page = await newPage();
    await page.goto(origin + "/"); await shot(page, "01-landing");
    await page.goto(origin + "/login"); await shot(page, "02-login");
    await page.goto(origin + "/organizer/login"); await shot(page, "03-organizer-login");
    for (const [n, path, name] of [[2, "/play", "04-dashboard"], [0, "/play/inbox", "05-inbox"], [1, "/play/trail", "06-trail"], [2, "/play/insider", "07-insider"], [3, "/play/containment", "08-containment"], [4, "/play/verdict", "09-verdict"], [5, "/play/verdict", "10-case-closed"]]) {
      page = await team(n); if (path !== "/play") await page.goto(origin + path); await page.waitForTimeout(500); await shot(page, name);
    }
    page = await newPage(); await page.goto(origin + "/organizer/login"); await page.getByLabel("Access code").fill(code); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForURL("**/admin"); await shot(page, "11-admin");
  }
  await browser.close();
  console.log(findings.length ? findings.join("\n") : "no overflow or console errors");
} finally { stop(); await db.$disconnect(); await temp.drop(); }
