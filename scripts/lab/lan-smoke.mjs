// Browser smoke test of a running lab server, from any PC that has this repo + Playwright (the server PC or a client).
//   node scripts/lab/lan-smoke.mjs --origin http://192.168.1.20:3000 --creds private\lab-credentials-XXXX.csv [--team LAB-01]
//   organizer code: env GHOST_LAB_ORG_CODE (never printed).  Read-only apart from creating login sessions; it does NOT start a round.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const origin = (arg("origin", "") || "").replace(/\/$/, "");
if (!origin) { console.error("--origin http://<server-ip>:<port> is required"); process.exit(2); }
const rows = readFileSync(arg("creds", ""), "utf8").trim().split(/\r?\n/).slice(1).map(l => [...l.matchAll(/"((?:[^"]|"")*)"|([^,]+)/g)].map(m => (m[1] ?? m[2]).replace(/""/g, '"')));
const [teamId, , , teamCode] = rows.find(r => r[0] === arg("team", rows[0][0])) ?? rows[0];
const orgCode = process.env.GHOST_LAB_ORG_CODE;

let failed = 0;
const lands = async (page, re) => { await page.waitForURL(re, { timeout: 5000 }).catch(() => {}); return re.test(page.url()); }; // redirects are streamed, so wait for the final URL
const check = (ok, msg) => { console.log(`  [${ok ? "PASS" : "FAIL"}] ${msg}`); if (!ok) failed++; };
const browser = await chromium.launch();
try {
  // ---- team
  const t = await (await browser.newContext()).newPage(), tc = t.context();
  await t.goto(`${origin}/login`);
  await t.getByLabel("Team ID").fill(teamId); await t.getByLabel("Access code").fill(teamCode);
  await t.getByRole("button", { name: "Sign in", exact: true }).click();
  await t.waitForURL(/\/play/, { timeout: 15_000 }).catch(() => {});
  check(/\/play/.test(t.url()), `team ${teamId} signs in over ${origin} and lands on /play`);
  const cookie = (await tc.cookies()).find(c => c.name === "ghost_team_session");
  check(!!cookie, "team session cookie was stored by the browser (a Secure cookie on plain http would be dropped)");
  check(cookie?.httpOnly === true && cookie?.sameSite === "Strict", `cookie is HttpOnly + SameSite=Strict (secure=${cookie?.secure})`);
  await t.goto(`${origin}/play/inbox`); await t.reload();
  check(/\/play\/inbox/.test(t.url()), "refresh keeps the team signed in");
  await t.goto(`${origin}/admin`); check(await lands(t, /organizer\/login/), "team session cannot open the organizer dashboard");
  await t.goto(`${origin}/admin/demo`); check(await lands(t, /organizer\/login/), "team session cannot open Demo Mode");
  const api = await t.request.get(`${origin}/api/admin/projector`); check(api.status() === 401, `team gets 401 from the organizer API (got ${api.status()})`);
  const forged = await t.request.post(`${origin}/api/game`, { headers: { origin: "http://evil.example" }, data: {} }); check([401, 403].includes(forged.status()), `cross-origin POST is refused (got ${forged.status()})`);

  // ---- organizer (separate browser context = separate cookies)
  if (orgCode) {
    const o = await (await browser.newContext()).newPage();
    await o.goto(`${origin}/organizer/login`); await o.getByLabel("Access code").fill(orgCode); await o.getByRole("button", { name: "Sign in", exact: true }).click();
    await o.getByRole("heading", { name: "Event operations" }).waitFor({ timeout: 15_000 }).catch(() => {});
    check(await o.getByRole("heading", { name: "Event operations" }).isVisible(), "organizer signs in and sees Event operations");
    await o.goto(`${origin}/admin/projector`); check(!/login/.test(o.url()), "organizer can open the projector");
    await o.goto(`${origin}/admin/demo`); check(/\/admin\/demo/.test(o.url()), "organizer can open Demo Mode");
    await o.goto(`${origin}/play`); check(await lands(o, /\/login/), "organizer session is not a team session");
  } else console.log("  [SKIP] organizer checks (set GHOST_LAB_ORG_CODE)");
} finally { await browser.close(); }
console.log(failed ? `\nResult: FAIL (${failed})` : "\nResult: PASS");
process.exit(failed ? 1 : 0);
