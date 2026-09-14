# Ledger Page & Credit Card Balance Fix — Design

## Goal

Give the user a clear, table-based view of their transactions grouped by account purpose (Disposable, Credit, Restricted, Savings, Debt/Loans) — replacing the manual spreadsheet they currently keep outside the app. Along the way, fix a real gap this surfaced: paying a credit card doesn't currently reduce what that card shows as owed anywhere in the app.

This spec covers two tightly-coupled pieces, built in this order:

1. **Credit card payments become a real two-sided ledger entry** (Part A) — a data/behavior fix.
2. **A new Ledger page with five purpose-grouped transaction tables** (Part B) — the user-facing feature, which depends on Part A's balances being correct.

Both ship together; Part A is a prerequisite for Part B's Credit table to show a meaningful balance.

Out of scope (explicitly deferred to a separate future spec, per the user): adding savings-goal tracking to Restricted-purpose accounts.

---

## Part A: Credit card payments as two-sided entries

### Current behavior

`makeCreditCardPayment` (`src/lib/credit-cards.ts`) creates one `CREDIT_CARD_PAYMENT`-typed transaction row on the *paying* account only. `computeAccountBalance` (`src/lib/account-balance.ts`) only sums transactions whose `accountId` matches the account being computed — so the card's own account balance never reflects payments made toward it, only purchases charged to it (ordinary `EXPENSE` rows with `accountId` = the card's account). This was previously confirmed as "working as designed," but the user now wants a payment to actually reduce what a card shows as owed, everywhere the balance appears (Accounts page, Loans & Cards page, and the new Ledger page).

### New behavior

