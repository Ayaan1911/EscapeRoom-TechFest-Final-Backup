// Full-state screenshot + a11y harness. DISPOSABLE local database + local dev server only; fictional teams, throwaway codes.
//   node scripts/final-shots.mjs <label> [phaseName ...]   -> D:\Ghost404-TestWorkspace\shots\<label>\<state>-<size>.png
// Sets up every participant/organizer state (waiting, active chapters incl. unlocked dossier, 50% unlock, finished, Round 2 A/B/finished) and
// records horizontal overflow, console errors and axe violations (axe-core from node_modules if present).
import { createTempDatabase } from "./pg-temp.mjs";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.mjs";
import { initialProgress, complete } from "../src/lib/game/engine.ts";
import { r2Catalog } from "../src/lib/round2/catalog.ts";

const label = process.argv[2] ?? "final", only = process.argv.slice(3);
const out = `D:/Ghost404-TestWorkspace/shots/${label}`; mkdirSync(out, { recursive: true });
const temp = await createTempDatabase("final"), code = randomBytes(12).toString("hex"), ORIGIN = "http://127.0.0.1:3000";
const db = new PrismaClient({ datasourceUrl: temp.url });
const axePath = "node_modules/axe-core/axe.min.js", axeSrc = existsSync(axePath) ? readFileSync(axePath, "utf8") : null;
let server; const stop = () => { if (server?.pid) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); };
const report = [];
const POINTS = [15, 25, 25, 20, 15];
const progress = (done, partial) => { const p = initialProgress(); for (let c = 0; c < done; c++) complete(p, c, POINTS[c], Date.now()); if (partial) { const [c, s] = partial; p.chapters[c].score = s; p.chapters[c].unlockedAt ??= Date.now() - 1e5; } return p; };
const mk = async (id, variant, p, insider = false) => db.team.create({ data: { id, name: `Team ${id}`, participants: JSON.stringify(["Asha Rao", "Ravi Nair", "Meera Iyer"]), codeHash: hashPassword(code), variant, progress: JSON.stringify(p),
  insiderAccess: { create: { fragmentA: "A" + randomBytes(12).toString("hex").toUpperCase(), fragmentB: "B" + randomBytes(12).toString("hex").toUpperCase(), unlockedAt: insider ? new Date() : null } } } });
