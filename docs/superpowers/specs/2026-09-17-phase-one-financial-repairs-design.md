# Phase 1: financial record and calculation repairs

## Scope and approval

Michelle approved extending the existing financial models rather than rebuilding them. This specification incorporates her September 17 safeguards. Implementation begins after review of this written specification. Navigation and visual redesign are excluded until Phase 1 passes every reconciliation and repeat-run check.

Use the actual project at `D:\Budget Tracker`. Preserve all unrelated working changes. Extend existing BudgetPeriod, CycleIncomePlan, CyclePaymentPlan, CreditCard, Account and Transaction records; do not introduce parallel budget-cycle, payment or actual-total concepts.

## Audited starting point

The September 11–October 10 cycle contains the existing September 16 Engage income of ₱24,046.68 in BPI Savings, categorized Income / Engage. Its description is “Engage salary”; the income plan's source is “Engage.” Name equality currently prevents automatic inclusion.

Maya has an existing two-sided September 12 card payment of ₱7,494.04 and September 13/15 purchases of ₱1,073.32 and ₱358.79. Neither payment side may be recreated. No card payment plans or EastWest hospital charge transactions were found. Refresh this audit immediately before writes; changed or ambiguous matches stop that repair.

UnionBank's saved limit is ₱65,000 and available credit is ₱5,888.27. Michelle confirmed total liability ₱59,111.73, statement amount ₱35,711.73 and unbilled balance ₱23,400. These are distinct values, not conflicting balances.

## Model extensions and ownership

1. Extend CycleIncomePlan with stable category/subcategory source references. Actual income eligibility requires type INCOME and an income category. Source references group eligible income; description text does not decide eligibility. Source labels remain editable display text.
2. Extend CyclePaymentPlan with nullable dueDate, a separate dueDateStatus enum (`CONFIRMED`, `ESTIMATED`, `UNSET`), optional funding-account reference and payment-transaction associations. UNSET requires a null date; CONFIRMED and ESTIMATED require a date. Reject inconsistent combinations. Do not invent dates from a card's saved due-day setting when an explicit plan says UNSET.
3. Payment associations reference existing ledger transactions and cannot allocate the same payment twice or exceed its amount. Associate the negative cash-side row of a card payment, not both ledger sides. Validate owner, payment type and corresponding card/loan. Calculated actual, remaining and status are not manually stored totals.
4. Preserve card available-credit opening semantics and derive total liability from credit limit minus ledger-derived available credit. Store statement-specific planning metadata separately from liability. A plan's editable payment amount is not necessarily its statement balance. Keep the verified statement amount and contributing payment links independent of that editable amount. Derive remaining statement debt and current unbilled debt without counting new purchases in an earlier statement.
5. Use existing Payable records for ordinary bills and existing CyclePaymentPlan records for loan/card plans. One shared obligation projection combines them for existing Dashboard, Plan and Calendar consumers without creating duplicate Payables for these cards.

Migration is additive and preserves current data. Backfill existing income source references from unambiguous category/subcategory matches. Existing manually linked income records with missing categories can be categorized only from their verified source link; preserve amount, date and account. Ambiguity is reported, never guessed. Existing payment-plan date confidence is not upgraded to verified without evidence; generated dates remain estimated. Existing Payable confidence is preserved.

## Authorized record repairs

All money uses integer centavos. Resolve custom cycles by exact dates, not ACTIVE status alone. Create missing August 11–September 10 and October 11–November 10 periods once; leave unrelated periods intact.

| Card | Statement amount | Planned payment | Due date / confidence | Plan cycle | Payment treatment |
| --- | ---: | ---: | --- | --- | --- |
| BPI Amore | ₱25,389.83 | ₱25,389.83 | October 5, 2026 / CONFIRMED | September 11–October 10 | Unpaid; funding BPI Savings unless an existing verified plan specifies another account |
| Maya | ₱7,494.04 | ₱7,494.04 | September 30, 2026 / CONFIRMED | September 11–October 10 | Link existing September 12 payment from Maya Savings; paid, remaining zero |
| UnionBank | ₱35,711.73 | ₱35,711.73 | Null / UNSET | September 11–October 10 | Unpaid; funding account remains unspecified unless an existing record identifies it |
| EastWest | ₱45,519.14 expected statement | ₱45,519.14 | October 25, 2026 / ESTIMATED | October 11–November 10 | Unpaid; expected statement October 5, funding unspecified absent existing evidence |

