# Loans & Bills → Budget Sync — Design

## Problem

The 6th thing Michelle asked for (a follow-up, not one of the original 5): adding a loan should feed
straight into the Budget page instead of being a second, disconnected place to track the same monthly
payment. Same for Bills (`RecurringPayable`), which already have an optional category but nothing ties
their amount into a real budget allocation. "Budget should show all the payables allocation."

## Current state

- `Loan` has **no category link at all** — `principal`, `monthlyPayment`, `remainingBalance`, etc., nothing
  connecting it to `Category`/`Subcategory`/`BudgetAllocation`.
- `RecurringPayable` already has an optional `categoryId` (whole-category only, no `subcategoryId`), but
  creating one never touches `BudgetAllocation` — the two systems just don't talk to each other today.
- Michelle's own spreadsheet (already mirrored into her real account's categories) organizes every
  individual loan as its **own subcategory** under one shared "Loan" category — e.g. Loan → Shopee Pay
  Later, Loan → GCredit, Loan → MariBank Loan.

## What changes

### 1. `Loan` gets a `subcategoryId`

```prisma
model Loan {
  ...
  subcategoryId String?
  subcategory    Subcategory? @relation(fields: [subcategoryId], references: [id])
  ...
}
```

The loan form gets a free-text field, same UX as the transaction form's category field: type the loan's
name (e.g. "Shopee Pay Later") and it resolves against the user's existing "Loan" category's subcategories,
or creates a new one. A new function, `resolveOrCreateLoanSubcategory`, handles this:

1. Find (or create, `type: "DEBT_PAYMENT"`) the user's "Loan" category.
2. Find a subcategory under it whose name matches (case-insensitive) the typed text.
3. If none matches, create one.

No alias-learning here (unlike `resolveOrCreateCategory`'s alias-based fuzzy matching for Quick Capture) —
exact case-insensitive name match is enough for a one-off form field typed once per loan.

### 2. `RecurringPayable` — no schema change

It already has `categoryId`. The only change is behavioral: once it has a category, its `amount` starts
feeding a `BudgetAllocation` the same way a loan's `monthlyPayment` does (see below). Bills stay
whole-category only (no subcategory field exists on `RecurringPayable` today, and adding one is out of
scope here).

### 3. Auto-materializing allocations at the start of every cutoff

`resolveBudgetPeriodForDate` is the one place a new `BudgetPeriod` gets created (lazily, the first time any
page needs "the period containing this date"). Right after creating a **new** period (never on an existing
one — this only ever runs once per period's lifetime), it now also:

- For every active (`archivedAt: null`) `Loan` with a `subcategoryId` set: creates a `BudgetAllocation` for
  that subcategory, `plannedAmount = monthlyPayment`, `rolloverMode: "NONE"`, `showDailyAllowance: false`.
- For every active (`active: true`) `RecurringPayable` with a `categoryId` set: creates a whole-category
  `BudgetAllocation` for that category, `plannedAmount = amount`, same rollover/daily-allowance defaults.
- **Silently skips** either one if it would violate the existing either/or rule (e.g. a whole-category
  allocation already covers that category some other way) — same conflict as a human hitting "Add
  allocation" twice, just resolved by skipping instead of erroring, since nothing here is user-initiated.

Every cutoff's auto-created row is a normal, independently editable `BudgetAllocation` afterward — editing
it (say, because a loan's payment briefly changed) never touches the `Loan`/`RecurringPayable` template, and
next cutoff's fresh row goes back to the template amount. Exactly how every other allocation already works.

### 4. One-time backfill into the currently active cutoff

Since the auto-create above only fires for periods created *after* this ships, a one-off script runs once
at deploy time (same pattern as the rollover/subcategory-budget features' manual verification scripts, but
this one actually needs to run against production data, not just be a throwaway test aid) that applies the
same logic to Michelle's real account's *currently active* `BudgetPeriod` — so her existing loans and bills
show up on the Budget page immediately, not starting next month.

## Out of scope

- A `subcategoryId` on `RecurringPayable`/`Payable` (bills stay whole-category).
- Retroactively backfilling *past, already-closed* cutoffs.
- Any UI for reviewing/undoing an auto-created allocation differently from a manually-created one — once
  created, it's just a `BudgetAllocation` like any other.
