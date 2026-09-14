import { test as setup } from "@playwright/test";

const authFile = "e2e/.auth/user.json";

setup("authenticate as the demo user", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demopassword123");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("/dashboard");
  await page.context().storageState({ path: authFile });
});
