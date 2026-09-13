# Plan 21 — Dashboard Balance Overview Update (Roadmap)

**Design reference:** `docs/superpowers/specs/2026-09-13-major-features-design.md` section C. **Depends on:** Plan 20 Phase 20.4 (`Account.purpose` must exist first).

**Status:** Awaiting approval.

**Explicitly omitted (already shipped, not touched):** `computeLiquidFunds`, the existing `computeSafeToSpend` three-term shape (revised, not replaced — see below), `listRestrictedFundGroups`, `getRecommendedFundingTransfer`, the funding-recommendation banner, Upcoming/Recent-transactions sections, the whole Quick Capture panel.

## Phase 21.1 — Purpose-scoped totals

- New `computeDisposableTotal`/`computeSavingsTotal` (thin sums over `computeAccountBalance` filtered by `purpose`), alongside the existing `listRestrictedFundGroups` for the restricted total.
- Tests: mocked-Prisma unit tests per function, mirroring `liquid-funds.test.ts`'s style.

## Phase 21.2 — Revised `computeSafeToSpend`

- Add the `requiredTransfers`/`confirmedReserves` terms per the design doc's formula; base total switches from "liquid funds" to "disposable total."
- Regression coverage for the "confirmed reserves is usually zero" no-op case (design doc's worked example) so a future reader doesn't "fix" it away.
- Re-verify the existing `answer-question.ts` `safe_to_spend` case still returns a coherent number with the revised inputs (extend its test, don't rewrite its shape).

## Phase 21.3 — Three-card Dashboard layout

- Replace the current 4-stat row + flat restricted-funds list with `Disposable Accounts` / `Savings & Reserves` / `Restricted Checking` cards (using the new `Card` component from Plan 20 Phase 20.2 — sequencing note: Phase 20.2 should land before this phase for a consistent surface, though it's not a hard blocker if timelines shift).
- Keep Upcoming dues / Required transfers / Current-cutoff budget / Recent transactions below, unchanged logic, just re-homed visually.

## Phase 21.4 — New compact Dashboard sections (stubs pending their own features)

- "Expected income," "Year Plan reserve," "Shopping estimate" sections are added to the Dashboard **as part of Plan 22 (Year Plan) and Plan 23 (Shopping) respectively**, not here — this phase leaves clearly marked slots (or simply doesn't render them yet) so the Dashboard doesn't reference models that don't exist. Cards & loans section: confirm whether the existing Loans & Cards page summary is already sufficient to reuse here or needs its own compact query (small open item for this phase's detailed plan).

## Open questions before Phase 21.1 starts

1. "Confirmed reserves" (design doc's fourth safe-to-spend term) — confirm the no-op-in-the-common-case reading is correct, or describe the scenario where it's meant to actually subtract something routinely.
