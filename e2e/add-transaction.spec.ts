import { test, expect } from "@playwright/test";

test("adding a transaction shows it in the transactions list", async ({ page }) => {
  // The Transactions page renders TransactionForm inline (no dialog) —
  // this is a page-specific form, distinct from the nav's own
  // "Add transaction" modal available on every other page.
  await page.goto("/transactions");
  await page.getByLabel("Amount").fill("123.45");
  await page.getByLabel("Description").fill("E2E test expense");
  await page.getByRole("button", { name: "Add transaction" }).click();

  await expect(page.getByText("E2E test expense")).toBeVisible();
});
