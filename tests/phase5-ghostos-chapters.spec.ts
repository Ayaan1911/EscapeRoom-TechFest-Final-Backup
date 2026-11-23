import { expect, test, type Page } from "@playwright/test";

// GHOST//OS chapter tools in Demo Mode (no team state): Inbox compare/links, Insider link board, Containment systems map, Verdict board + case file.
// Run via scripts/phase5-e2e.mjs.
const code = () => process.env.GHOST_E2E_TEAM_CODE!;
async function organizer(page: Page) {
  await page.goto("/organizer/login"); await page.getByLabel("Access code").fill(code()); await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page.getByRole("heading", { name: "Event operations" })).toBeVisible();
}
const win = (page: Page, id: string) => page.locator(`[data-window="${id}"]`);
const dock = (page: Page, id: string) => page.locator(`.os-dock-btn[data-app="${id}"]`);
const open = async (page: Page, chapter: string, heading: string, withDock = true) => { await page.goto(`/admin/demo/round1/${chapter}`); await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible(); if (withDock) await expect(page.locator(".os-dock")).toBeVisible(); /* dock mounts after hydration */ else await page.waitForLoadState("networkidle"); };
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); await page.setViewportSize({ width: 1366, height: 768 }); await organizer(page); });

test("Inbox: mailbox + reader by default; compare and link tools show plain fields, never a verdict", async ({ page }) => {
  await open(page, "inbox", "The Inbox");
  await expect(win(page, "records")).toHaveCount(0); await expect(page.getByLabel("Recovered emails")).toBeVisible(); await expect(page.getByLabel("Selected email")).toBeVisible();
  await page.getByRole("button", { name: "Compare with another message" }).click(); const compare = win(page, "compare"); await expect(compare).toBeVisible();
  await compare.getByLabel("Message B").selectOption({ index: 2 });
  const rows = await compare.locator("tbody tr").count(); expect(rows).toBeGreaterThanOrEqual(8); // display name, address, domain, sent, subject, links, attachments + the headers
  await expect(compare).not.toContainText(/suspicious|malicious|phishing|legitimate/i); // a tool, not a verdict
  await page.getByRole("button", { name: "Reset window layout" }).click();
  await page.getByRole("button", { name: "Inspect links" }).click(); const links = win(page, "links"); await expect(links.locator("tbody tr").first()).toBeVisible();
  await expect(links).toContainText("https"); await expect(links).not.toContainText(/suspicious|malicious|phishing/i);
  await links.getByRole("button").first().click(); // picking a message from the link table selects it in the reader
  await expect(page.getByLabel("Selected email")).toContainText("MAIL-");
});

test("Insider: link board counts open the dossier explorer filtered to that person and record type", async ({ page }) => {
  await open(page, "insider", "Insider");
  await expect(win(page, "dossier")).toHaveCount(0);
  const cell = page.getByRole("button", { name: /records?\. Open them\.$/ }).first(); await cell.click();
  const dossier = win(page, "dossier"); await expect(dossier).toBeVisible();
  await expect(page.getByText(/^\d+ of \d+ records$/)).toBeVisible();
  const shown = Number((await page.getByText(/^\d+ of \d+ records$/).innerText()).split(" ")[0]), total = Number((await page.getByText(/^\d+ of \d+ records$/).innerText()).split(" ")[2]);
  expect(shown).toBeGreaterThan(0); expect(shown).toBeLessThan(total); // the board applied a real filter (person + type)
  await expect(dossier.getByLabel("Evidence detail")).toBeVisible();
});

test("Containment: the systems map mirrors the team's own plan literally and never grades it", async ({ page }) => {
  await open(page, "containment", "Containment", false);
  const map = page.getByLabel("Systems map");
  await expect(map).toContainText("Nothing in your plan touches this system.");
  await expect(map).not.toContainText(/correct|wrong|right answer|well done|mistake|good choice|bad choice/i);
  // pick one urgent action; the identity provider node now lists it, in the option's own words
  const pick = (text: string) => page.locator(".k-choice").filter({ hasText: text }).getByRole("checkbox", { name: /Select immediate/ }).check();
  await pick("Revoke the affected replay session");
  await map.getByRole("button", { name: /Identity provider/ }).click();
  await expect(map.getByRole("status")).toContainText("Urgent: Replay session and derived tokens revoked");
  await expect(map.getByRole("button", { name: /Identity provider/ })).toContainText("1 change in your plan");
  // a decoy choice is mirrored just as literally and just as neutrally (no colour or text says it is wrong)
  await pick("Pause every business workload"); // a decoy choice is mirrored just as literally and just as neutrally
  await map.getByRole("button", { name: /Support and archive jobs/ }).click();
  await expect(map.getByRole("status")).toContainText("Urgent: Every support and archive job paused");
  await expect(map).not.toContainText(/correct|wrong|mistake|bad|danger/i);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); expect(overflow).toBeLessThanOrEqual(1);
});

test("Verdict: records live in the evidence board window; the case file is a window; filters work", async ({ page }) => {
  await open(page, "verdict", "Final Verdict");
  await expect(page.locator(".pg-rec")).toHaveCount(0); // no record wall on the desk
  await page.getByRole("navigation", { name: /Causal chain/ }).getByRole("button", { name: /Evidence map/ }).click();
  await page.getByRole("button", { name: "Open evidence board" }).click(); const board = win(page, "board"); await expect(board).toBeVisible();
  const all = await board.locator(".pg-rec").count(); expect(all).toBeGreaterThan(8);
  await board.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("Trail"); const trail = await board.locator(".pg-rec").count(); expect(trail).toBeGreaterThan(0); expect(trail).toBeLessThan(all);
  await board.getByLabel("Search records", { exact: true }).fill("no-such-record-xyz"); await expect(board.locator(".pg-rec")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset window layout" }).click();
  await dock(page, "casefile").click(); await expect(win(page, "casefile")).toBeVisible(); await expect(win(page, "casefile").locator("p").first()).toBeVisible();
});
