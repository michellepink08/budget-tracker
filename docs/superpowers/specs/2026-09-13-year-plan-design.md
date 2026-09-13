# Year Plan & Vacation-Reserve Forecasting — Design

**Status:** Approved. Scope: Expected scenario only (Phases 22.1, 22.2, 22.4, 22.5 of the `plan-22` roadmap). Conservative scenario (22.3) and the Quick Capture "show conservative plan" command are explicitly deferred — see Decisions below.

**Depends on:** `SavingsGoal` (Plan 20 Phase 20.5) — the vacation reserve is a reference to an existing `SavingsGoal`, not a new model.

## Purpose

Forecast income and cash flow across a multi-cutoff "year" that includes a home period with reduced/no salary (e.g. an overseas-work onboard/home cycle), and compute how much must be saved into a reserve ahead of time so the home period never dips below a minimum cash buffer.

## Decisions made this pass

1. **"Already saved" source for `remainingReserve`:** `SavingsGoal.assignedAmount` (the manually-maintained figure), not the linked account's live balance — consistent with how "confirmed reserves" already works in the revised `computeSafeToSpend` (Plan 21). A stray transfer into the savings account won't silently count as "saved toward the reserve" until the user deliberately assigns it.
2. **Conservative scenario (Phase 22.3) is deferred.** This pass ships the Expected scenario only: schema, reserve math, and the Year Plan page. No scenario switcher UI yet — the page renders the single Expected `YearPlan`.
3. **The Quick Capture "show the conservative Year Plan" command is deferred to Plan 27** (Cross-feature commands), which is designed to add conversational commands across every feature in one pass.
4. **Desktop table layout:** a grouped table (Cutoff | Income | Expenses | Reserve | Closing balance | Status) rather than one raw column per field — each cell can carry a small sub-label (e.g. "₱35,000 (reliable)"). Falls back to stacked cards on mobile, per the original roadmap.
5. **Chart style:** a line tracking projected closing balance per cutoff, with the area below `minCashBuffer` shaded (danger-toned) wherever the projection dips under it, rather than a plain dashed reference line — the risky stretch of the plan is visible at a glance.

## Schema

```prisma
model YearPlan {
  id                  String   @id @default(cuid())
  userId              String
  name                String              // e.g. "2026–2027 Onboard Cycle"
  startDate           DateTime
  endDate             DateTime            // rolling 12–18mo, can cross Dec 31
  minCashBuffer       Int                 // minor units — the "floor" liquid funds must not projectedly cross
  scenario            String   @default("EXPECTED") // "EXPECTED" only for this pass; "CONSERVATIVE" reserved for Plan 22.3
  vacationReserveGoalId String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  user             User             @relation(fields: [userId], references: [id])
  vacationReserveGoal SavingsGoal?  @relation(fields: [vacationReserveGoalId], references: [id])
  phases           YearPlanPhase[]
  forecasts        IncomeForecast[]
}

model YearPlanPhase {
  id         String   @id @default(cuid())
  userId     String
  yearPlanId String
  phaseType  String   // FULL_ONBOARD | PARTIAL_ONBOARD | TRANSITION_HOME | HOME_SALARY_ONLY | EXPECTED_RETURN | PARTIAL_RETURN | CUSTOM
  startDate  DateTime
  endDate    DateTime
  label      String?

  user     User     @relation(fields: [userId], references: [id])
  yearPlan YearPlan @relation(fields: [yearPlanId], references: [id])
}

model IncomeForecast {
  id                  String    @id @default(cuid())
  userId              String
  yearPlanId          String
  source              String    // MY_SALARY | MY_BONUS | HUSBAND_SALARY | ALLOTMENT | PARTIAL_SALARY | FINAL_SALARY | CASH_BOND | OTHER
  expectedDate        DateTime
  expectedAmount      Int                 // minor units
  cutoffLabel         String
  phaseId             String?
  status              String    @default("EXPECTED") // CONFIRMED | EXPECTED | ESTIMATED | UNCERTAIN
  actualTransactionId String?
  notes               String?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  user              User            @relation(fields: [userId], references: [id])
  yearPlan          YearPlan        @relation(fields: [yearPlanId], references: [id])
  phase             YearPlanPhase?  @relation(fields: [phaseId], references: [id])
  actualTransaction Transaction?    @relation(fields: [actualTransactionId], references: [id])
}
```

A `YearPlan`/`YearPlanPhase`/`IncomeForecast` are all `userId`-scoped per the app's existing convention (every domain function filters by `userId`, never trusts a bare id).

