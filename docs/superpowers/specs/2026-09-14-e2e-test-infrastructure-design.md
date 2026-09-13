# E2E Test Infrastructure — Design

**Goal:** Stand up Playwright as the project's first end-to-end test layer, proving the infrastructure works with a handful of real smoke flows through a real browser — separate from Vitest's existing unit/logic coverage.

**Context:** Today, `npm test` (Vitest) covers pure functions and mocked-Prisma library code exhaustively, but nothing exercises an actual page render, a real login, or a real click-through. The project already has a demo account (`demo@example.com`) and a "safe to re-run" seeding script (`scripts/seed-demo-data.mjs` — wipes and reseeds that one user's financial rows every time it runs), which becomes the test-isolation primitive here instead of provisioning anything new.

---

## 1. Project setup

- New devDependency: `@playwright/test`.
- New directory: `e2e/` at the repo root (separate from Vitest's colocated `*.test.ts` files — a different test runner, a different kind of test).
- New config: `playwright.config.ts` — `testDir: "./e2e"`, a `webServer` block that runs `npm run dev` against `http://localhost:3000` (`reuseExistingServer: !process.env.CI`, so a dev server you already have open locally is reused rather than restarted), and `fullyParallel: false` (tests share one real demo account/database — parallel runs would race on the same rows).
- New scripts in `package.json`: `"test:e2e": "playwright test"` and `"test:e2e:ui": "playwright test --ui"` (Playwright's interactive mode, for local debugging).
- One-time local setup (documented in the plan, not automated): `npx playwright install` to download browser binaries.
- `.gitignore` gains `/test-results/`, `/playwright-report/`, `/blob-report/`, `/playwright/.cache/`, and `e2e/.auth/` (the saved login session — see below).

## 2. State reset and auth

- `playwright.config.ts`'s `globalSetup` points at `e2e/global-setup.ts`, which shells out to `npm run db:seed-demo` once before the whole run — reusing the existing idempotent script rather than writing new seeding logic.
- A Playwright **setup project** (`e2e/auth.setup.ts`, matched via `testMatch: /.*\.setup\.ts/`) logs in through the real `/login` form as `demo@example.com` / `demopassword123`, waits for the redirect to `/dashboard`, and saves the session with `page.context().storageState({ path: "e2e/.auth/user.json" })`.
- The main test project declares `dependencies: ["setup"]` and `use: { storageState: "e2e/.auth/user.json" }`, so every smoke test starts already authenticated — no repeated login steps cluttering each spec file.
- This login step **is** the login smoke test — if it fails, every other test fails too, which is the correct, informative signal (no separate redundant "can log in" test needed).

## 3. The four smoke flows

Each spec file asserts on **what it itself just created**, not on fixed totals — since `globalSetup` resets state once per whole run (not per test), asserting on a fixed dashboard balance would make tests order-dependent and fragile. Asserting "the thing I just added is now visible" avoids that without needing a reseed before every single test.

1. **`e2e/auth.setup.ts`** — login (described above).
2. **`e2e/add-transaction.spec.ts`** — opens the nav's "Add transaction" dialog (available globally, not page-specific), fills amount/date/account/category/description, submits, and asserts the new transaction's description appears in the transactions list.
3. **`e2e/quick-capture.spec.ts`** — opens the "Quick Capture" panel, types a command ("Paid 180 for food using cash"), waits for the draft card, clicks Confirm, and asserts the transactions list picks up the new entry.
4. **`e2e/shopping-list.spec.ts`** — on the Shopping page's Current List tab, adds an item via the "Add item" dialog, and asserts it appears in the current list.

Exact selectors (label text, button names, field ids) get pinned down against the real components when the implementation plan is written — this section fixes *which* flows and *why*, not the literal Playwright calls.

## 4. Non-goals

- No GitHub Actions / CI workflow — the project has no CI at all today (confirmed), and wiring one up (secrets, a CI-safe database) is a separate, larger decision than this pass. `npm run test:e2e` stays a local/manual command for now.
- No broader per-page coverage — just these four flows. More pages get their own e2e tests incrementally, in later work, once this infrastructure has proven itself.
- No dedicated e2e-only database — reuses the existing demo user and the existing Neon `DATABASE_URL`, reset via the existing seed script, per the earlier decision to avoid provisioning new infrastructure.

## 5. Testing the testing

This *is* the test layer, so there's no meta test suite for it. Verification is: `npm run test:e2e` runs all four specs against a locally-started dev server and passes; `npm test` (Vitest) and `npx tsc --noEmit` continue to pass unaffected, since nothing here touches existing source files.
