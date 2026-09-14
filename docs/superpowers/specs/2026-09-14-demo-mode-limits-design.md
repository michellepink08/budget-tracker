# Demo Mode: Auto-Reset and Limits — Design

**Goal:** Turn the existing, unrestricted shared demo account into a proper public demo: automatically fresh (no visitor has to remember to reset it), and safe to leave open to strangers (no one can lock out other visitors, corrupt the account's own settings, or let the shared dataset grow unbounded between resets).

**Context:** This codebase already has real demo infrastructure from earlier work: a "View Demo" button on the public landing page (`src/components/landing/view-demo-button.tsx`) calling `viewDemoAction()` (`src/actions/auth.actions.ts`), which signs a visitor straight into the shared `demo@example.com` account via `signIn("credentials", ...)` server-side. `seedDemoData()` (`src/lib/demo-seed.ts`) clears and reseeds that account's fictional accounts/categories/transactions, currently triggered only by a manual "Reset demo data" button in Settings (`resetDemoDataAction`, gated by comparing `user.email === DEMO_EMAIL`). Today the demo account is otherwise a completely normal, unrestricted account — any visitor can change its settings, delete its data, or grow it without bound, and nothing resets it automatically.

This design adds three things: an automatic reset triggered by visiting, a hard limit on how much the shared dataset can grow between resets, and a block on actions that would either permanently remove seeded data or reconfigure the account. It doesn't touch anything about how a *real* (non-demo) account behaves.

## 1. Automatic lazy reset

Add `demoResetAt DateTime?` to the `User` model (nullable — meaningless for every non-demo user). `viewDemoAction()` is changed to:

1. Look up the demo user's `demoResetAt`.
2. If it's `null` or older than **1 hour**, call `seedDemoData()` (which already fully clears and reseeds the account's financial rows) and stamp `demoResetAt = now()` on the `User` row, in that order.
3. Sign in as usual.

`resetDemoDataAction` (the existing manual Settings button) also stamps `demoResetAt = now()` after reseeding, so a manual reset restarts the 1-hour window — nobody has to wait out a stale timer right after clicking it.

This is a lazy check (no cron, no new infrastructure): the reset only actually happens the next time someone visits after the hour has elapsed, which matches how "Live during their visit, reset on next visit" was scoped.

## 2. Demo guards

Two small functions in a new `src/lib/demo-guard.ts`, following this codebase's existing inline-guard convention (e.g. `assertOwnedAccount`) rather than a wrapping/HOC pattern — each server action calls them explicitly, at the top, before doing anything else:

```ts
export type DemoGuardResult = { ok: false; error: string } | null;

// Blocks an action outright for the demo account. Used on every
// archive/delete action and every settings-changing action.
export async function assertNotDemo(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
): Promise<DemoGuardResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email === DEMO_EMAIL) {
    return { ok: false, error: "Not available in the shared demo — sign up for your own account to do this." };
  }
  return null;
}

// Caps how many rows a create action can add for the demo account.
// A no-op for every other user (the count query never even runs).
export async function assertUnderDemoCap(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  countCurrent: () => Promise<number>,
  cap: number,
): Promise<DemoGuardResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email !== DEMO_EMAIL) return null;
  const current = await countCurrent();
  if (current >= cap) {
    return { ok: false, error: `Demo limit reached (${cap} max) — sign up to add more.` };
  }
  return null;
}
```

