import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const manifestPath = join(process.cwd(), "test-results/insider-main/fragments.json");
export type PrintCard = { teamId: string; station: string; fragment: string };
export function printedPairs(): { A: PrintCard[]; B: PrintCard[] } { return JSON.parse(readFileSync(manifestPath, "utf8")); }
export async function insiderLogin(page: Page, id: string) {
  await page.goto(id === "admin" ? "/organizer/login" : "/login");
  if (id !== "admin") await page.getByLabel("Team ID", { exact: true }).fill(id);
  await page.getByLabel("Access code", { exact: true }).fill(id === "admin" ? process.env.GHOST_E2E_ADMIN_CODE! : process.env.GHOST_E2E_TEAM_CODE!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: id === "admin" ? "Event operations" : "Investigation dashboard", exact: true })).toBeVisible();
}
export async function readCards(page: Page): Promise<PrintCard[]> {
  await expect(page.getByRole("status").filter({ hasText: /cards prepared on/ })).toBeVisible();
  return page.locator(".fragment-card").evaluateAll(cards => cards.map(card => ({ teamId: card.getAttribute("data-team-id")!, station: card.getAttribute("data-station")!, fragment: card.querySelector("code")!.textContent! })));
}
