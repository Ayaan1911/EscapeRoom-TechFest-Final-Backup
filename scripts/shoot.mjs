// Screenshots from the running scripts/ui-dev.mjs session (credentials read from the file outside the repo, never printed).
//   node scripts/shoot.mjs <label> [name ...] [--size 1440x900] [--full]
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";

const args = process.argv.slice(2), label = args[0] ?? "shots", flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const names = args.slice(1).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
const [W, H] = flag("size", "1440x900").split("x").map(Number), full = args.includes("--full");
const { code, origin } = JSON.parse(readFileSync("D:/Ghost404-TestWorkspace/ui-session.json", "utf8"));
const out = `D:/Ghost404-TestWorkspace/shots/${label}`; mkdirSync(out, { recursive: true });
const PAGES = {
  landing: ["/", null], login: ["/login", null], dashboard: ["/play", "SHOT-MID"], "dashboard-new": ["/play", "SHOT-NEW"],
  inbox: ["/play/inbox", "SHOT-MID"], trail: ["/play/trail", "SHOT-MID"], insider: ["/play/insider", "SHOT-MID"],
  containment: ["/admin/demo/round1/containment", "ADMIN"], verdict: ["/admin/demo/round1/verdict", "ADMIN"],
  insiderd: ["/admin/demo/round1/insider", "ADMIN"], trailu: ["/admin/demo/round1/trail", "ADMIN"], inboxd: ["/admin/demo/round1/inbox", "ADMIN"],
  done: ["/play", "SHOT-DONE"], v1: ["/admin/demo/round2?format=open-60&unit=1", "ADMIN"], v2: ["/admin/demo/round2?format=open-60&unit=2", "ADMIN"], v3: ["/admin/demo/round2?format=open-60&unit=3", "ADMIN"], v4: ["/admin/demo/round2?format=open-60&unit=4", "ADMIN"], demo: ["/admin/demo", "ADMIN"], r2a: ["/admin/demo/round2?unit=1", "ADMIN"], r2b: ["/admin/demo/round2?unit=2", "ADMIN"], r2c: ["/admin/demo/round2?unit=3", "ADMIN"], r2d: ["/admin/demo/round2?unit=4", "ADMIN"],
  admin: ["/admin", "ADMIN"], projector: ["/admin/round2/projector", "ADMIN"], projector1: ["/admin/projector", "ADMIN"], r2wait: ["/round2", "R2-01"],
};
const browser = await chromium.launch(), ctxs = new Map();
for (const name of names.length ? names : Object.keys(PAGES)) {
  const [path, who] = PAGES[name] ?? []; if (!path) { console.log("unknown page", name); continue; }
  let ctx = ctxs.get(who ?? "anon");
  if (!ctx) {
    ctx = await browser.newContext({ viewport: { width: W, height: H } }); ctxs.set(who ?? "anon", ctx);
    if (who) { const lp = await ctx.newPage(), admin = who === "ADMIN"; await lp.goto(origin + (admin ? "/organizer/login" : "/login"));
      if (!admin) await lp.getByLabel("Team ID").fill(who);
      await lp.getByLabel("Access code").fill(code); await lp.getByRole("button", { name: "Sign in", exact: true }).click(); await lp.waitForURL(/\/(play|admin|round2)/, { timeout: 90_000 }); await lp.close(); }
  }
  const page = await ctx.newPage(); await page.emulateMedia({ reducedMotion: flag("motion", "reduce") === "reduce" ? "reduce" : "no-preference" });
  await page.goto(origin + path, { waitUntil: "networkidle", timeout: 120_000 }).catch(() => {}); await page.waitForTimeout(Number(flag("wait", 1800)));
  await page.screenshot({ path: `${out}/${name}-${W}x${H}.png`, fullPage: full });
  console.log(`${name}: ${page.url().replace(origin, "")}`); await page.close();
}
await browser.close();
