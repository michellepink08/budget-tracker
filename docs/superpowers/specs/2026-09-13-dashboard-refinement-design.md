# Dashboard Refinement — Design

**Status:** Approved by user, 2026-09-13

## Goal

Phase 10, the final phase of the Quick Capture roadmap: compute the "safe to spend" figure the master design doc deferred ("the exact formula gets nailed down in that phase's plan"), surface the existing transfer-recommendation banner on the dashboard (currently only shown on Bills), and reorder the dashboard so the new headline figure leads.

## Context

The dashboard (`src/app/(app)/dashboard/page.tsx`) already computes `liquidFunds`, `totalPlanned`/`totalActual`/`totalRemaining` (budget-vs-spent for the active cycle), `duePayables` (a fixed 7-day window), and — since Phase 8 — `restrictedFunds`. `getRecommendedFundingTransfer` (`src/lib/transfer-recommendations.ts`) and its `FundingRecommendationBanner` component already exist and are already used on the Bills page; this phase reuses both as-is on the dashboard, no new transfer logic. `listDuePayables(prisma, userId, asOf)` (`src/lib/payables.ts`) already returns `PENDING` payables due by a given date — reused here with the *cycle's own end date* as `asOf`, instead of the fixed 7-day window, to answer "what's due before the next cutoff."

## Formula: Safe to spend

```
safe to spend = liquid funds
              − (PENDING payables due on/before the current cycle's end date, excluding any tied to a restricted-fund account)
              − (budgeted-but-not-yet-spent amount this cycle, i.e. totalRemaining)
```

- **Payables tied to a restricted-fund account are excluded** from the subtraction: Phase 8 already tracks those obligations against that fund's own balance (which was never counted in `liquidFunds` to begin with) — subtracting them again here would double-count the same obligation against money that was never "yours to spend" in the first place.
- **`totalRemaining`** (this cycle's budgeted amount minus what's actually been spent so far) is subtracted because it's money already earmarked for a category — not free to spend on anything else, even though it's sitting in a liquid account.
- The result can go negative (a real signal: obligations and budget commitments exceed what's liquid) — not clamped to zero.

This is implemented as a **pure function**, taking already-known numbers/lists rather than a `PrismaClient`, so it's trivially unit-testable and has no query logic of its own to get wrong:

```ts
// src/lib/safe-to-spend.ts
export function computeSafeToSpend(params: {
  liquidFunds: number;
  totalRemaining: number;
  payables: { accountId: string; amount: number; dueDate: Date }[]; // PENDING, any horizon — filtering happens here
  restrictedAccountIds: Set<string>;
  cutoffEnd: Date;
}): number {
  const obligations = params.payables
    .filter((p) => !params.restrictedAccountIds.has(p.accountId) && p.dueDate <= params.cutoffEnd)
    .reduce((sum, p) => sum + p.amount, 0);
  return params.liquidFunds - obligations - params.totalRemaining;
}
```

## Approach

### 1. `src/lib/safe-to-spend.ts` (new)

The pure function above. No Prisma import, no async — every input is already a plain value or array by the time it's called.

### 2. Dashboard page (`src/app/(app)/dashboard/page.tsx`) — wire it in

- Add one more parallel fetch: `listDuePayables(prisma, user.id, activePeriod.endDate)` (a *second* call alongside the existing 7-day-window one — different horizon, different purpose, not a replacement) to get every `PENDING` payable due before the next cutoff.
- Add `getRecommendedFundingTransfer(prisma, user.id, now)` (default 7-day look-ahead, same as Bills) as another parallel fetch.
- Compute `restrictedAccountIds = new Set(restrictedFunds.map((f) => f.accountId))` (from the `restrictedFunds` this page already fetches).
- Call `computeSafeToSpend({ liquidFunds, totalRemaining, payables: cutoffDuePayables, restrictedAccountIds, cutoffEnd: activePeriod.endDate })`.
- Resolve the funding recommendation's account names the same way the Bills page already does (a small local lookup against the `accounts` list — this page doesn't currently fetch `accounts`, so add `listAccounts(prisma, user.id)` as one more parallel fetch).

### 3. Quick Capture — answer `safe_to_spend` for real

`src/lib/quick-capture/answer-question.ts`'s `safe_to_spend` case currently returns `{ kind: "unavailable", ... }`. Now that the formula exists, wire it up the same way `restricted_fund_balance`/`restricted_fund_coverage` were wired in Phase 8: gather the same inputs (`computeLiquidFunds`, the active `BudgetPeriod`'s allocations for `totalRemaining`, `listDuePayables` up to that period's `endDate`, `listRestrictedFundGroups` for the excluded account set) and call `computeSafeToSpend`, returning `{ kind: "amount", label: "Safe to spend", amountMinorUnits }`.

### 4. Dashboard reordering

New top-to-bottom order:

1. **Top stat row**, now four cards: **Safe to spend** (new, leftmost — the headline figure), Liquid funds, Budgeted this cycle, Remaining this cycle (existing three, unchanged computation, just re-ordered into a 4-column grid on wider screens).
2. **Funding suggestion banner** (`FundingRecommendationBanner`, reused as-is from Bills) — directly below the stat row, above Upcoming, since it's actionable and time-sensitive.
3. **Upcoming (next 7 days)** — unchanged.
4. **Restricted funds** — unchanged (Phase 8).

## Data flow

```
Dashboard load:
  Promise.all([
    computeLiquidFunds, listAllocationsWithActuals, listDuePayables(7-day), listDueInstallmentPayments,
    listRestrictedFundGroups, listDuePayables(cutoff-end) [new], getRecommendedFundingTransfer [new], listAccounts [new]
  ])
  → computeSafeToSpend({ liquidFunds, totalRemaining, cutoffDuePayables, restrictedAccountIds, cutoffEnd })
  → render: [Safe to spend, Liquid funds, Budgeted, Remaining] → FundingRecommendationBanner → Upcoming → Restricted funds

Quick Capture "Am I safe to spend on non-essentials right now?" (or similar safe-to-spend phrasing, already pattern-matched since Phase 1):
  answerQuestion("safe_to_spend") → same inputs gathered inline → computeSafeToSpend → { kind: "amount", ... }
```

## Testing

- `safe-to-spend.test.ts` (new, no Prisma mock needed — pure function): no payables/no remaining → equals liquid funds; a standalone payable due before cutoff is subtracted; a payable due *after* cutoff is not subtracted; a payable tied to a restricted account's `accountId` is excluded even if due before cutoff; `totalRemaining` is subtracted; the result can go negative.
- `answer-question.test.ts` (extended): `safe_to_spend` now returns a real `{ kind: "amount", ... }` value instead of `unavailable`, given representative inputs.
- No test for the dashboard page itself (presentational, matches this codebase's convention).
- Manual verification on the live deployment: confirm the dashboard's new "Safe to spend" card renders with a sensible number; confirm the funding-suggestion banner appears when the demo data's Bills page already shows one (same underlying recommendation, same data); confirm Quick Capture's "Am I safe to spend right now?" (or whatever phrasing the existing `safe_to_spend` pattern matches) returns a real number instead of the old "isn't available yet" message.

## Out of scope

- Changing `getRecommendedFundingTransfer`'s own logic — reused exactly as-is.
- Any change to the Bills page's own use of the banner — it keeps showing there too; this phase only adds a second surface.
- A configurable/user-editable safe-to-spend formula — the formula above is fixed logic, not a per-user setting.
