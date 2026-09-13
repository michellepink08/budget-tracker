# Financial Calendar — Design

**Status:** Approved (roadmap states no open questions — Year Plan and Shopping are already shipped, so this pass folds in the roadmap's Phase 25.4 sources from the start rather than deferring them).

**Depends on:** Nothing new — every source model (`Payable`, `CreditCard`, `InstallmentPayment`, `RecurringRule`, `RecurringPayable`, `IncomeForecast`, `YearPlanPhase`, `ShoppingList`) already exists and is directly queryable, per the audit's explicit note. Only `CustomReminder` is new.

## Principle: no new source-of-truth duplication

`listCalendarEntries` is a pure **read-time aggregation** — it never writes a new dated record for anything that already has one. Every Calendar action calls an existing mutation exactly once (`markPayablePaid`, `createExpenseLikeTransaction`, setting `IncomeForecast.actualTransactionId`, etc.) — the Calendar is a read+action surface, never a second writer.

## Per-source occurrence shape (a design decision this pass had to pin down)

The master doc lists which models to read but doesn't say how many occurrences each contributes within a date range. Checked each source's actual mutation behavior to answer this precisely:

- **`Payable`**: already one row per concrete obligation — a plain range query on `dueDate`, no projection.
- **`InstallmentPayment`**: already one row per term, pre-generated at purchase creation — a plain range query on `dueDate`, no projection.
- **`RecurringRule`**: holds exactly one upcoming occurrence at a time (`nextDate`); confirming it posts a transaction directly and advances `nextDate` to the next one. So this source contributes **at most one entry** per rule per range (its current `nextDate`, if inside the range) — not a projected series.
- **`RecurringPayable`**: same one-occurrence-at-a-time shape (`nextDueDate`); confirming it creates a `Payable` (with `recurringPayableId` set) and advances `nextDueDate`. **Dedup rule**: if a `Payable` already exists with this rule's id and the same due date (i.e., already confirmed), skip the `RecurringPayable`'s own projected entry for that date — the `Payable` entry already represents it. In normal operation this rarely triggers (confirming immediately advances `nextDueDate` away from the confirmed date), but it's a real defensive case, not a hypothetical one, so it's tested explicitly.
- **`CreditCard`**: the one source that genuinely needs projection — `statementDay`/`paymentDueDay` are recurring day-of-month integers with no stored occurrence rows at all. For every calendar month that overlaps the query range, project one `CREDIT_CARD_STATEMENT` date and one `CREDIT_CARD_DUE` date (day-of-month clamped to that month's actual length, same clamping rule `advanceNextDate` already uses for `MONTHLY` recurrence).
- **`IncomeForecast`**: a plain range query on `expectedDate`.
- **`ShoppingList`**: a plain range query on `plannedDate` (only lists that have one set — most won't).
- **`YearPlanPhase`**: a plain range query on `startDate` (marks when a phase begins, e.g. "Home phase starts").
- **`CustomReminder`**: a plain range query on `date`.

## Schema

```prisma
model CustomReminder {
  id                  String   @id @default(cuid())
  userId              String
  label               String
  date                DateTime
  amount              Int?
  state               String   @default("UPCOMING") // UPCOMING | PAID | SKIPPED
  linkedTransactionId String?
  createdAt           DateTime @default(now())

  user              User          @relation(fields: [userId], references: [id])
  linkedTransaction Transaction?  @relation(fields: [linkedTransactionId], references: [id])
}
```

## Aggregation function (`src/lib/calendar/aggregate.ts`)

```ts
export type CalendarEntry = {
  id: string;
  sourceType:
    | "PAYABLE" | "CREDIT_CARD_STATEMENT" | "CREDIT_CARD_DUE" | "INSTALLMENT"
    | "RECURRING_RULE" | "RECURRING_PAYABLE" | "INCOME_FORECAST" | "SHOPPING_TRIP"
    | "YEAR_PLAN_PHASE" | "CUSTOM_REMINDER";
  sourceId: string;
  date: Date;
  label: string;
  amount: number | null;
  confidence: "CONFIRMED" | "EXPECTED" | "ESTIMATED" | "UNCERTAIN";
  state: "UPCOMING" | "PAID" | "SKIPPED" | "OVERDUE";
};

export async function listCalendarEntries(
  prisma, userId: string, range: { start: Date; end: Date },
): Promise<CalendarEntry[]>
```

**State derivation**: a source's own status maps directly where one exists (`Payable.status`, `InstallmentPayment.status`, `CustomReminder.state`). Where no explicit status exists (`RecurringRule`/`RecurringPayable`'s single occurrence, `CreditCard` projections, `IncomeForecast`, `ShoppingList`, `YearPlanPhase`), state is `UPCOMING` unless `date < now`, in which case it's `OVERDUE` — except `IncomeForecast`, which reports `PAID` once `actualTransactionId` is set (per the Year Plan design's "Confirmed — received" linkage), never `OVERDUE` (an unreceived expected paycheck isn't "overdue" in the same sense a bill is).

**Confidence**: `Payable`/`InstallmentPayment`/`CreditCard`/`CustomReminder` are always `CONFIRMED` (they're real, scheduled obligations). `RecurringRule`/`RecurringPayable` are `EXPECTED` (scheduled but not yet posted). `IncomeForecast` passes through its own `status` field unchanged (already `CONFIRMED`/`EXPECTED`/`ESTIMATED`/`UNCERTAIN`). `ShoppingList`/`YearPlanPhase` are `EXPECTED`.

## Domain functions (`src/lib/calendar/reminders.ts`)

- `createReminder(prisma, userId, input: {label, date, amount})`.
- `markPaid(prisma, userId, reminderId, input: {accountId, categoryId})` — creates a transaction via `createExpenseLikeTransaction` exactly once, sets `linkedTransactionId` and `state: "PAID"` (same one-call-to-an-existing-mutation rule as every other Calendar action).
- `skip(prisma, userId, reminderId)` — sets `state: "SKIPPED"`, no transaction.
- `linkTransaction(prisma, userId, reminderId, transactionId)` — for a reminder whose payment already happened as an ordinary transaction elsewhere; sets `linkedTransactionId`/`state: "PAID"` without creating a second transaction.
- `deleteReminder(prisma, userId, reminderId)` — ownership-checked hard delete (a reminder has no dependents, unlike Year Plan/Shopping rows).

## Calendar page (`src/app/(app)/calendar/page.tsx`)

Three view modes over the same `listCalendarEntries(range)` call, `range` computed differently per view:
- **Month view**: a standard month grid, `range` = the visible month (plus the leading/trailing days shown to fill the grid).
- **Cutoff view**: reuses `getCycleForDate`/`resolveBudgetPeriodForDate` — `range` = the active budget cycle's start/end, grouped into a list rather than a grid (matches how the app already thinks about "cutoffs" elsewhere, e.g. Dashboard's "Budgeted this cycle").
- **Agenda view**: a flat chronological list, `range` = a rolling window (e.g. next 30 days) — the simplest view, good default landing state.

**Visual states** reuse Plan 20's semantic tokens exactly: `success` (green) reserved for `PAID` only — never for `CONFIRMED` confidence, which the roadmap explicitly calls out as a distinct concept (confirmed-but-not-yet-paid is still an open obligation, not a success state). `OVERDUE` uses `danger`. `SKIPPED` renders muted/struck-through. `EXPECTED`/`ESTIMATED`/`UNCERTAIN` confidence get progressively lighter/dashed treatment on top of whichever state color applies.

**Actions**, each calling exactly one existing mutation:
| Entry type | Action | Calls |
|---|---|---|
| Payable | Mark as paid | `markPayablePaid` |
| RecurringRule | Confirm occurrence | `confirmRecurringOccurrence` |
| RecurringPayable | Confirm occurrence | `confirmRecurringPayableOccurrence` |
| IncomeForecast | Confirm received | sets `actualTransactionId` (existing Year Plan linkage) |
| InstallmentPayment | Mark as paid | `payInstallmentTerm` |
| CustomReminder | Mark paid / Skip / Link transaction | `markPaid`/`skip`/`linkTransaction` (new, this plan) |
| Any entry with a `sourceId` | Open linked record | a plain link to that record's existing page (Bills/Loans & Cards/Year Plan/etc.) — no new detail view built for this pass |

`CreditCard`/`ShoppingList`/`YearPlanPhase` entries are informational markers (statement/due dates, a planned trip, a phase boundary) with no "mark paid" action — they link to their source page instead.

## Testing

`listCalendarEntries`: one test per source type asserting the right `CalendarEntry` shape and field mapping, a range-boundary test (an entry exactly on `range.start`/`range.end` is included; one day outside either edge is excluded), the `RecurringPayable`/`Payable` dedup case, and the `CreditCard` month-projection test (a card with `statementDay: 31` in a 30-day month clamps correctly, mirroring `advanceNextDate`'s existing clamping test). `src/lib/calendar/reminders.ts` gets the same mocked-Prisma ownership-check test pattern used throughout this session. No test file for the page itself (presentational, matches project convention) — verified manually against the live deployment.
