# Cross-User Ownership Audit & Fix — Design

**Goal:** Close every place where a create/update action trusts a client-supplied foreign-key ID (an account, category, subcategory, budget period, catalog item, or savings goal) without verifying it actually belongs to the signed-in user — a real, exploitable class of cross-user data-integrity and disclosure bug found during a full systematic sweep, not a hypothetical one.

**Context:** Triggered by a user question about onboarding; a spot-check of `createTransactionAction` found `prisma.account.findUniqueOrThrow({ where: { id: accountId } })` with no `userId` check, meaning any signed-in user who obtains another user's `accountId` could create a transaction against that account (and `computeAccountBalance` has no `userId` filter either, so it would silently include the forged row). A full sweep against every foreign-key relation in the Prisma schema found the identical pattern repeated across accounts, categories, subcategories, budget periods, catalog items, and one savings-goal reference. The correct pattern already exists and is used correctly in a few places in this codebase (`receipts.ts`'s `assertOwnedReceipt`, `year-plan.ts`'s `assertOwnedPlan`, `reconciliation.actions.ts`'s inline `findFirst({ where: { id, userId } })`) — this closes the gap everywhere else, following that exact existing convention rather than inventing a new one.

---

## 1. New ownership-check helpers

Four small helpers, each placed alongside the model's existing CRUD functions (matching where `assertOwnedPlan`/`assertOwnedList`/`assertOwnedReceipt` already live):

- **`assertOwnedAccount(prisma, userId, accountId)`** → `src/lib/accounts.ts`. Returns the account row or `null`.
- **`assertOwnedCategory(prisma, userId, categoryId)`** and **`assertOwnedSubcategory(prisma, userId, subcategoryId, categoryId)`** → `src/lib/categories.ts`. The subcategory check also verifies it belongs to the given parent category (when both are supplied), matching the schema's own nesting.
- **`assertOwnedBudgetPeriod(prisma, userId, budgetPeriodId)`** → `src/lib/budget-period.ts`.
- **`assertOwnedCatalogItem(prisma, userId, catalogItemId)`** → `src/lib/shopping-catalog.ts`.

Each is a thin `findFirst({ where: { id, userId } })` (or the two-field version for subcategory) — no new architecture, just the existing pattern extended to four more model types.

## 2. Fix sites, grouped by helper

**Account ownership** — 16 call sites across 9 files: `transaction.actions.ts` (create + transfer, both accounts), `credit-card.actions.ts` (create, update, make-payment), `installment-purchase.actions.ts` (create, pay-term), `loan.actions.ts` (make-payment), `payable.actions.ts` (create, update), `recurring-payable.actions.ts` (create, update), `recurring.actions.ts` (create, update), `calendar.actions.ts` (mark-reminder-paid), `receipt.actions.ts` (confirm-receipt). Each currently does an unscoped `findUniqueOrThrow`/`findFirst` by `id` alone (used to read the account's currency for minor-unit conversion) — replaced with `assertOwnedAccount`, returning `{ ok: false, error: "Account not found" }` when it comes back null.

**Category/subcategory ownership** — the same ~14 sites above that also accept an optional `categoryId`/`subcategoryId`, plus `budget.actions.ts` (create allocation), `category.actions.ts` (create subcategory — the parent `categoryId`), `shopping-catalog.actions.ts` (create/update catalog item), `shopping-list.actions.ts` (create list's `budgetCategoryId`, add/update item's `categoryId`), `receipt.actions.ts` (add/update line's `categoryId`). Checked only when the field is actually provided (they're all optional).

**Budget period ownership** — `budget.actions.ts`'s create-allocation action, whose `budgetAllocations.ts::createAllocation` currently does the same unscoped `findUniqueOrThrow` on `BudgetPeriod`.

**Catalog item ownership** — `shopping-catalog.actions.ts`'s record-price action (`recordPrice`'s `catalogItemId` parameter isn't verified), `shopping-list.actions.ts`'s add/update item (`catalogItemId`), `receipt.actions.ts`'s add/update line (`catalogItemId`, only when explicitly supplied via the dropdown rather than resolved through the alias system).

**Savings-goal ownership (one-off)** — `year-plan.ts`'s `createYearPlan`/`updateYearPlan` write `vacationReserveGoalId` straight from input with no check; fixed with an inline `savingsGoal.findFirst({ where: { id, userId } })` (SavingsGoal already carries its own `userId`, no need for a shared helper here). Not reachable through the UI today (no picker exists yet, per that file's own comment), but the server-side gap is real and cheap to close.

**Minor: cross-plan phase reference** — `year-plan.ts`'s `addIncomeForecast` accepts a `phaseId` without checking it belongs to the *same* `yearPlanId` being forecast against (only the plan itself is ownership-checked). Fixed by verifying the phase's `yearPlanId` matches.

## 3. What's explicitly *not* changed
- `computeAccountBalance` itself stays as-is — once writes are gated, an account's own transactions are correctly still summed regardless of who originally triggered each one; the fix belongs at the write side, not the read side.
- Preferred-store fields (`preferredStoreId` on catalog items and list items) are already safe — they're resolved server-side from a name via `getOrCreateStore(prisma, userId, name)`, never a raw client-supplied ID.
- `quick-capture/execute.ts` is already safe by construction — it resolves accounts/categories against the current user's own candidate list via the alias system, never accepts a raw ID from outside.
- `Payable.recurringPayableId` and `InstallmentPayment.installmentPurchaseId` aren't set from any client-facing form — confirmed not exploitable, left alone.

## 4. Testing
Every fixed action gets a new test asserting it rejects a foreign-key id that exists but belongs to a different user (`{ ok: false, error: "... not found" }`), alongside the existing happy-path tests — following the same test shape already used for `assertOwnedReceipt`/`assertOwnedList`'s existing "not found for another user" cases. No schema or route changes; existing tests continue to pass unmodified except where a test's mocked Prisma fixture needs a fake account/category to now resolve to the *right* user for its happy-path case to keep working.
