import { expect, type Page } from "@playwright/test";
import { confirmDialog } from "./admin-confirm";

/** Organizer: "Confirm Top 10 and Advance to Round 2" through the real UI. Resolves a tie at 10th place by ticking the first N tied teams (a manual organizer choice). */
export async function confirmTop10(admin: Page, reason: string) {
  const tie = admin.getByRole("group", { name: /Tie at 10th place/ });
  if (await tie.count()) {
    const need = Number((await tie.locator("legend").innerText()).match(/choose (\d+)/i)![1]), boxes = tie.getByRole("checkbox");
    for (let i = 0; i < need; i++) await boxes.nth(i).check();
  }
  await admin.getByLabel("Review reason", { exact: true }).fill(reason);
  await admin.getByLabel("I reviewed incomplete investigations, tie-break details and audited overrides.", { exact: true }).check();
  await admin.getByRole("button", { name: "Confirm Top 10 and Advance to Round 2", exact: true }).click();
  await expect(admin.getByRole("dialog")).toContainText("will be marked eligible for Round 2");
  await confirmDialog(admin);
}
