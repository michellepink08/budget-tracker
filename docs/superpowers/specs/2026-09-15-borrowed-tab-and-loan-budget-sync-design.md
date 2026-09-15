# "Borrowed" Tab + Loan/Bills Budget Sync — Design

> Supersedes `2026-09-15-loans-bills-budget-sync-design.md` — same underlying subcategory-linking and
> auto-materialization mechanism, but restructured around Michelle's actual request: unify loan creation
> into the same "Add" entry point as transactions/transfers, instead of a separate page-only form. The
> "Loaned" (money/goods lent to *other people*) idea is explicitly a separate, later project — not built
> here, just designed around so it slots in as a future 4th tab without rework.

## Problem

Two related gaps in one place:

1. Adding a loan only happens from a page of its own (Loans & Cards), disconnected from the main "Add"
   button used for everything else. Michelle wants one Add flow: **Transaction, Transfer, Borrowed** (and
   later, **Loaned**) as tabs/modes of the same dialog.
2. Even the existing loan tools don't talk to the Budget: `Loan` has no category link at all, and recording
   a Loan Payment through the *regular* Transaction tab does nothing to the loan's `remainingBalance` — only
   the dedicated "Make payment" button on the Loans page does that (`makeLoanPayment`, which most people
   won't find or remember to use instead of just adding a transaction).

## What changes

### 1. `Loan` gets a `subcategoryId` (same as the superseded spec)

```prisma
model Loan {
  ...
  subcategoryId String?
  subcategory    Subcategory? @relation(fields: [subcategoryId], references: [id])
  ...
}
```

A new `resolveOrCreateLoanSubcategory(prisma, userId, rawName)`:
1. Finds (or creates, `type: "DEBT_PAYMENT"`) the user's "Loan" category.
2. Finds a subcategory under it matching the typed text (case-insensitive exact match).
3. Creates one if none matches.

This is what both the new "Borrowed" tab and the existing Loans-page form use for their category field.

### 2. The Add dialog gets a "Borrowed" tab

`TransactionForm`'s existing `Transaction` / `Transfer` toggle becomes `Transaction` / `Transfer` /
`Borrowed`. Selecting **Borrowed** swaps in the loan-creation fields (name, principal, interest rate,
monthly payment, start date, due day, and the free-text Loan-category field from §1) and submits via
`createLoanAction` instead of `createTransactionAction`. This is the same field set the Loans page's own
"Add Loan" dialog already has — both surfaces call the same action; no duplicated form logic.

The Loans & Cards page keeps its own "Add Loan" button too (context matters — adding a loan while already
looking at your loans is natural), it just now also collects the category field.

**Explicitly not covered by "Borrowed":** purchasing something on a credit card. That's already handled
correctly today — a regular Expense transaction on a credit-card account already reduces that card's
available balance through the account-balance model, no special path needed. "Borrowed" is specifically
for *new debt* (a new loan) — not every way of spending against credit.

### 3. `remainingBalance` becomes a derived value, not a mutated one

Naively subtracting from a stored `remainingBalance` every time a matching transaction is saved isn't
safe — editing or deleting that transaction later wouldn't undo the subtraction, and double-categorizing
would double-count. The rest of this app avoids exactly this class of bug by deriving balances from
transactions (`computeAccountBalance`) rather than mutating a stored number — loans adopt the same pattern:

- `Loan.remainingBalance` is renamed to `Loan.openingBalance` (mirrors `Account.openingBalance` exactly) —
  what was owed at the moment the loan started being tracked in the app.
- A new `computeLoanRemainingBalance(prisma, loan)`:
  ```
  remaining = loan.subcategoryId
    ? max(0, loan.openingBalance + sum of every transaction with that subcategoryId)
    : loan.openingBalance   // no subcategory linked yet — nothing to derive from, unchanged
  ```
  (Transaction amounts are already negative for money going out, so summing them and adding — not
  subtracting — is correct, same convention `computeAccountBalance` already uses.)
- Every place that currently displays `loan.remainingBalance` directly (`loan-list.tsx` on the Loans page,
  `loan-summary-table.tsx` on the Ledger's Loans tab) switches to calling `computeLoanRemainingBalance`
  instead — each page computes it per loan when building its view.
- `makeLoanPayment` (the Loans page's own "Make payment" button) stops mutating any stored balance — it
  just creates the transaction, now with the loan's own `subcategoryId` attached, and the balance updates
  itself the next time it's read, exactly like a regular account.
- A `Loan Payment` (or any) transaction added through the plain **Transaction** tab, categorized to that
  loan's own subcategory, now reduces its balance too — no dedicated button required, and editing or
  deleting that transaction later keeps the balance correct automatically.

A loan with no `subcategoryId` set (shouldn't happen for new loans once §2 ships, but covers loans created
before this feature) behaves exactly as today — `openingBalance` is shown as-is, nothing derived.

### 4. Auto-materializing Budget allocations every cutoff (unchanged from the superseded spec)

`resolveBudgetPeriodForDate`, right after creating a **new** period, also creates a `BudgetAllocation` for:
- every active `Loan` with a `subcategoryId`, `plannedAmount = monthlyPayment`
- every active `RecurringPayable` with a `categoryId`, `plannedAmount = amount` (whole-category)

Silently skipped if it would violate the either/or rule. Every auto-created row is independently editable
afterward, same as any other allocation.

### 5. One-time backfill into the current cutoff (unchanged)

A one-off script applies the same logic to Michelle's real account's currently-active `BudgetPeriod`, run
once at deploy time, so existing loans/bills show up immediately.

## Deferred to the separate "Loaned" project

- A "Loaned" tab for money or goods lent to *other people* (the reverse of a loan) — its own ledger, its
  own page, its own data model. Not started here. The tab list (`Transaction`, `Transfer`, `Borrowed`) is
  built so adding a 4th tab later is a small, additive change, not a rework.
