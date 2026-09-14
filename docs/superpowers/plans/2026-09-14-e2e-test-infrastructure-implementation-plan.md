# E2E Test Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Playwright with four real-browser smoke tests (login, add a transaction, Quick Capture, shopping list), reusing the existing demo user and its "safe to re-run" seed script for isolation.

**Architecture:** `@playwright/test` config with a `globalSetup` that reseeds the demo user via the existing `npm run db:seed-demo` script, a "setup project" that logs in once and saves a reusable session, and four spec files that each assert on what they themselves just created.

**Tech Stack:** `@playwright/test`, the project's existing Next.js dev server, the existing demo-user seed script.

**Spec:** `docs/superpowers/specs/2026-09-14-e2e-test-infrastructure-design.md`

---

### Task 1: Install Playwright and scaffold the config

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `playwright.config.ts`

- [ ] **Step 1: Install the package**

Run: `npm install -D @playwright/test`
Expected: `@playwright/test` added to `devDependencies` in `package.json` and `package-lock.json`

- [ ] **Step 2: Install browser binaries**

Run: `npx playwright install chromium`
Expected: downloads and installs the Chromium build Playwright drives (one-time per machine; only Chromium is needed since the config below only defines one project)

- [ ] **Step 3: Add the npm scripts**

In `package.json`, change:

```json
  "scripts": {
    "dev": "next dev --webpack",
    "build": "next build --webpack",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
```

to:

```json
  "scripts": {
    "dev": "next dev --webpack",
    "build": "next build --webpack",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
```

- [ ] **Step 4: Add the `.gitignore` entries**

In `.gitignore`, change:

```
# brainstorming companion scratch files
.superpowers/
.playwright-mcp/
```

to:

```
# brainstorming companion scratch files
.superpowers/
.playwright-mcp/

# playwright (e2e)
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
/e2e/.auth/
```

- [ ] **Step 5: Create the Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Tests share one real demo account/database (see e2e/global-setup.ts)
  // — running them in parallel would race on the same rows.
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore playwright.config.ts
git commit -m "chore(e2e): install Playwright and scaffold its config

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Global setup — reset the demo user's data

**Files:**
- Create: `e2e/global-setup.ts`

Reuses the existing "safe to re-run" seed script (`scripts/seed-demo-data.mjs` — wipes and reseeds the demo user's financial rows every time) so every full test run starts from the same known baseline, without writing new seeding logic.

- [ ] **Step 1: Create the file**

Create `e2e/global-setup.ts`:

```ts
import { execSync } from "node:child_process";

// Runs once before the whole Playwright run. Reuses the existing
// "safe to re-run" demo-data seed script rather than writing new
// seeding logic — see scripts/seed-demo-data.mjs's own header comment.
export default function globalSetup() {
  execSync("npm run db:seed-demo", { stdio: "inherit" });
}
```

- [ ] **Step 2: Verify the command it wraps works standalone**

Run: `npm run db:seed-demo`
Expected: the seed script's own console output, ending without an error (it deletes then recreates the demo user's financial rows). Playwright compiles and runs `global-setup.ts` itself via its own bundler when the suite executes (confirmed in Task 7's full run) — this step only confirms the underlying command the file wraps is itself working, without adding a standalone TypeScript-execution devDependency just to test-run one file.

- [ ] **Step 3: Commit**

```bash
git add e2e/global-setup.ts
git commit -m "feat(e2e): reset the demo user's data via the existing seed script before each run

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Auth setup — log in once, reuse the session

**Files:**
- Create: `e2e/auth.setup.ts`

This is also the login smoke test itself — if it fails, every other spec fails too (the correct signal), so no separate redundant "can log in" test is needed.

- [ ] **Step 1: Create the file**

Create `e2e/auth.setup.ts`:

```ts
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
```

- [ ] **Step 2: Run it in isolation**

Run: `npx playwright test --project=setup`
Expected: 1 passed, and `e2e/.auth/user.json` now exists on disk

- [ ] **Step 3: Commit**

```bash
git add e2e/auth.setup.ts
git commit -m "feat(e2e): add the login setup project, shared as a saved session

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Smoke test — add a transaction

**Files:**
- Create: `e2e/add-transaction.spec.ts`

Uses the nav's "Add transaction" button (available globally, in the sidebar — see `src/components/transactions/add-transaction-button.tsx`), scoping locators to the open dialog since the dialog's submit button shares the exact same accessible name ("Add transaction") as the button that opens it.

- [ ] **Step 1: Create the file**

Create `e2e/add-transaction.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("adding a transaction shows it in the transactions list", async ({ page }) => {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Add transaction" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill("123.45");
  await dialog.getByLabel("Description").fill("E2E test expense");
  await dialog.getByRole("button", { name: "Add transaction" }).click();

  await expect(page.getByText("E2E test expense")).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/add-transaction.spec.ts`
Expected: 1 passed (2 with the `setup` project's own test also running as a dependency)

- [ ] **Step 3: Commit**

```bash
git add e2e/add-transaction.spec.ts
git commit -m "test(e2e): add the add-transaction smoke test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Smoke test — Quick Capture

**Files:**
- Create: `e2e/quick-capture.spec.ts`

Types a command (rather than using the microphone — Quick Capture's text input and voice dictation both feed the same parser, so typing exercises the same pipeline without needing browser microphone permissions), parses it, confirms it, and follows the panel's own "View" link to confirm the resulting transaction is really there. `deterministic-parser.ts`'s default expense clause parser sets the transaction's description to the text between "for" and "using" — for "Paid 180 for food using cash" that's exactly `"food"`.

- [ ] **Step 1: Create the file**

Create `e2e/quick-capture.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("a typed command can be parsed and confirmed into a real transaction", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Quick Capture" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Paid 180 for food using cash").fill("Paid 180 for food using cash");
  await dialog.getByRole("button", { name: "Parse" }).click();
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog.getByText("Added")).toBeVisible();

  await dialog.getByRole("button", { name: "View" }).click();
  await expect(page.getByText("food", { exact: true })).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/quick-capture.spec.ts`
Expected: 1 passed (2 with `setup`)

- [ ] **Step 3: Commit**

```bash
git add e2e/quick-capture.spec.ts
git commit -m "test(e2e): add the Quick Capture smoke test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Smoke test — shopping list

**Files:**
- Create: `e2e/shopping-list.spec.ts`

The demo seed script doesn't create a `ShoppingList` row, so the Shopping page's Current List tab always starts on its "no current list yet" state — this test creates one via the "New list" dialog first, then adds an item to it, matching what a real first-time user does.

- [ ] **Step 1: Create the file**

Create `e2e/shopping-list.spec.ts`:

```ts
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

  await expect(page.getByText("E2E Test Bananas")).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/shopping-list.spec.ts`
Expected: 1 passed (2 with `setup`)

- [ ] **Step 3: Commit**

```bash
git add e2e/shopping-list.spec.ts
git commit -m "test(e2e): add the shopping-list smoke test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification sweep

**Files:** none — verification only.

- [ ] **Step 1: Full e2e suite**

Run: `npx playwright test`
Expected: all specs pass (`setup` + the 4 smoke tests)

- [ ] **Step 2: Existing Vitest suite still passes**

Run: `npx vitest run`
Expected: every existing test file still passes — nothing in this plan touched application source

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Lint**

Run: `npx eslint src e2e`
Expected: no new errors (the 4 pre-existing unrelated warnings in `src` are fine)

- [ ] **Step 5: Production build**

Run: `npx next build`
Expected: succeeds — confirms the new devDependency and config don't interfere with the app build

- [ ] **Step 6: No commit for this task — verification only.**
