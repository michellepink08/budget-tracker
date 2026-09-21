# September 19 Google Sheet Synchronization Plan

> Source of truth: “2026 Finance 2.0” Google Sheet and the user’s September 19, 2026 reconciliation requirements.

## Global constraints

- Preserve the existing interface and every existing feature.
- Work in the user’s real `D:\Budget Tracker` checkout; preserve all pre-existing dirty changes.
- Treat the Google Sheet as read-only.
- Never create a balancing adjustment to force a target.
- Compare date, description, amount, source account, and destination account before creating a transaction.
- Keep transfers, loan payments, card payments, cashback, expenses, and China Bank separation semantically correct.
- Stop before the live write if a match is ambiguous or any projected target differs.
- Every repair must be idempotent and auditable.

## Task 1: Build the read-only September 19 audit

**Files:**
- Create: `scripts/september-19-sync-core.mjs`
- Create: `scripts/september-19-sync-core.test.mjs`
- Create: `scripts/sync-september-19.mjs`

1. Add failing tests for exact and probable duplicate matching, two-row transfers and card payments, cashbacks, loan payments, plan links, credit-card ledger reconciliation, China Bank exclusion, and a zero-new second run.
2. Implement a deterministic source manifest and a pure planner/projector/summarizer.
3. Add a read-only runner that loads all relevant live models, prints current records, planned creates/updates, conflicts, balances, card available credit, loans, plans, expenses, transfers, and unpaid obligations.
4. Run the unit tests and the live dry run. Do not apply if any conflict or projected difference exists.

## Task 2: Repair the ledger and payment plans atomically

**Files:**
- Modify: `scripts/september-19-sync-core.mjs`
- Modify: `scripts/september-19-sync-core.test.mjs`
- Modify: `scripts/sync-september-19.mjs`
- Modify only if a calculation defect is proven: `src/lib/**`

1. Extend failing tests for every proven mismatch in the live ledger.
2. Correct only source-backed records: September 19 transactions, card-ledger differences supported by specific Sheet rows, card/loan plan amounts and links, and any source-backed setup values.
3. In one database transaction, lock the user’s financial rows, re-read state, re-plan, assert all projected targets, write audit logs, and apply.
4. Re-read inside the transaction and require the second plan to create/update zero records with zero conflicts.
5. Link BPI, UnionBank, GLoan, and MariBank Loan payments to their current-cycle plans and ensure unpaid planned obligations are empty.

## Task 3: Verify calculations, app surfaces, and production behavior

**Files:**
- Modify tests or calculation helpers only if verification exposes a defect.

1. Run the sync runner again in read-only mode and require zero changes.
2. Run focused finance tests, the full test suite, type-check/lint, and production build.
3. Inspect Dashboard, Accounts, Transactions, Loans & Cards, and Monthly Plan in the live app; verify balances, recent transactions, charts/totals, available credit, paid statuses, and no unpaid planned bills.
4. Review the complete diff against this plan and report any rulings or deferred issues.

## Expected final reconciliation

- Usable accounts: Cash ₱10,252.00; BPI Savings ₱5,998.62; GCash/CIMB ₱5,697.85; MariBank ₱1,380.62; Maya Savings ₱964.47; GoTyme ₱1.11; OwnBank ₱63.72; UnionBank Savings ₱36.91.
- Total usable funds: ₱24,395.30.
- China Bank Checking, separate: ₱38,160.68.
- Total including China Bank: ₱62,555.98.
- Available credit: BPI ₱27,756.24; UnionBank ₱54,068.58.
- BPI card payment ₱25,389.83 and UnionBank card payment ₱39,026.50 are paid on September 19, 2026.
- Current unpaid planned obligations: none.

## Review focus

- False duplicate matches involving two rows with the same date and amount.
- Signed card-payment rows and incorrect income/expense classification.
- Cashback treatment as account inflow without salary/regular-income inflation.
- Source-backed card ledger corrections versus hidden balance forcing.
- China Bank exclusion from usable funds.
- Transaction-to-plan links and idempotent repeat execution.
