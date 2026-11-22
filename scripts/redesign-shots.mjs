// Screenshot harness for design review. DISPOSABLE local database + local dev server only.
//   node scripts/redesign-shots.mjs <label> [pageKey ...]     -> D:\Ghost404-TestWorkspace\shots\<label>\*.png
import { createTempDatabase } from "./pg-temp.mjs";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress } from "../src/lib/game/engine.ts";

const label = process.argv[2] ?? "shots", only = process.argv.slice(3);
const out = `D:/Ghost404-TestWorkspace/shots/${label}`; mkdirSync(out, { recursive: true });
const temp = await createTempDatabase("shots"), code = randomBytes(12).toString("hex"), ORIGIN = "http://127.0.0.1:3000";
const db = new PrismaClient({ datasourceUrl: temp.url });
let server;
const stop = () => { if (server?.pid) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); };
try {
  await db.gameSession.create({ data: { id: 1, startsAt: new Date(Date.now() - 12 * 60_000), deadline: new Date(Date.now() + 48 * 60_000), scoringPolicy: "best-v1" } });
  const mk = async (id, variant, patch) => { const p = initialProgress(); patch?.(p); await db.team.create({ data: { id, name: `Team ${id}`, participants: JSON.stringify(["Asha", "Ravi", "Meera"]), codeHash: hashPassword(code), variant, progress: JSON.stringify(p) } }); };
  await mk("SHOT-NEW", "A");
  await mk("SHOT-MID", "A", p => { p.chapters[0].score = 12; p.chapters[0].unlockedAt = Date.now() - 5e5; p.chapters[1].score = 9; p.chapters[1].unlockedAt = Date.now() - 2e5; p.chapters[2].unlockedAt = Date.now() - 1e5; });
  const env = { ...process.env, DATABASE_URL: temp.url, DIRECT_URL: temp.url, ADMIN_ACCESS_HASH: hashPassword(code), APP_ORIGIN: ORIGIN };
  server = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "--hostname", "127.0.0.1"], { env, stdio: "ignore", shell: process.platform === "win32" });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(ORIGIN + "/login")).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 1000)); }
  const browser = await chromium.launch();
  const sizes = { desktop: [1440, 900], tablet: [768, 1024], mobile: [390, 844], wide: [1920, 1080] }; // wide = projector/large display, used only for the projector page
  const pages = [["login", "/login", null], ["new-dashboard", "/play", "SHOT-NEW"], ["mid-dashboard", "/play", "SHOT-MID"], ["inbox", "/play/inbox", "SHOT-MID"], ["trail", "/play/trail", "SHOT-MID"], ["insider", "/play/insider", "SHOT-MID"], ["admin", "/admin", "ADMIN"], ["projector", "/admin/projector", "ADMIN"]];
  for (const [sz, [w, h]] of Object.entries(sizes)) {
    const ctxs = new Map(); // one login per identity and size (the login throttle counts repeated sign-ins)
    for (const [name, path, who] of pages) {
      if (only.length && !only.includes(name)) continue;
      if (sz === "wide" && name !== "projector") continue;
      let ctx = ctxs.get(who ?? "anon");
      if (!ctx) {
        ctx = await browser.newContext({ viewport: { width: w, height: h } }); ctxs.set(who ?? "anon", ctx);
        if (who) { const lp = await ctx.newPage(), admin = who === "ADMIN"; await lp.goto(ORIGIN + (admin ? "/organizer/login" : "/login"));
          if (!admin) await lp.getByLabel("Team ID").fill(who);
          await lp.getByLabel("Access code").fill(code); await lp.getByRole("button", { name: "Sign in", exact: true }).click(); await lp.waitForURL(/\/(play|admin)/,{ timeout: 60_000 }); await lp.close(); }
      }
      const page = await ctx.newPage();
      await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 90_000 }); await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}/${name}-${sz}.png`, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      console.log(`${name} ${sz}: ${page.url().replace(ORIGIN, "")} ${overflow ? "HORIZONTAL OVERFLOW" : "ok"}`);
      await page.close();
    }
    for (const c of ctxs.values()) await c.close();
  }
  await browser.close();
} finally { stop(); await db.$disconnect(); await temp.drop(); }
