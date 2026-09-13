# Plan 37 — Financial Calendar Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Financial Calendar (aggregation function, `CustomReminder`, three-view page) per `docs/superpowers/specs/2026-09-13-financial-calendar-design.md`. All sources (including the Plan 22/23 ones) ship in this single pass since both are already shipped.

**Architecture:** One pure-ish aggregation function `listCalendarEntries` (`src/lib/calendar/aggregate.ts`) reads 8 existing models plus the new `CustomReminder`, maps each to a common `CalendarEntry` shape, and returns them sorted by date — no new writes. `src/lib/calendar/reminders.ts` holds `CustomReminder` CRUD. The Calendar page renders three views over the same data.

**Tech Stack:** Next.js Server Components, Prisma, Vitest with mocked Prisma clients.

---

## Task 1: Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] Add `model CustomReminder` (after `ReceiptImage`), and back-relations `customReminders CustomReminder[]` on `User` and `Transaction`:

```prisma
model CustomReminder {
  id                  String   @id @default(cuid())
  userId              String
  label               String
  date                DateTime
  amount              Int?
  state               String   @default("UPCOMING")
  linkedTransactionId String?
  createdAt           DateTime @default(now())

  user              User         @relation(fields: [userId], references: [id])
  linkedTransaction Transaction? @relation(fields: [linkedTransactionId], references: [id])
}
```

- [ ] `npm run db:generate`, `npx prisma validate` — both clean.
- [ ] Commit: `git commit -m "feat(calendar): add CustomReminder model"`

---

## Task 2: Reminder CRUD (`src/lib/calendar/reminders.ts`)

**Files:**
- Create: `src/lib/calendar/reminders.ts`
- Test: `src/lib/calendar/reminders.test.ts`

- [ ] **Step 1:** Write failing tests covering:
  - `createReminder` creates scoped to `userId`, `state: "UPCOMING"`
  - `markPaid` — ownership-checked; calls `createExpenseLikeTransaction` exactly once, sets `linkedTransactionId`/`state: "PAID"`
  - `skip` — ownership-checked; sets `state: "SKIPPED"`, never calls `createExpenseLikeTransaction`
  - `linkTransaction` — ownership-checked; sets `linkedTransactionId`/`state: "PAID"` without creating a transaction (assert `prisma.transaction.create` not called)
  - `deleteReminder` — ownership-checked hard delete

- [ ] **Step 2:** Run, verify fail.

- [ ] **Step 3:** Implement, mirroring `year-plan.ts`'s `assertOwned*` pattern:

```typescript
import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type ReminderMutationResult = { ok: true; id: string } | { ok: false; error: string };

export async function createReminder(
  prisma: Pick<PrismaClient, "customReminder">,
  userId: string,
  input: { label: string; date: Date; amount: number | null },
) {
  return prisma.customReminder.create({ data: { userId, state: "UPCOMING", ...input } });
}

async function assertOwnedReminder(
  prisma: Pick<PrismaClient, "customReminder">,
  userId: string,
  reminderId: string,
): Promise<boolean> {
  const reminder = await prisma.customReminder.findFirst({ where: { id: reminderId, userId } });
  return reminder !== null;
}

export async function markPaid(
  prisma: Pick<PrismaClient, "customReminder" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  reminderId: string,
  input: { accountId: string; categoryId: string | undefined },
): Promise<ReminderMutationResult> {
  const reminder = await prisma.customReminder.findFirst({ where: { id: reminderId, userId } });
  if (!reminder) return { ok: false, error: "Reminder not found" };

  const transaction = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "EXPENSE",
    amount: reminder.amount ?? 0,
    date: new Date(),
    accountId: input.accountId,
    categoryId: input.categoryId,
    description: reminder.label,
  });

  await prisma.customReminder.update({
    where: { id: reminderId },
    data: { linkedTransactionId: transaction.id, state: "PAID" },
  });
  return { ok: true, id: reminderId };
}

export async function skip(
  prisma: Pick<PrismaClient, "customReminder">,
  userId: string,
  reminderId: string,
): Promise<ReminderMutationResult> {
  if (!(await assertOwnedReminder(prisma, userId, reminderId))) {
    return { ok: false, error: "Reminder not found" };
  }
  await prisma.customReminder.update({ where: { id: reminderId }, data: { state: "SKIPPED" } });
  return { ok: true, id: reminderId };
}

export async function linkTransaction(
  prisma: Pick<PrismaClient, "customReminder">,
  userId: string,
  reminderId: string,
  transactionId: string,
): Promise<ReminderMutationResult> {
  if (!(await assertOwnedReminder(prisma, userId, reminderId))) {
    return { ok: false, error: "Reminder not found" };
  }
  await prisma.customReminder.update({
    where: { id: reminderId },
    data: { linkedTransactionId: transactionId, state: "PAID" },
  });
  return { ok: true, id: reminderId };
}

export async function deleteReminder(
  prisma: Pick<PrismaClient, "customReminder">,
  userId: string,
  reminderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await assertOwnedReminder(prisma, userId, reminderId))) {
    return { ok: false, error: "Reminder not found" };
  }
  await prisma.customReminder.delete({ where: { id: reminderId } });
  return { ok: true };
}
```

