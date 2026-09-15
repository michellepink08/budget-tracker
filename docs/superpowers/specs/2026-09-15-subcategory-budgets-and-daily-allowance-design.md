# Subcategory Budgets + Daily Allowance — Design

## Problem

The existing Budget page (`BudgetAllocation`) only budgets at the whole-category level (e.g. all of
"Home & Groceries" at once). Michelle wants to budget individual subcategories instead — e.g. ₱15,000/month
specifically for "Market / Grocery / Food" — see the planned vs. spent vs. remaining for that one
subcategory, edit it whenever her numbers change, and for a subcategory she's watching closely (like Food),
see a per-day spending allowance on the Dashboard that automatically absorbs whatever she didn't spend the
day before.

This is the first of 5 features from her original request (subcategory budgets, daily allowance, overspend
warnings, "can I afford this?", an AI advisor) — the other 4 are separate specs, built on top of this one.

## Data model

Add a nullable `subcategoryId` and a `showDailyAllowance` flag to `BudgetAllocation`:

```prisma
model BudgetAllocation {
  id             String   @id @default(cuid())
  userId         String
  budgetPeriodId String
  categoryId     String
  subcategoryId  String?
  plannedAmount  Int
  rolloverMode   String
  rolloverAmount Int      @default(0)
  showDailyAllowance Boolean @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user         User         @relation(fields: [userId], references: [id])
  budgetPeriod BudgetPeriod @relation(fields: [budgetPeriodId], references: [id])
  category     Category     @relation(fields: [categoryId], references: [id])
  subcategory  Subcategory? @relation(fields: [subcategoryId], references: [id])

  @@unique([budgetPeriodId, categoryId, subcategoryId])
}
```

`subcategoryId: null` means "this row budgets the whole category" (today's existing behavior, unchanged).
A non-null `subcategoryId` means "this row budgets just that one subcategory."

**Either/or per category, per cutoff:** a category can have exactly one whole-category allocation, *or* any
number of subcategory-level allocations, but never both in the same cutoff — so "remaining" never has two
overlapping numbers to reconcile. Enforced in `createAllocation`: creating a subcategory-level row is
rejected if a whole-category row already exists for that category in that period, and vice versa.

## Computing "actual" and "remaining" per subcategory

`computeCategoryActual` already sums transactions by `categoryId` alone (ignoring `subcategoryId`). A new
`computeSubcategoryActual` sums transactions matching `budgetPeriodId` + `subcategoryId` directly — a
transaction's own `subcategoryId` already implies its category, so no extra category filter is needed.
`listAllocationsWithActuals` picks whichever function fits each row's `subcategoryId`.

## The allocation form

`AllocationFormDialog` gets a second, dependent dropdown: pick a category first, then either "Whole
category" or one of that category's own subcategories — populated from the categories/subcategories the
Budget page already loads (`listCategories` includes subcategories). Options offered exclude whatever's
already allocated for that category this cutoff (a subcategory already budgeted individually disappears
from the list; if the whole category is already budgeted, that category doesn't offer subcategory options
at all, and vice versa).

A new checkbox, **"Show daily allowance on Dashboard,"** sits next to Rollover — this is what feeds Feature
2.

## Daily allowance (Dashboard)

For every `BudgetAllocation` in the **current** cutoff with `showDailyAllowance: true`:

```
daysLeft = (periodEnd - today, inclusive) in days, minimum 1
dailyAllowance = remaining / daysLeft
```

Because `remaining` is `effectivePlanned - actual` as of *right now*, this naturally does what Michelle
asked for: skip a day of spending and tomorrow's `remaining` (and therefore every day's allowance through
the end of the cutoff) is larger; overspend today and it's smaller — no separate "daily budget" table or
day-by-day bookkeeping needed, it's recomputed fresh from the same numbers the Budget page already shows.

A new Dashboard card, **"Daily allowance,"** lists each flagged subcategory/category by name with today's
figure, formatted the same way remaining is (red when negative). Nothing here is a warning or a hard
stop — this spec's job is only to show the number.

## Out of scope (this spec — later specs in this project)

- Overspend warnings/toasts (Feature 3).
- "Can I afford this?" queries (Feature 4).
- Any AI advisor (Feature 5).
- Reworking Year Plan itself — untouched by this spec.