try {
  await mk("T-NEW", "A", progress(0));
  await mk("T-ONE", "A", progress(0, [0, 8]));          // Inbox 8/15: Trail unlocked by the 50% rule while Inbox is incomplete
  await mk("T-TRAIL", "B", progress(1, [1, 13]));        // Trail 13/25 -> Insider unlocked at threshold
  await mk("T-INS", "A", progress(2, [2, 6]), true);    // Insider dossier unlocked, partial
  await mk("T-SEAL", "A", progress(2));                  // Insider sealed
  await mk("T-CONT", "A", progress(3, [3, 4]), true);   // Containment active
  await mk("T-VERD", "A", progress(4, [4, 5]), true);   // Final verdict active
  await mk("T-DONE", "A", progress(5), true);            // all complete
  // Round 2 finalists (they also carry full Round 1 progress)
  const ids = ["F-01", "F-02", "F-03"]; for (const id of ids) await mk(id, "A", progress(5), true);
  await db.r2Finalist.createMany({ data: ids.map((teamId, i) => ({ teamId, status: "active", seed: i + 1, snapshotDigest: "seeded-digest-0001" })) });

  const env = { ...process.env, DATABASE_URL: temp.url, DIRECT_URL: temp.url, ADMIN_ACCESS_HASH: hashPassword(code), APP_ORIGIN: ORIGIN };
  server = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "--hostname", "127.0.0.1"], { env, stdio: "ignore", shell: process.platform === "win32" });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(ORIGIN + "/login")).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 1000)); }
  const browser = await chromium.launch();
  const sizes = { phone: [375, 812], tablet: [768, 1024], desktop: [1366, 900] };
  const ctxs = new Map();
  const ctxFor = async (sz, who) => {
    const key = `${sz}/${who}`; if (ctxs.has(key)) return ctxs.get(key);
    const [w, h] = sizes[sz] ?? [1920, 1080], ctx = await browser.newContext({ viewport: { width: w, height: h } }); ctxs.set(key, ctx);
    if (who) { const lp = await ctx.newPage(), admin = who === "ADMIN"; await lp.goto(ORIGIN + (admin ? "/organizer/login" : "/login")); if (!admin) await lp.getByLabel("Team ID").fill(who);
      await lp.getByLabel("Access code").fill(code); await lp.getByRole("button", { name: "Sign in", exact: true }).click(); await lp.waitForURL(/\/(play|admin|round2)/, { timeout: 90_000 }); await lp.close(); }
    return ctx;
  };
  const shot = async (state, path, who, szs = Object.keys(sizes), act) => {
    if (only.length && !only.some(o => state.startsWith(o))) return;
    for (const sz of szs) {
      const ctx = await ctxFor(sz, who), page = await ctx.newPage(), errs = [];
      page.on("console", m => { if (m.type() === "error" && !/hydrat|caret|favicon/i.test(m.text())) errs.push(m.text().slice(0, 140)); });
      await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => {}); await page.waitForTimeout(700);
      if (act) await act(page);
      await page.screenshot({ path: `${out}/${state}-${sz}.png`, fullPage: true });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      let ax = "n/a"; if (axeSrc) { await page.evaluate(axeSrc); const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map(v => `${v.id}(${v.impact},${v.nodes.length}) ${String(v.nodes[0].target).slice(0, 90)}${v.id === "color-contrast" ? " " + v.nodes[0].any[0]?.message?.slice(0, 120) : ""}`)); ax = r.join(" ") || "none"; }
      const line = `${state} ${sz}: ${page.url().replace(ORIGIN, "")} overflow=${over > 1 ? over + "px" : "no"} axe=${ax}${errs.length ? " console=" + errs.join("|") : ""}`; report.push(line); console.log(line);
      await page.close();
    }
  };
  const openFirst = sel => async page => { await page.locator(sel).first().click().catch(() => {}); await page.waitForTimeout(300); };

  // --- Round 1 waiting (no session row yet)
  await shot("01-login", "/login", null); await shot("02-waiting-r1", "/play", "T-NEW");
  { const d = { startsAt: new Date(Date.now() - 12 * 60_000), deadline: new Date(Date.now() + 48 * 60_000), scoringPolicy: "best-v1" }; await db.gameSession.upsert({ where: { id: 1 }, create: { id: 1, ...d }, update: d }); }
  await shot("03-dashboard-new", "/play", "T-NEW"); await shot("04-dashboard-mid", "/play", "T-TRAIL");
  await shot("05-inbox", "/play/inbox", "T-NEW"); await shot("06-inbox-unlock-50", "/play/inbox", "T-ONE");
  await shot("07-trail", "/play/trail", "T-TRAIL", undefined, openFirst(".ds-tl-dot"));
  await shot("08-insider-sealed", "/play/insider", "T-SEAL"); await shot("09-insider-active", "/play/insider", "T-INS", undefined, openFirst(".ds-tl-dot"));
  await shot("10-containment", "/play/containment", "T-CONT"); await shot("11-verdict", "/play/verdict", "T-VERD");
  await shot("12-verdict-done", "/play/verdict", "T-DONE");
  // --- Round 1 finished
  await db.gameSession.update({ where: { id: 1 }, data: { endedAt: new Date() } }); await shot("13-r1-finished", "/play", "T-TRAIL", ["phone", "desktop"]);
  // --- Round 2
  await shot("14-r2-waiting", "/round2", "F-01", ["phone", "desktop"]);
  const setR2 = async (min, ended = false) => { await db.r2Session.upsert({ where: { id: 1 }, create: { id: 1, startsAt: new Date(Date.now() - min * 60_000), contentVersion: "r2-v1", scoringPolicy: "best-v1" }, update: { startsAt: new Date(Date.now() - min * 60_000), endedAt: ended ? new Date() : null } }); };
  await setR2(8);
  const a1 = r2Catalog.filter(t => t.part === "A" && t.unit === 1).slice(0, 2); for (const t of a1) await db.r2TaskScore.create({ data: { teamId: "F-01", taskId: t.id, part: "A", earned: Math.max(1, Math.floor(t.max / 2)), max: t.max, criteria: "[]" } }).catch(() => {});
  await shot("15-r2-part-a", "/round2", "F-01");
  await setR2(30); await shot("16-r2-part-b", "/round2", "F-01");
  await setR2(46); await shot("17-r2-part-b-closing", "/round2", "F-01", ["desktop"]);
  await setR2(60, true); await shot("18-r2-finished", "/round2", "F-01", ["phone", "desktop"]);
  // --- Organizer + projector
  await shot("19-organizer", "/admin", "ADMIN"); await shot("20-organizer-r2", "/admin/round2", "ADMIN"); await shot("21-projector", "/admin/projector", "ADMIN", ["desktop", "wide"]);
  await browser.close();
  writeFileSync(`${out}/report.txt`, report.join("\n"));
} finally { stop(); await db.$disconnect(); await temp.drop(); }