EastWest: record September 6 hospital deposit ₱30,000 and September 10 hospital balance ₱15,519.14 as purchases on the EastWest card account, in the August 11–September 10 cycle. These reduce available credit and increase liability by ₱45,519.14. They do not touch cash accounts or count as current/next-cycle expenses. Reuse an appropriate existing health category, or create an unambiguous Health/Hospital classification once if needed. No synthetic cash transfer or opening-balance adjustment.

Maya's two Claude charges total ₱1,432.11 and remain separate purchases for the next statement. Its existing total liability is ₱18,695.66 after the payment and purchases; do not erase or infer away other opening debt. BPI total liability remains ₱32,529.65. UnionBank remains ₱59,111.73 until a real payment; a hypothetical ₱35,711.73 payment leaves ₱23,400 with no new charges. EastWest becomes ₱45,519.14 total liability and ₱53,480.86 available credit.

Engage actual becomes ₱24,046.68 against its existing ₱22,000 expectation, difference +₱2,046.68. Preserve the existing transaction and expected amount.

## Shared financial rules and integration

Account balances use opening balances plus signed ledger activity. Card payments lower cash and liability but are not expenses. Loan payments reduce only their named loan and are not expenses. Transfers and receivable repayments are not income/expenses; refund/cashback offsets expense rather than becoming ordinary income.

Audit existing loan and repayment helpers for these rules. Prefer explicit loanId over shared category names; legacy fallback must be unambiguous. Protect the two SLoans and all completed imports. If unrelated or ambiguous legacy data prevents verification, report the difference and do not create balancing adjustments.

Actual plan totals use transactions within the selected custom cycle. Date boundaries cover the complete final day, respecting the application's date-only convention. Actual contributing records are available to consumers; expected values remain editable. Copy-last-cycle retains source/funding references and date confidence, leaves UNSET dates null and never copies payment links or actual amounts.

Payment status derives from linked actual amounts: unpaid, partially paid or paid. Remaining planned payment is planned minus allocated actual. UNSET obligations appear in “Needs a due date,” excluded from overdue and next-seven-days totals. Only unpaid CONFIRMED dates in the past are overdue. ESTIMATED dates carry an estimated badge and must never become verified overdue alerts. Shared projections must override generated schedule defaults and be used by all existing consumers. Minimal functional labels/fields are allowed; no layout redesign.

## Repair safety and execution

Provide a read-only dry run with candidate matches, requested updates, conflicts and projected balances. Use stable repair identities, existing plan uniqueness and historical transaction date/account/amount/type matching; descriptions are supporting evidence, not sole matching criteria. Ambiguous matches stop affected writes. Never add expenses for planned card payments.

Apply approved repairs atomically under a user-scoped lock, re-reading and checking audited values inside the transaction. Keep an audit trail of before/after values and repair provenance. Run a rollback verification before production application. Immediately rerun against persisted data: zero new records, zero duplicate associations, zero unnecessary updates. Later reruns preserve legitimate user edits and must not reset paid statuses or editable amounts to initial seeds.

## Verification and Phase 1 exit gate

Test source/category-based income inclusion despite changed descriptions, invalid category/type exclusion, contributor totals and legacy-link migration. Test due-date invariants, estimated/unknown routing, partial payment, payment ownership/card validation, prevention of double allocation, cycle copying and whole-final-day cycle boundaries.

Test EastWest historical expenses/liability without cash movements; Maya existing payment identity and next-statement purchases; UnionBank statement/unbilled/liability arithmetic and a rollback-only simulated statement payment. Test explicit loan isolation, two SLoan balances, refunds and receivable repayment classification.

Run the complete existing test suite, relevant live rollback/reconciliation tests, type checking and production build. Check existing Dashboard, Monthly Plan and Calendar consumers for shared statuses and plans without redesigning them. Record actual outputs; do not claim success based only on planned tests.

The final reconciliation lists each card's statement balance, total liability, planned payment, linked paid amount/status, due-date status/date and exact cycle. Show both original statement amount and remaining statement debt when paid. Show unknown values as unknown, never zero. Include all cash account differences, protected loan/receivable balances, prior/current/next cycle expenses and income, and second-run created/updated/skipped/unresolved counts. Explain any difference rather than automatically adjusting it. Phase 2 stays blocked until all required checks pass or Michelle explicitly resolves reported conflicts.