- [ ] **Step 4:** Run, verify pass. Commit: `git commit -m "feat(calendar): add CustomReminder domain functions"`

---

## Task 3: Aggregation function (`src/lib/calendar/aggregate.ts`)

**Files:**
- Create: `src/lib/calendar/aggregate.ts`
- Test: `src/lib/calendar/aggregate.test.ts`

- [ ] **Step 1:** Write failing tests — one per source type (assert the mapped `CalendarEntry` fields), plus:
  - A range-boundary test: an entry with `dueDate` exactly equal to `range.start` is included; one day before `range.start` is excluded (same for `range.end`).
  - The `RecurringPayable`/`Payable` dedup case: a `RecurringPayable` with `nextDueDate` equal to an existing `Payable.dueDate` that has `recurringPayableId` pointing at it → only the `Payable` entry appears, not a second `RECURRING_PAYABLE` entry for the same date.
  - The `CreditCard` month-projection case: `statementDay: 31` projects to Feb 28 in a non-leap February (mirror `advanceNextDate`'s existing clamping test in `recurring-schedule.test.ts` — read that test first and match its exact date-construction style).
  - `IncomeForecast` reports `state: "PAID"` once `actualTransactionId` is set, never `"OVERDUE"` even when `expectedDate` has passed.

- [ ] **Step 2:** Run, verify fail.

- [ ] **Step 3:** Implement. Read `src/lib/recurring-schedule.ts`'s `daysInMonth` helper and reuse it (don't reimplement month-clamping math). Structure:

```typescript
import type { PrismaClient } from "@prisma/client";

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

function inRange(date: Date, range: { start: Date; end: Date }): boolean {
  return date >= range.start && date <= range.end;
}

function deriveOverdue(date: Date, now: Date, baseState: "UPCOMING" | "PAID" | "SKIPPED"): CalendarEntry["state"] {
  if (baseState !== "UPCOMING") return baseState;
  return date < now ? "OVERDUE" : "UPCOMING";
}

// See daysInMonth in recurring-schedule.ts — reused here, not reimplemented.
function clampedMonthDate(year: number, monthIndex0: number, day: number, daysInMonthFn: (y: number, m: number) => number): Date {
  return new Date(year, monthIndex0, Math.min(day, daysInMonthFn(year, monthIndex0)));
}

type CalendarPrisma = Pick<
  PrismaClient,
  | "payable" | "creditCard" | "installmentPayment" | "installmentPurchase"
  | "recurringRule" | "recurringPayable" | "incomeForecast" | "shoppingList"
  | "yearPlanPhase" | "customReminder"
>;

export async function listCalendarEntries(
  prisma: CalendarPrisma,
  userId: string,
  range: { start: Date; end: Date },
  now: Date = new Date(),
): Promise<CalendarEntry[]> {
  const entries: CalendarEntry[] = [];

  const payables = await prisma.payable.findMany({
    where: { userId, dueDate: { gte: range.start, lte: range.end } },
  });
  for (const p of payables) {
    entries.push({
      id: `payable-${p.id}`, sourceType: "PAYABLE", sourceId: p.id, date: p.dueDate, label: p.name,
      amount: p.amount, confidence: "CONFIRMED",
      state: p.status === "PAID" ? "PAID" : deriveOverdue(p.dueDate, now, "UPCOMING"),
    });
  }

  // ... (installments, recurring rule/payable with dedup, income forecasts,
  // shopping trips, year plan phases, custom reminders, credit card
  // projection — implement each following the same pattern; see the spec
  // doc's per-source table for exact field mapping and confidence/state
  // rules for each. Import daysInMonth from "@/lib/recurring-schedule" —
  // if it isn't exported yet, export it there rather than duplicating it.)

  return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
}
```