## Double-counting safeguard

`IncomeForecast` never writes to any `Account`/`Transaction` balance — it is pure planning data. When real income lands, the user (or Quick Capture) creates the normal `INCOME` transaction exactly as always; separately, `IncomeForecast.actualTransactionId` can be set to link the forecast to that transaction (a manual/assisted "link" action — never automatic matching, since silently linking the wrong forecast to the wrong transaction is worse than asking). Once linked, the Year Plan page shows that line as "Confirmed — received," but the forecast's `expectedAmount` is never added to any balance calculation anywhere; only the real transaction affects balances.

## Calculations (`src/lib/year-plan.ts` — schema/CRUD, `src/lib/year-plan-reserve.ts` — pure math)

**Reliable income per cutoff:** `MY_SALARY` + `ALLOTMENT` sources with status `CONFIRMED` or `EXPECTED` only — `ESTIMATED`/`UNCERTAIN` lines are shown on the page but excluded from "reliable."

**Home-cutoff cash flow:** `reliable income − planned expenses` for a cutoff whose phase is `HOME_SALARY_ONLY` or `TRANSITION_HOME`.

**Required reserve:** walk the home-period cutoffs in order, running a cumulative balance starting from the reserve's current amount, and take the most negative point. `requiredReserve = abs(worstCumulativePoint) + minCashBuffer` when the worst point is negative relative to the buffer; `0` when the plan never dips below the buffer at all.

*Worked example (fictional numbers):* 3 home cutoffs at −₱13,000 cash flow each, then a partial-income cutoff at +₱20,000. Cumulative: −13k, −26k, −39k, −19k. Worst point −₱39,000. With `minCashBuffer` = ₱20,000: `requiredReserve = 39,000 + 20,000 = ₱59,000`.

**Remaining reserve:** `requiredReserve − SavingsGoal.assignedAmount` (Decision 1 above). Floored at 0 (already fully reserved shows 0, not negative).

**Recommended saving per full-income cutoff:** `remainingReserve ÷ remainingFullIncomeCutoffs`, where the denominator counts only `IncomeForecast` rows on `FULL_ONBOARD`-phase cutoffs that haven't passed yet — a `PARTIAL_ONBOARD` cutoff is explicitly excluded (never treated as a full saving opportunity). If `remainingFullIncomeCutoffs` is 0, the recommendation is `null` (not divide-by-zero, not the full `remainingReserve` dumped on one cutoff) — the page shows "no more full-income cutoffs to save from" in that case.

All four are pure functions over plain inputs (phases + forecasts + a reserve snapshot), mirroring `computeSafeToSpend`'s "pure calculation, trivially testable" pattern — no Prisma client threaded through them.

## Year Plan page (`src/app/(app)/year-plan/page.tsx`)

- New primary nav item, "Year Plan."
- Header: plan name, date range, required/remaining reserve, recommended saving per cutoff.
- **Desktop:** a grouped table, one row per cutoff — Cutoff (date range + phase) | Income (reliable total, sub-labeled) | Expenses (essentials + payables/debt + other, summed) | Reserve (contribution/withdrawal that cutoff, signed) | Closing balance (projected) | Status (🟢 above buffer / 🟡 near buffer / 🔴 below buffer).
- **Mobile:** the same fields as stacked cards, one per cutoff.
- One chart below the table: projected closing balance per cutoff, line + shaded red zone below `minCashBuffer` (reuses the existing Recharts setup pattern from `src/components/reports/*-chart.tsx`).
- No scenario switcher this pass (single Expected plan only).

## Dashboard integration (fills Plan 21.4's deferred slots)

Two new compact sections on the Dashboard:
- **"Expected income"** — the next not-yet-passed `IncomeForecast` (by `expectedDate`), its source, amount, and status.
- **"Year Plan reserve"** — `remainingReserve` and `recommendedSavingPerCutoff` for the active Expected plan.

Both sections render nothing (not an error, not a placeholder card) when the user has no `YearPlan` yet — this is a genuinely new, opt-in feature area, not something every user is assumed to have set up.

## Testing

Every pure/domain function gets a mocked-Prisma or plain-input `.test.ts`, matching the project's existing convention (no test files for the page itself — verified manually against the live deployment). The reserve-math tests are built directly from the worked example above, plus edge cases: a plan with no home cutoffs yet (`requiredReserve` = 0), a plan that never dips below the buffer (`requiredReserve` = 0, not negative), and the `PARTIAL_ONBOARD`-exclusion-from-denominator case explicitly asserted.
