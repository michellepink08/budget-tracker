# Monthly obligations view — design

## Purpose

Give the user one clear, cycle-based view of every planned outflow without
requiring duplicate manual entries. The view must separate ordinary bills,
loans/installments, and credit cards while still showing a single total for
the selected budget period.

Each row shows: expected amount, actual amount paid, remaining amount, due
date, and status. Users record the real payment once; the row and the Budget
page update from that payment.

## User experience

The Bills page becomes **Monthly obligations**. The selected budget period
controls the data shown. A summary at the top shows total expected, total
paid, and total remaining.

Three clearly labelled sections follow:

1. **Regular bills** — one-off and recurring payables. Existing bill records
   remain the source of the due date, expected amount, category, account, and
   paid state.
2. **Loans & installments** — active loans and unarchived installment terms
   due during the selected period. A loan begins with its normal monthly
   payment as the expected amount; the user may override it for that period.
3. **Credit cards** — each active linked card. The user enters a planned
   payment for the selected period; this is intentionally independent from
   the credit limit and available credit.

Rows remain within their section. Empty sections say what needs to be added,
not that the user has made an error. The existing detailed Budget page stays
as the category-level view; this page becomes the due-payment view.

## Data model

Add `CyclePaymentPlan` for user-entered, period-specific plans. It holds the
budget period, source kind (`LOAN` or `CREDIT_CARD`), source id, expected
amount, due date, and timestamps. A unique constraint on
`[budgetPeriodId, sourceKind, sourceId]` ensures one plan per source per
cycle.

On first display, the service derives a temporary default plan from a loan's
monthly payment and due day. A credit card has no default amount and is shown
as `Plan payment` until the user enters one. Saving a value persists the
override in `CyclePaymentPlan`; it never changes the loan's normal monthly
payment or the card's credit limit.

Add nullable `loanId` and `creditCardId` links to `Transaction`. Payment
actions populate the relevant link on their outgoing payment transaction.
This makes actual payments unambiguous, rather than inferring them from a
shared category or description. Existing bills continue to use their existing
`Payable.paidTransactionId` relationship.

Repair the existing loan records so each loan owns a distinct Loan
subcategory. Future loan creation must resolve/create by the loan's name,
not attach every loan to a generic `Loan` subcategory.

## Data flow

1. The obligations query receives the selected budget period.
2. It loads pending/paid payables in that date range, active recurring bill
   occurrences, active loans, due installment terms, linked credit cards, and
   saved cycle plans.
3. It produces a small view model with section, expected, actual, remaining,
   due date, status, and the appropriate action target.
4. `Mark paid`, `Make a loan payment`, `Pay installment term`, and `Make a
   credit-card payment` each write one financial transaction and link it to
   the applicable source. The view recomputes actuals from those links.
5. Those same categorized transactions continue to supply Budget actuals.

## Rules and edge cases

- An expected amount may be zero only for an unplanned credit card; it is not
  treated as paid.
- Actual may exceed expected; show the overpayment clearly rather than hiding
  it.
- Archived loans, archived installments, and inactive recurring bills do not
  appear in future cycles.
- A loan/card payment dated outside the selected period is counted in its own
  period, not the period where it was planned.
- Existing historical transactions are not reclassified automatically. The
  new links apply to newly recorded payments; a later migration/reconciliation
  tool can handle old records deliberately.

## Validation and tests

- Unit-test plan defaults, overrides, period filtering, totals, and
  overpayments.
- Unit-test each payment action persists the correct transaction link.
- Add a regression test that separate loans cannot share a payment actual.
- Add page/component tests for section ordering, empty states, and expected /
  actual / remaining display.
- Verify Prisma migration, focused tests, type check, and production build
  before deployment.

## Out of scope

- Bank statement import and automatic transaction matching.
- Changing historical opening balances or creating historical transactions.
- Removing the existing Budget page or existing Bills management controls.
