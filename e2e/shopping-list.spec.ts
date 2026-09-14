import { test, expect } from "@playwright/test";

test("creating a list and adding an item shows it in the current list", async ({ page }) => {
  await page.goto("/shopping?tab=current");

  await page.getByRole("button", { name: "New list" }).click();
  const newListDialog = page.getByRole("dialog");
  await newListDialog.getByLabel("Name").fill("E2E Test List");
  await newListDialog.getByRole("button", { name: "Create" }).click();

  await page.getByRole("button", { name: "Add item" }).click();
  const addItemDialog = page.getByRole("dialog");
  await addItemDialog.getByLabel("Name (used if not picked from catalog)").fill("E2E Test Bananas");
  await addItemDialog.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("E2E Test Bananas").first()).toBeVisible();
});