Both are guard-only — they never look at *ownership* (that's already handled everywhere else); they only ever answer "is this the shared demo account, and if so, is this move allowed."

## 3. Where the guards go

**Cap check (`assertUnderDemoCap`, cap = 100 per resource type unless noted) — every top-level resource-creating action:**

| Action | File | Counts |
|---|---|---|
| `createAccountAction` | `account.actions.ts` | `Account` |
| `createCategoryAction`, `createSubcategoryAction` | `category.actions.ts` | `Category`, `Subcategory` |
| `createTransactionAction`, `createTransferAction` | `transaction.actions.ts` | `Transaction` |
| `createBudgetPeriodAction`, `createAllocationAction` | `budget.actions.ts` | `BudgetPeriod`, `BudgetAllocation` |
| `createRecurringRuleAction` | `recurring.actions.ts` | `RecurringRule` |
| `createPayableAction` | `payable.actions.ts` | `Payable` |
| `createRecurringPayableAction` | `recurring-payable.actions.ts` | `RecurringPayable` |
| `createLoanAction` | `loan.actions.ts` | `Loan` |
| `createCreditCardAction` | `credit-card.actions.ts` | `CreditCard` |
| `createInstallmentPurchaseAction` | `installment-purchase.actions.ts` | `InstallmentPurchase` |
| `createReminderAction` | `calendar.actions.ts` | `CustomReminder` |
| `createCatalogItemAction` | `shopping-catalog.actions.ts` | `ShoppingCatalogItem` |
| `createListAction`, `addItemAction` | `shopping-list.actions.ts` | `ShoppingList`, `ShoppingListItem` |
| `createDraftReceiptAction` | `receipt.actions.ts` | `Receipt` |
| `createYearPlanAction`, `addPhaseAction`, `addIncomeForecastAction` | `year-plan.actions.ts` | `YearPlan`, `YearPlanPhase`, `IncomeForecast` |
| `upsertSavingsGoalAction` | `savings-goal.actions.ts` | `SavingsGoal` — only when no goal exists yet for that account (an update to an existing goal never adds a row, so it's never capped) |

**Block (`assertNotDemo`) — every archive/delete action** (anything that permanently removes seeded or visitor-added data):

`archiveAccountAction`, `archiveCategoryAction`, `archiveSubcategoryAction`, `archiveLoanAction`, `archiveInstallmentPurchaseAction`, `archiveCatalogItemAction`, `deleteReminderAction`, `deleteTransactionAction`, `deleteItemAction`, `deleteListAction`, `deleteYearPlanAction`, `deletePhaseAction`, `deleteIncomeForecastAction`, `deleteLineAction` (receipt line), `removeReceiptImageAction`.

**Block (`assertNotDemo`) — settings actions:**

`updateThemeModeAction`, `updateReceiptAutoDeleteImagesAction` (`settings.actions.ts`) — the only two account-configuration actions that currently exist outside onboarding.

## Non-goals (explicitly out of scope)

- **"Confirm/pay" actions** (`markReminderPaidAction`, `markPayablePaidAction`, `makeCreditCardPaymentAction`, `makeLoanPaymentAction`, `payInstallmentTermAction`, `confirmRecurringOccurrenceAction`, `confirmRecurringPayableOccurrenceAction`, `confirmReceiptAction`, `confirmQuickCaptureDraftAction`) do create a `Transaction` row, but they convert an already-existing pending item (a reminder, payable, recurring rule, receipt, or quick-capture draft) rather than letting a visitor manufacture new ones from nothing — and every one of *those* source resources is itself capped above. Leaving these unguarded keeps the core "try posting a payment" demo experience working without meaningfully changing how fast the shared dataset can grow.
- **`undoQuickCaptureAction`** and **`undoAuditLogEntryAction`** are correction/undo features, not one-way destructive actions from the visitor's perspective — left unguarded.
- **Toggles** (`toggleSelectedAction`, `togglePurchasedAction`, `toggleRecurringRuleActiveAction`, `toggleRecurringPayableActiveAction`, `toggleLineExcludedAction`) are reversible, not destructive — left unguarded.
- **Password-reset actions** are not touched: a stranger can request a reset for `demo@example.com`, but the reset link only ever reaches the real inbox the developer controls, so it isn't actually exploitable by a visitor.
- Real (non-demo) accounts are entirely unaffected — every guard call is a no-op for them (one extra `findUnique` per call; see Testing).

## UI: demo-mode banner

A small persistent banner shown only when `session.user.email === DEMO_EMAIL` (checked once in the app's root layout, alongside the existing onboarding-redirect check that already reads `session.user` there): *"You're viewing the shared demo — changes reset periodically. [Sign up] to keep your own data."* No banner for any other account.

## Testing

- `src/lib/demo-guard.test.ts` (new): unit tests for both guards against a mocked Prisma client — demo account blocked/capped, any other account passes through untouched, cap boundary (at cap → blocked, one under → allowed).
- Each touched action file's existing test suite (only `transaction.actions.test.ts` currently exists per this codebase's convention of testing the *lib* layer, not the action layer, for most actions) gets the minimal check needed; the guard functions themselves carry the real test coverage, matching how `assertOwnedAccount` etc. were tested in the earlier ownership-audit work.
- Manual verification: sign in via "View Demo", confirm the banner appears, confirm an archive/settings action is blocked with the expected message, confirm hitting the cap on one resource (temporarily lowering it, or seeding near-cap data) is blocked, confirm a real account is completely unaffected by all of the above.
