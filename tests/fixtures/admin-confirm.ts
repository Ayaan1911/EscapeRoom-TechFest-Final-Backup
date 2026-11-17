import { expect, type Page } from "@playwright/test";

/** Confirms the organizer safeguard dialog (start / stop / override / qualification record). Stop requires typing STOP. */
export async function confirmDialog(page: Page, typed?: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (typed) await dialog.getByLabel(/^Type /).fill(typed);
  await dialog.getByRole("button", { name: /^Confirm / }).click();
  await expect(dialog).toBeHidden();
}