`makeCreditCardPayment` creates **two linked rows in one DB transaction**, mirroring the existing pattern in `src/lib/transfers.ts::createTransfer` (which already does exactly this for transfers between two of the user's own accounts):

- **Outgoing row** — unchanged from today: `type: CREDIT_CARD_PAYMENT`, `accountId`: the paying account, `amount: -amount`, `destinationAccountId`: the card's account (for traceability/display — this field already exists on `Transaction` and is already used by transfers for the same purpose).
- **New incoming row** — `type: CREDIT_CARD_PAYMENT`, `accountId`: the card's account, `amount: +amount`, `destinationAccountId`: the paying account, `description`: `"Payment from {payingAccountName}"`.
- The two rows are linked via `linkedTransactionId`, same as a transfer's two rows.

No schema change is required — `destinationAccountId` and `linkedTransactionId` already exist on `Transaction` and are already nullable/optional.

Because `CREDIT_CARD_PAYMENT` is in `OUTFLOW_TYPES` in `src/lib/transaction-rules.ts` (used by `signedAmountForType`), the incoming row's `+amount` sign is set explicitly rather than through `signedAmountForType` — the same way `createTransfer` already bypasses `signedAmountForType` for its two rows (see the comment on `signedAmountForType`: "everything except TRANSFER and BALANCE_ADJUSTMENT, which get their sign from elsewhere"). `CREDIT_CARD_PAYMENT` joins that short list of types whose sign depends on which side of a two-row entry it is.

### Balance effect

`computeAccountBalance` needs no changes — it already sums by `accountId`, and the new incoming row naturally participates once it exists. A card that owed 9,000 after a 1,000 purchase, paid 500, now correctly shows 8,500 owed everywhere: Accounts page, Loans & Cards page, and the Ledger page's Credit table.

### Verified non-side-effects

- `src/lib/purpose-totals.ts` (`computeDisposableTotal`, `computeSavingsTotal`) only sums accounts by `purpose` — Credit-purpose accounts are never included, so the new incoming row (which lives on a Credit account) can't leak into Disposable/Savings totals or Safe to Spend.
- `src/lib/reports.ts` (`spendingByCategory`, `incomeVsExpenseByPeriod`) filter strictly on `type === "EXPENSE"` / `type === "INCOME"` — `CREDIT_CARD_PAYMENT` rows (either side) are never counted as spending or income, so no double-counting there.
- Reconciliation (`src/actions/reconciliation.actions.ts` / `ReconcileDialog`) is already account-agnostic (takes any `accountId`) — no changes needed for credit cards to be reconcilable, which is the user's answer for handling interest charges that make the exact owed amount unclear.

### Test changes

`src/lib/credit-cards.test.ts` currently has a test asserting a payment only touches the paying account (`"creates a CREDIT_CARD_PAYMENT transaction against the paying account"`, checking only `accountId: "acc-checking"`). This assertion is being deliberately changed as part of this spec — update it to assert both rows are created, linked, and signed correctly.

---

## Part B: The Ledger page

### Location

A new page at `/ledger`, linked from the sidebar (`src/components/nav/side-nav.tsx` / `nav-links.ts`) alongside the existing Plan & Review links.

### Structure

Five separate tables, one per account purpose, each combining every non-archived account of that purpose:

| Table | Accounts included |
|---|---|
| Disposable | all `purpose: DISPOSABLE` accounts |
| Credit | all `purpose: CREDIT` accounts |
| Restricted | all `purpose: RESTRICTED` accounts (today: just the user's Tierra Alta/ChinaBank account) |
| Savings | all `purpose: SAVINGS` accounts (today: Emergency Fund + vacation fund) |
| Debt (Loans) | all `Loan` rows (not `Account` rows — loans are a separate model; see below) |

The first four tables are transaction-based (same shape). The fifth (Debt/Loans) is a lighter summary table, described separately below.

### Columns (Disposable / Credit / Restricted / Savings tables)

`Date · Account · Description · Category · Amount · Running balance`

- One row per transaction, across every account in that purpose group.
- **Sort: newest first** (per user request, so the latest activity is visible without scrolling). The running balance for each row is computed in true chronological order (oldest → newest) per account, then the resulting rows are reversed for display — so the top row of each account's activity always shows that account's current balance, and the balance shown on any row is that account's real balance as of that date, not a display artifact of the sort order.
- When an account is archived mid-history, its past transactions still appear (this page is read-only history, not an active-accounts management view).
- A credit card payment's incoming half (Part A) appears as its own row in the Credit table, interleaved by date with that card's purchases — e.g. "Payment from Savings — Emergency Fund" — so purchases and payments are visible together in one place, exactly as the user asked ("I can see when I purchased using that card and the payment").

### Debt (Loans) table

Loans aren't `Account` rows with a transaction ledger the same way — they're tracked via the `Loan` model (`principal`, `remainingBalance`, `monthlyPayment`, etc.) with `LOAN_PAYMENT`-typed transactions recorded against whichever account paid them. This table shows one row per loan: `Name · Remaining balance · Monthly payment · Interest rate · Next due date (if dueDay is set) · Term (if endDate is set)` — reusing the existing loan list's own data (`src/lib/loans.ts::listLoans`), not a transaction ledger. This keeps the page consistent with "here's a clear table for each part of my finances" without inventing a loan-transaction ledger that doesn't otherwise exist in the app.

### Date range

- **Default: current budget cycle** (same `resolveBudgetPeriodForDate` used elsewhere in the app), matching how the rest of the app already scopes "this cycle" data.
- A date-range picker above the tables lets the user widen the range (e.g., a specific month, a full year, or all-time).
- All five tables share the same selected range.

### Read-only

This page has no create/edit/delete actions. It's purely a clear view of what already exists — matching the user's own framing ("I just want to see clearly the details in a table"). Existing pages (Transactions, Loans & Cards) remain where changes are made.

### Data layer

New `src/lib/ledger.ts` with one function per purpose-group query (or one parameterized function), each:
1. Finds accounts of that purpose (or loans, for the fifth table).
2. Finds transactions for those accounts within the given date range.
3. Computes each account's running balance chronologically (starting from `Account.openingBalance` plus every prior transaction before the range start, then walking forward through the range).
4. Returns rows in the requested (newest-first) display order, each carrying its correctly-computed balance.

New components: one table component reused across the four transaction-based tables (`src/components/ledger/ledger-table.tsx`), parameterized by title/rows/currency; a distinct `src/components/ledger/loan-summary-table.tsx` for the fifth.

---

## Testing plan

- `src/lib/credit-cards.test.ts` — updated test asserting the two-sided entry (both rows, correct signs, `linkedTransactionId` set both ways).
- `src/lib/ledger.ts` — new unit tests per purpose-group query: correct accounts included, correct date-range filtering, correct running-balance math, correct newest-first ordering with chronologically-accurate balances.
- Manual verification (local dev): create a credit card purchase, then a payment from a Savings account; confirm the card's balance drops by the payment amount on the Accounts page, Loans & Cards page, and the new Ledger page; confirm the payment row appears in the Credit table with the purchase.
- Full suite (`vitest run`), `tsc --noEmit`, `eslint`, `next build` before considering the work done.

## Rollout

Per the user's explicit request: build and verify locally, show the result (screenshots or a live walkthrough) for approval, and only deploy to production after that approval — not the usual "verify then ship immediately" pattern used for smaller fixes in this app.
