# Cutoff Rollover Prompt — Design

## Problem

Every time a new budget cutoff (`BudgetPeriod`) starts, whatever money is left in Michelle's disposable
accounts (Cash, BPI, GCash, MariBank, Maya, GoTyme, OwnBank, UnionBank) just quietly carries forward — the
app never asks what should happen to it. Her spreadsheet models this explicitly as an **Income > Rollover**
line each cutoff. She wants the app to ask, at the start of each new cutoff: keep the leftover as-is
("Rollover"), or move some of it into savings first.

## Why this can't be a real Income transaction

The leftover money isn't new — it was already recorded as income (salary, etc.) in an earlier cutoff and
simply wasn't spent. Every account's balance is the sum of its own `Transaction.amount` rows
(`computeAccountBalance`); if "rollover" created a second `INCOME` transaction for money that's already
sitting in the account, the account balance would inflate past its real bank balance. So Rollover is
**not** an Income category and **not** a Transaction — it's a label recorded once per cutoff, kept
deliberately separate from Income everywhere it's shown.

Moving money to savings, on the other hand, *is* a real transfer (money genuinely moves between two of her
own accounts), so that part reuses the existing transfer machinery untouched.

## Data model

Add two nullable columns to `BudgetPeriod`:

```prisma
model BudgetPeriod {
  ...
  rolloverAcknowledgedAt DateTime?
  rolloverAmount         Int?       // snapshot of the disposable total at the moment of acknowledgment
}
```

- Both null until the user acts on the prompt for that cutoff.
- `rolloverAmount` is a snapshot, not a live figure — once set it never changes, even if the account
  balances move afterward. It reflects "how much rolled over," a historical fact about that cutoff.

## Trigger condition

On the Dashboard, after resolving `activePeriod` (already happens today via
`resolveBudgetPeriodForDate`):

- Show the rollover prompt banner when `activePeriod.rolloverAcknowledgedAt` is null **and** at least one
  earlier `BudgetPeriod` exists for this user (a brand-new user's very first cutoff has nothing to roll
  over, so the prompt never appears for it).
- The banner keeps reappearing on every Dashboard visit until acknowledged — same "quiet until resolved"
  pattern the app doesn't currently have elsewhere, but modeled after `FundingRecommendationBanner`'s
  always-recomputed-from-live-state style.

## The banner

Reuses the Dashboard's already-computed `disposableTotal` (`computeDisposableTotal`) as the headline
figure. Content:

1. **Headline:** "New cutoff started — ₱X across your disposable accounts carries over as Rollover."
2. **Optional action: "Move some to savings first"** — an inline mini version of the existing transfer
   form: amount (editable, defaults blank, capped at the source account's balance), a source-account
   picker (disposable accounts only), a destination-account picker (savings/restricted accounts). Submitting
   creates a normal two-sided transfer via the existing `createTransferAction`/`createTransferTransaction` —
   no new transfer logic. Can be used more than once (e.g., split across two savings accounts) before
   acknowledging.
3. **"Got it" button** — records `rolloverAcknowledgedAt = now` and `rolloverAmount =` the disposable total
   *at that moment* (i.e., after any transfers already made in step 2), then the banner disappears for this
   cutoff.

No "skip" or "decline" button is needed — leaving money in place *is* the rollover; "Got it" just
acknowledges and snapshots it.

## Where the recorded "Rollover: ₱X" note is shown afterward

Once `rolloverAcknowledgedAt` is set, a small read-only note appears in three places for that cutoff — kept
visually and semantically separate from Income everywhere:

- **Budget page** — a new card next to "Budgeted this cycle" / "Remaining this cycle": "Rollover: ₱X".
- **Dashboard** — a small note near the top summary cards, replacing the (now-dismissed) banner.
- **Ledger (Income tab)** — a note above the Income wide-table for cutoffs with a recorded rollover, e.g.
  "Rollover carried into this cutoff: ₱X" — not a row in the table, since it's not a transaction.

None of these feed into Income totals, Reports charts, or category actuals — "Rollover" stays a label, not
a number that gets added into any existing income calculation.

## Out of scope (this iteration)

- Retroactively backfilling a rollover note for cutoffs that already happened before this feature shipped.
- Reports/charts including the Rollover figure (YAGNI until asked for).
- Per-account rollover choices (accepted design: single combined disposable total, single acknowledge).