Note: `daysInMonth` in `recurring-schedule.ts` is currently a private (non-exported) helper — export it from that file as part of this task rather than copy-pasting its logic here.

- [ ] **Step 4:** Run, verify pass — iterate until every source type's test and the dedup/projection/boundary tests all pass.
- [ ] **Step 5:** Commit: `git commit -m "feat(calendar): add listCalendarEntries aggregation function"`

---

## Task 4: Validations + server actions

**Files:**
- Create: `src/lib/validations/calendar.ts`
- Create: `src/actions/calendar.actions.ts`

- [ ] Zod schema for reminder creation (label/date/amount).
- [ ] Server actions: `createReminderAction`, `markReminderPaidAction`, `skipReminderAction`, `linkReminderTransactionAction`, `deleteReminderAction` — same `auth()` → parse → domain-call → `revalidatePath("/calendar")` shape used throughout this session. Also thin wrapper actions for the existing per-source mutations the Calendar page calls (`markPayablePaidAction` if bills.actions.ts doesn't already export one usable here — check first; likely it already does and can just be imported, not re-wrapped).
- [ ] Typecheck. Commit: `git commit -m "feat(calendar): add validations and server actions"`

---

## Task 5: Calendar page

**Files:**
- Create: `src/app/(app)/calendar/page.tsx`
- Create: `src/components/calendar/month-view.tsx`
- Create: `src/components/calendar/cutoff-view.tsx`
- Create: `src/components/calendar/agenda-view.tsx`
- Create: `src/components/calendar/calendar-entry-card.tsx`
- Create: `src/components/calendar/reminder-form-dialog.tsx`
- Modify: `src/components/nav/nav-links.ts`

- [ ] Nav link: `{ href: "/calendar", label: "Calendar", icon: CalendarDays }`.
- [ ] `calendar-entry-card.tsx`: renders one `CalendarEntry` — label, date, amount (or nothing if null), a status badge combining `state`+`confidence` per the spec's color rules (`success` only for `PAID`, `danger` for `OVERDUE`, muted/struck for `SKIPPED`), and the one action button appropriate to `sourceType` (per the spec's action table) or a plain link to the source page for types with no action.
- [ ] `agenda-view.tsx`: flat list, `range` = today through +30 days, grouped by date.
- [ ] `month-view.tsx`: standard month grid (reuse date-grid logic if this app already has one elsewhere for a calendar-like display; otherwise a straightforward 6-row grid is fine), each day cell listing that day's entries compactly.
- [ ] `cutoff-view.tsx`: fetches the active `BudgetPeriod` via `resolveBudgetPeriodForDate`, uses its start/end as `range`, renders as a grouped list (not a grid).
- [ ] `reminder-form-dialog.tsx`: simple create dialog (label/date/amount), following the established dialog pattern.
- [ ] `page.tsx`: tab/query-param switch between the three views (`?view=month|cutoff|agenda`, default `agenda`), fetches accounts/categories once for action dialogs that need them (mark-paid flows).
- [ ] Typecheck, lint, build. Commit: `git commit -m "feat(calendar): add the Calendar page (Month/Cutoff/Agenda views)"`

---

## Task 6: Final verification and deploy

- [ ] `npx vitest run` — all pass.
- [ ] `npx next build` — clean.
- [ ] `git push`.
- [ ] Live check (demo account): visit `/calendar`, confirm entries from existing demo data appear (payables, credit card dates, etc.) in Agenda view, switch to Month and Cutoff views, create a test `CustomReminder`, mark it paid (confirm exactly one transaction appears in Transactions), then delete the reminder and the test transaction to leave the demo account clean.
