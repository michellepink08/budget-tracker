import { test, expect } from "@playwright/test";

test("a typed command can be parsed and confirmed into a real transaction", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Quick Capture" }).click();

  const dialog = page.getByRole("dialog");
  // "cash" (the placeholder's own example account) doesn't resolve for
  // the demo user — its seeded accounts are named things like "Everyday
  // Checking" — so this uses a real one to avoid a clarification prompt
  // that would hide the Confirm button entirely.
  await dialog
    .getByPlaceholder("Paid 180 for food using cash")
    .fill("Paid 180 for food using Everyday Checking");
  await dialog.getByRole("button", { name: "Parse" }).click();
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog.getByText("Added")).toBeVisible();

  await dialog.getByRole("button", { name: "View" }).click();
  await expect(page.getByText("food", { exact: true })).toBeVisible();
});
