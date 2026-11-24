import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Journey F: every major route at the target desktop sizes and responsive fallbacks. No horizontal overflow, no console/page errors, no failed requests,
// system bar above the content, key heading visible. Screenshots go to SHOTS (default: test-results). Run via scripts/phase5-e2e.mjs.
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
const SHOTS = process.env.SHOTS ?? "test-results/ghostos-layout"; mkdirSync(SHOTS, { recursive: true });
const SIZES: [number, number, string][] = [[1920, 1080, "1920x1080"], [1440, 900, "1440x900"], [1366, 768, "1366x768"], [1280, 720, "1280x720"], [768, 1024, "tablet"], [390, 844, "phone"]];
type Route = { name: string; path: string; heading: RegExp | string; as: "public" | "team" | "admin" };
const ROUTES: Route[] = [
  { name: "landing", path: "/", heading: /A breach has a story/, as: "public" },
  { name: "login", path: "/login", heading: "Team login", as: "public" },
  { name: "organizer-login", path: "/organizer/login", heading: /Organizer|Access/i, as: "public" },
  { name: "dashboard", path: "/play", heading: "Investigation dashboard", as: "team" },
  { name: "round2-standby", path: "/round2", heading: "Stand by", as: "team" },
  { name: "admin", path: "/admin", heading: "Event operations", as: "admin" },
  { name: "admin-round2", path: "/admin/round2", heading: "Round 2 control room", as: "admin" },
  { name: "projector", path: "/admin/round2/projector", heading: /OPERATION GHOST_404|Find the insider|Round 1 complete|ghost is not finished|GHOST RETURNS|Round 2 running|PENS DOWN|Results/, as: "admin" },
  { name: "leaderboard", path: "/admin/leaderboard", heading: "Leaderboard", as: "admin" },
  { name: "demo-home", path: "/admin/demo", heading: /demonstration mode/, as: "admin" },
  { name: "print-index", path: "/admin/round2/print", heading: /print|jury|material/i, as: "admin" },
  { name: "demo-inbox", path: "/admin/demo/round1/inbox", heading: "The Inbox", as: "admin" },
  { name: "demo-trail", path: "/admin/demo/round1/trail", heading: "Trail", as: "admin" },
  { name: "demo-insider", path: "/admin/demo/round1/insider", heading: "Insider", as: "admin" },
  { name: "demo-containment", path: "/admin/demo/round1/containment", heading: "Containment", as: "admin" },
  { name: "demo-verdict", path: "/admin/demo/round1/verdict", heading: "Final Verdict", as: "admin" },
  { name: "r2-ch1", path: "/admin/demo/round2?unit=1", heading: "Alert at 2:14 AM", as: "admin" },
  { name: "r2-ch2", path: "/admin/demo/round2?unit=2", heading: "Kill Switch", as: "admin" },
  { name: "r2-ch3", path: "/admin/demo/round2?unit=3", heading: "Audit the AI", as: "admin" },
  { name: "r2-ch4", path: "/admin/demo/round2?unit=4", heading: "The Three Calls", as: "admin" },
];

async function signIn(page: Page, who: "team" | "admin") {
  if (who === "team") { await page.goto("/login"); await page.getByLabel("Team ID").fill("P5-01"); }
  else await page.goto("/organizer/login");
  await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  if (who === "team") await page.waitForURL(/\/play/); else await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible();
}

for (const who of ["public", "team", "admin"] as const) test(`layout, console and overflow: ${who} routes at 6 viewports`, async ({ browser }) => {
  test.setTimeout(600_000);
  const problems: string[] = [];
  for (const [w, h, tag] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" }), page = await ctx.newPage();
    let current = "";
    page.on("console", m => { if (m.type() === "error") problems.push(`[${tag}] ${current}: console error: ${m.text().slice(0, 160)}`); });
    page.on("pageerror", e => problems.push(`[${tag}] ${current}: page error: ${String(e).slice(0, 160)}`));
    page.on("requestfailed", r => { if (r.failure()?.errorText !== "net::ERR_ABORTED" && !/_rsc|favicon|\.map$/.test(r.url())) problems.push(`[${tag}] ${current}: request failed: ${r.url().slice(0, 100)}`); });
    if (who !== "public") await signIn(page, who);
    for (const r of ROUTES.filter(x => x.as === who)) {
      current = r.name;
      await page.goto(r.path); await page.waitForLoadState("networkidle");
      if (r.name === "landing") await page.waitForTimeout(1600); // let the 1.4 s boot reveal finish before measuring
      const head = typeof r.heading === "string" ? page.getByRole("heading", { name: r.heading, exact: true }).first() : page.getByRole("heading", { name: r.heading }).first();
      if (!(await head.isVisible().catch(() => false))) problems.push(`[${tag}] ${r.name}: heading ${String(r.heading)} not visible`);
      const m = await page.evaluate(() => { const bar = document.querySelector("header.os-bar")?.getBoundingClientRect(), main = document.querySelector("main")?.getBoundingClientRect(); return { over: document.documentElement.scrollWidth - window.innerWidth, barH: bar ? Math.round(bar.height) : 0, barBottom: bar ? bar.bottom : 0, mainTop: main ? main.top : 0 }; });
      if (m.over > 1) problems.push(`[${tag}] ${r.name}: horizontal overflow ${m.over}px`);
      if (r.name !== "projector" && m.barH > 0 && m.mainTop < m.barBottom - 2) problems.push(`[${tag}] ${r.name}: content starts under the system bar`);
      if (m.barH > 76) problems.push(`[${tag}] ${r.name}: system bar is ${m.barH}px tall`);
      await page.screenshot({ path: `${SHOTS}/${r.name}-${tag}.png` });
    }
    await ctx.close();
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
