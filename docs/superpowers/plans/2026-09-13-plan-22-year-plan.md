# Plan 22 — Year Plan & Vacation-Reserve Forecasting (Roadmap)

**Design reference:** `docs/superpowers/specs/2026-09-13-major-features-design.md` section D. **Depends on:** Plan 20 (`SavingsGoal` model, for the reserve link).

**Status:** Awaiting approval. Entirely new — nothing in this plan touches shipped code except adding a Dashboard section (Plan 21.4) and Quick Capture question types (Plan 27).

## Phase 22.1 — Schema + core domain functions

- `YearPlan`, `YearPlanPhase`, `IncomeForecast` models (design doc section D), migration.
- `createYearPlan`/`addPhase`/`addIncomeForecast`/`linkForecastToTransaction` domain functions (`src/lib/year-plan.ts`), each `userId`-scoped per convention.
- Tests: mocked-Prisma, covering the "forecast never touches a balance" invariant explicitly (a test that creates a forecast and asserts no `Transaction`/`Account` write occurred).

## Phase 22.2 — Reserve calculations

- `computeHomeCutoffCashFlow`, `computeRequiredReserve` (cumulative-shortage walk, largest-deficit rule), `computeRemainingReserve`, `computeRecommendedSavingPerCutoff` — all pure functions over plain inputs (phases + forecasts + a `SavingsGoal` snapshot), same "pure calculation, trivially testable" pattern as `computeSafeToSpend`.
- Tests built directly from the design doc's fictional worked example (3 home cutoffs at −₱13,000 each, a partial-income cutoff at +₱20,000, `minCashBuffer` ₱20,000 → required reserve ₱59,000) plus edge cases (a plan with no home cutoffs yet, a plan where cumulative never dips below the buffer at all → required reserve is the buffer itself or zero, pinned down precisely in this phase's detailed plan).
- Explicit test that a `PARTIAL_ONBOARD`-phase cutoff's income is excluded from `remainingFullIncomeCutoffs`.

## Phase 22.3 — Conservative scenario

- Second `YearPlan` row per user (or per household plan) carrying its own `IncomeForecast`/`YearPlanPhase` set, `scenario: "CONSERVATIVE"`.
- UI/action to "clone as conservative" from an existing Expected plan, pre-adjusting per the design doc's list (earlier onboard end, longer vacation, lower partial salary, delayed/excluded cash bond, excluded other-uncertain-income) — exact default deltas confirmed with the user in this phase's own brainstorm before coding, not assumed here.

## Phase 22.4 — Year Plan page

- New primary nav item, `src/app/(app)/year-plan/page.tsx`.
- Per-cutoff stacked cards (mobile) / table (desktop): dates, phase, my income, husband's income, partial/one-time income, total reliable income, essential expenses, payables/debt, other spending, reserve contribution/withdrawal, projected closing balance, confidence status.
- One projected-balance chart (Recharts, reusing the app's existing chart-setup pattern) with `minCashBuffer` as a reference line.
- Expected vs. Conservative scenario switcher.

## Phase 22.5 — Dashboard + integration hookup

- "Expected income" and "Year Plan reserve" compact Dashboard sections (Plan 21.4's deferred slots).
- `SavingsGoal` linkage confirmed working end-to-end (a real account's balance drives the reserve's "current amount").

## Open questions before Phase 22.1 starts

1. "Remaining reserve" — confirmed as `requiredReserve − SavingsGoal.assignedAmount` in the design doc; confirm `assignedAmount` (a manually-maintained figure) vs. the account's live balance is the right "already saved" source, since they can drift if money moves in/out of the account outside the assignment flow.
2. Exact default deltas for the Conservative scenario's auto-generated adjustments (Phase 22.3).
3. Whether "Show the conservative Year Plan" (a navigation-style Quick Capture command) is in scope for this plan or deferred entirely to Plan 27.
