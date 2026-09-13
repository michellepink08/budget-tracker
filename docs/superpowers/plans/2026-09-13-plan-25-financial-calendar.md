# Plan 25 — Financial Calendar (Roadmap)

**Design reference:** `docs/superpowers/specs/2026-09-13-major-features-design.md` section F. **Depends on:** Plan 22 (`IncomeForecast`/`YearPlanPhase`) and Plan 23 (`ShoppingList.plannedDate`) for full source coverage — can ship an earlier version covering only the already-shipped sources (Payable/CreditCard/Installment/RecurringRule/RecurringPayable) before those land, then extend.

**Status:** Awaiting approval. No new source-of-truth duplication — see the audit's explicit note that every payable/installment/recurring source already exists and is directly queryable.

## Phase 25.1 — Aggregation function (already-shipped sources only)

- `listCalendarEntries(prisma, userId, range)` unifying `Payable`, `CreditCard` (statement/due days projected into actual dates within `range`), `InstallmentPayment`, `RecurringRule`, `RecurringPayable` into one `CalendarEntry[]` shape (design doc section F).
- Tests: mocked-Prisma, one per source type, plus a "range boundary" test and a "no duplicate entries when a payable and its originating recurring-payable both exist" test (the dedup logic already proven in `restricted-funds.ts` is the model to follow, not necessarily the same code).

## Phase 25.2 — `CustomReminder` model + actions

- `CustomReminder` schema (design doc section F), migration.
- `createReminder`/`markPaid`/`skip`/`linkTransaction` domain functions.

## Phase 25.3 — Calendar page: Month / Cutoff / Agenda views

- New primary nav item, `src/app/(app)/calendar/page.tsx`.
- Three view modes over the same `listCalendarEntries` data; Cutoff view reuses `getCycleForDate`/`resolveBudgetPeriodForDate` for its boundaries (no new cutoff math).
- Visual distinction for Confirmed/Expected/Estimated/Uncertain/Paid/Skipped/Overdue states (ties into Plan 20's semantic tokens — success green only for Paid, not for e.g. "Confirmed").
- Actions: Mark as paid / Create-link transaction / Confirm received income / Edit estimate / Reschedule / Skip / Open linked record — each calls the **existing** mutation for its source type (`markPayablePaid`, `createExpenseLikeTransaction`, `IncomeForecast` linking) exactly once; no new posting logic invented here.

## Phase 25.4 — Extend aggregation once Year Plan / Shopping land

- Add `IncomeForecast`, `YearPlanPhase`, `ShoppingList.plannedDate` as additional `listCalendarEntries` sources (Plan 22/23 dependency) — purely additive to the Phase 25.1 function's source list, no shape change.

## Explicitly out of scope (per the request)

- Push notifications, SMS, or external-calendar (Google/iCal) synchronization — not planned in any phase here.

## Open questions before Phase 25.1 starts

None — this plan's scope is fully determined by already-shipped source models; no product decisions are pending.
