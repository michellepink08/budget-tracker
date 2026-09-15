# Overspend Warning — Design

## Problem

The second of Michelle's 5 requested features: whenever a transaction pushes a budgeted category or
subcategory's remaining below zero for the current cutoff, warn her right when she adds it — not a
standing dashboard banner, just an immediate heads-up at the moment it happens.

## Scope

- Triggers only on save (create or edit) of a regular transaction — not transfers (which never touch a
  category's actual) and not Quick Capture (a separate entry point, left for later if wanted).
- Triggers only when the transaction's own category/subcategory has a `BudgetAllocation` for the cutoff
  its `budgetPeriodId` falls into. No allocation set for that category/subcategory → no warning, since
  there's nothing to overspend against.
- Non-blocking: the transaction always saves. The warning is informational, shown alongside the existing
  success toast, never a confirmation dialog and never a reason to reject the save.

## Which allocation governs a transaction

The Add Transaction form only collects a free-text category name (resolved to a `categoryId`, no
subcategory) — but editing a transaction can also set a `subcategoryId` directly. So the check must handle
both shapes:

- If the transaction has a `subcategoryId`, look for a `BudgetAllocation` scoped to that exact subcategory.
- Otherwise, look for a whole-category `BudgetAllocation` (`subcategoryId: null`) for its `categoryId`.
- If neither exists, there's nothing budgeted for this line item — no warning, silently.

This mirrors the "either/or per category" rule from the subcategory-budgets feature: a transaction is
always governed by at most one allocation.

## What "overspending" means here

After the transaction is saved, recompute that one allocation's `remaining` (`effectivePlanned − actual`,
the same math the Budget page already shows). If `remaining < 0`, warn. This is a whole-cutoff check, not a
daily-allowance check — the daily allowance number (Feature 1) already goes negative on its own when this
happens, without a separate code path.

## The warning itself

`createTransactionAction`/`updateTransactionAction` return `{ ok: true; warning?: string }` instead of just
`{ ok: true }`. The warning text names the category (and subcategory, if that's what's budgeted) and the
overage amount, e.g.:

> "You're ₱500.00 over budget for Home & Groceries — Market / Grocery / Food this cutoff."

The form components show the existing success toast as today, and — only when `warning` is present — a
second toast via `sonner`'s own `toast.warning(...)` (confirmed present in the installed version).

## Out of scope (this spec)

- A standing Dashboard banner listing every currently-overspent allocation (explicitly deferred by
  Michelle's own answer — immediate-on-save only, for now).
- Warning based on the daily allowance going negative specifically.
- Quick Capture's own save path.
- "Can I afford this?" queries and the AI advisor — separate specs.
