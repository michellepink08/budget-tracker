# Plan 3A.2: Recurring Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `RecurringRule` model (deferred since Plan 2A), due-date advancement, and a real Recurring page — replacing today's placeholder — with a "due now" review list (confirm/edit/skip) plus normal CRUD for the rules themselves.

**Architecture:** Same layering as every prior plan. The one behavior worth restating up front because it's easy to accidentally build wrong: **a recurring rule never posts a transaction by itself.** Its `nextDate` reaching today just makes it show up in the "due" list; a transaction is only created when the user explicitly confirms (optionally editing the amount/date first) — see the design spec's "Recurring transactions" section. Skipping an occurrence advances `nextDate` without creating anything.

**Tech Stack:** Same as prior plans. No new dependencies.

**Read first:** `docs/superpowers/specs/2026-09-12-budget-tracker-design.md` ("Recurring transactions" section) and Plan 2A (`src/lib/transaction-rules.ts`, `src/lib/transactions.ts` — this plan's `confirmRecurringOccurrence` calls `createExpenseLikeTransaction` from there; don't re-derive that logic).

**Environment reminder:** update `prisma/schema.prisma` **and** `prisma/schema.sql` together, apply with `npm run db:push` (this machine can't run `prisma db push`/`migrate` directly).

**Scope boundary:** a `RecurringRule` produces plain (non-transfer) transactions only — its schema has a single `accountId`, no `destinationAccountId`. Recurring transfers aren't part of this plan.

---

### Task 1: Constants — export `NON_TRANSFER_TYPES`, add `RECURRING_FREQUENCIES`

**Files:**
- Modify: `src/lib/validations/transaction.ts`, `src/lib/constants/financial.ts`

- [ ] **Step 1: Export the existing type list instead of duplicating it**

In `src/lib/validations/transaction.ts`, change:

```typescript
const NON_TRANSFER_TYPES = [
```

to:

```typescript
export const NON_TRANSFER_TYPES = [
```

(The recurring-rule validation schema in Task 5 imports this instead of
re-listing the same 7 transaction types.)

- [ ] **Step 2: Add `RECURRING_FREQUENCIES`**

In `src/lib/constants/financial.ts`, replace the trailing comment:

```typescript
// RECURRING_FREQUENCIES is Plan 3A.2 (RecurringRule doesn't exist yet).
```

with:

```typescript
export const RECURRING_FREQUENCIES = ["WEEKLY", "MONTHLY", "CUSTOM"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: export NON_TRANSFER_TYPES and add RECURRING_FREQUENCIES"
```

---

### Task 2: Add `RecurringRule` to the schema

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/schema.sql`

- [ ] **Step 1: Add relation fields**

`User` — add `recurringRules RecurringRule[]`.

`Account` — add `recurringRules RecurringRule[]`.

`Category` — add `recurringRules RecurringRule[]`.

`Subcategory` — add `recurringRules RecurringRule[]`.

- [ ] **Step 2: Append the new model**

```prisma
model RecurringRule {
  id              String   @id @default(cuid())
  userId          String
  name            String
  transactionType String
  amount          Int
  frequency       String
  intervalDays    Int?
  nextDate        DateTime
  accountId       String
  categoryId      String?
  subcategoryId   String?
  active          Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user        User         @relation(fields: [userId], references: [id])
  account     Account      @relation(fields: [accountId], references: [id])
  category    Category?    @relation(fields: [categoryId], references: [id])
  subcategory Subcategory? @relation(fields: [subcategoryId], references: [id])
}
```

- [ ] **Step 3: Add the matching table to `prisma/schema.sql`**

Append:

```sql
CREATE TABLE IF NOT EXISTS "RecurringRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "transactionType" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "frequency" TEXT NOT NULL,
  "intervalDays" INTEGER,
  "nextDate" DATETIME NOT NULL,
  "accountId" TEXT NOT NULL,
  "categoryId" TEXT,
  "subcategoryId" TEXT,
  "active" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("accountId") REFERENCES "Account" ("id"),
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id"),
  FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory" ("id")
);
CREATE INDEX IF NOT EXISTS "RecurringRule_userId_idx" ON "RecurringRule" ("userId");
```

- [ ] **Step 4: Regenerate the client and push the schema**

```bash
npm run db:generate
npm run db:push
```

Expected: output lists `Account, BudgetAllocation, BudgetPeriod, Category, RecurringRule, Subcategory, Transaction, User` as the tables.

- [ ] **Step 5: Verify the project still typechecks**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add RecurringRule to the schema"
```

---

### Task 3: Due-date advancement (pure function, with tests)

**Files:**
- Create: `src/lib/recurring-schedule.ts`
- Test: `src/lib/recurring-schedule.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/recurring-schedule.test.ts
import { describe, expect, it } from "vitest";
import { advanceNextDate } from "@/lib/recurring-schedule";

function d(year: number, month1based: number, day: number): Date {
  return new Date(year, month1based - 1, day);
}

describe("advanceNextDate — WEEKLY", () => {
  it("adds exactly 7 days", () => {
    expect(advanceNextDate(d(2026, 9, 12), "WEEKLY")).toEqual(d(2026, 9, 19));
  });
});

describe("advanceNextDate — MONTHLY", () => {
  it("adds one calendar month, same day", () => {
    expect(advanceNextDate(d(2026, 9, 15), "MONTHLY")).toEqual(d(2026, 10, 15));
  });

  it("rolls over the year boundary", () => {
    expect(advanceNextDate(d(2026, 12, 10), "MONTHLY")).toEqual(d(2027, 1, 10));
  });

  it("clamps to the last valid day in a shorter month", () => {
    expect(advanceNextDate(d(2026, 1, 31), "MONTHLY")).toEqual(d(2026, 2, 28));
  });

  it("clamps to Feb 29 in a leap year", () => {
    expect(advanceNextDate(d(2028, 1, 31), "MONTHLY")).toEqual(d(2028, 2, 29));
  });
});

describe("advanceNextDate — CUSTOM", () => {
  it("adds the given number of days", () => {
    expect(advanceNextDate(d(2026, 9, 12), "CUSTOM", 10)).toEqual(d(2026, 9, 22));
  });

  it("rejects a missing or non-positive intervalDays", () => {
    expect(() => advanceNextDate(d(2026, 9, 12), "CUSTOM")).toThrow();
    expect(() => advanceNextDate(d(2026, 9, 12), "CUSTOM", 0)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/recurring-schedule.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/recurring-schedule'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/recurring-schedule.ts
import type { RecurringFrequency } from "@/lib/constants/financial";

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/**
 * Given a recurring rule's current nextDate, returns the date it should
 * advance to after this occurrence is confirmed or skipped. MONTHLY
 * clamps to the last valid day of the target month (e.g. Jan 31 -> Feb 28)
 * — the same rule cycle.ts uses for the custom budget cycle.
 */
export function advanceNextDate(
  currentDate: Date,
  frequency: RecurringFrequency,
  intervalDays?: number,
): Date {
  if (frequency === "WEEKLY") {
    return new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7);
  }

  if (frequency === "MONTHLY") {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const day = currentDate.getDate();
    const total = month + 1;
    const nextYear = year + Math.floor(total / 12);
    const nextMonth = ((total % 12) + 12) % 12;
    const clampedDay = Math.min(day, daysInMonth(nextYear, nextMonth));
    return new Date(nextYear, nextMonth, clampedDay);
  }

  if (frequency === "CUSTOM") {
    if (!intervalDays || intervalDays < 1) {
      throw new Error("CUSTOM frequency requires a positive intervalDays");
    }
    return new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + intervalDays);
  }

  throw new Error(`Unknown frequency: ${frequency}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/recurring-schedule.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add recurring due-date advancement"
```

---

### Task 4: Recurring rule domain functions (with tests)

**Files:**
- Create: `src/lib/recurring.ts`
- Test: `src/lib/recurring.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/recurring.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  confirmRecurringOccurrence,
  createRecurringRule,
  listDueRecurringRules,
  listRecurringRules,
  skipRecurringOccurrence,
  updateRecurringRule,
} from "@/lib/recurring";

const SAMPLE_RULE = {
  id: "rule-1",
  userId: "user-1",
  name: "Monthly rent",
  transactionType: "EXPENSE",
  amount: 1500000,
  frequency: "MONTHLY",
  intervalDays: null,
  nextDate: new Date(2026, 8, 25),
  accountId: "acc-1",
  categoryId: "cat-1",
  subcategoryId: null,
  active: true,
};

function makeFakePrisma(rule: unknown = SAMPLE_RULE) {
  return {
    recurringRule: {
      create: vi.fn().mockResolvedValue({ id: "rule-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(rule),
      findMany: vi.fn().mockResolvedValue([]),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-1" }),
    },
  } as any;
}

describe("createRecurringRule", () => {
  it("creates a rule scoped to the given user", async () => {
    const prisma = makeFakePrisma();
    const input = {
      name: "Monthly rent",
      transactionType: "EXPENSE",
      amount: 1500000,
      frequency: "MONTHLY",
      nextDate: new Date(2026, 8, 25),
      accountId: "acc-1",
      categoryId: "cat-1",
    };

    await createRecurringRule(prisma, "user-1", input);

    expect(prisma.recurringRule.create).toHaveBeenCalledWith({ data: { userId: "user-1", ...input } });
  });
});

describe("updateRecurringRule", () => {
  it("updates only when the rule belongs to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updateRecurringRule(prisma, "user-1", "rule-1", { active: false });

    expect(result).toEqual({ ok: true });
    expect(prisma.recurringRule.updateMany).toHaveBeenCalledWith({
      where: { id: "rule-1", userId: "user-1" },
      data: { active: false },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.recurringRule.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateRecurringRule(prisma, "user-1", "rule-1", { active: false });

    expect(result).toEqual({ ok: false, error: "Recurring rule not found" });
  });
});

describe("listRecurringRules", () => {
  it("scopes to the user and excludes inactive rules by default", async () => {
    const prisma = makeFakePrisma();

    await listRecurringRules(prisma, "user-1");

    expect(prisma.recurringRule.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", active: true },
      orderBy: { nextDate: "asc" },
    });
  });

  it("includes inactive rules when asked", async () => {
    const prisma = makeFakePrisma();

    await listRecurringRules(prisma, "user-1", { includeInactive: true });

    expect(prisma.recurringRule.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { nextDate: "asc" },
    });
  });
});

describe("listDueRecurringRules", () => {
  it("scopes to the user, active rules whose nextDate has arrived", async () => {
    const prisma = makeFakePrisma();
    const asOf = new Date(2026, 8, 25);

    await listDueRecurringRules(prisma, "user-1", asOf);

    expect(prisma.recurringRule.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", active: true, nextDate: { lte: asOf } },
      orderBy: { nextDate: "asc" },
    });
  });
});

describe("confirmRecurringOccurrence", () => {
  it("creates a transaction from the rule and advances nextDate", async () => {
    const prisma = makeFakePrisma();

    const result = await confirmRecurringOccurrence(prisma, "user-1", 25, "rule-1", {});

    expect(result).toEqual({ ok: true });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("EXPENSE");
    expect(txnArgs.amount).toBe(-1500000);
    expect(txnArgs.accountId).toBe("acc-1");
    expect(txnArgs.description).toBe("Monthly rent");

    expect(prisma.recurringRule.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { nextDate: new Date(2026, 9, 25) },
    });
  });

  it("applies an amount/date override instead of the rule's defaults", async () => {
    const prisma = makeFakePrisma();

    await confirmRecurringOccurrence(prisma, "user-1", 25, "rule-1", {
      amount: 1600000,
      date: new Date(2026, 8, 26),
    });

    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.amount).toBe(-1600000);
    expect(txnArgs.date).toEqual(new Date(2026, 8, 26));
    // nextDate still advances from the rule's own nextDate, not the override date.
    expect(prisma.recurringRule.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { nextDate: new Date(2026, 9, 25) },
    });
  });

  it("reports not found for a rule the user doesn't own", async () => {
    const prisma = makeFakePrisma(null);

    const result = await confirmRecurringOccurrence(prisma, "user-1", 25, "rule-1", {});

    expect(result).toEqual({ ok: false, error: "Recurring rule not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});

describe("skipRecurringOccurrence", () => {
  it("advances nextDate without creating a transaction", async () => {
    const prisma = makeFakePrisma();

    const result = await skipRecurringOccurrence(prisma, "user-1", "rule-1");

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.recurringRule.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { nextDate: new Date(2026, 9, 25) },
    });
  });

  it("reports not found for a rule the user doesn't own", async () => {
    const prisma = makeFakePrisma(null);

    const result = await skipRecurringOccurrence(prisma, "user-1", "rule-1");

    expect(result).toEqual({ ok: false, error: "Recurring rule not found" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/recurring.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/recurring'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/recurring.ts
import type { PrismaClient } from "@prisma/client";
import { advanceNextDate } from "@/lib/recurring-schedule";
import { createExpenseLikeTransaction } from "@/lib/transactions";
import type { SignableTransactionType } from "@/lib/transaction-rules";
import type { RecurringFrequency } from "@/lib/constants/financial";

export type RecurringRuleInput = {
  name: string;
  transactionType: string;
  amount: number; // minor units, non-negative magnitude
  frequency: string;
  intervalDays?: number;
  nextDate: Date;
  accountId: string;
  categoryId?: string;
  subcategoryId?: string;
};

export type RecurringMutationResult = { ok: true } | { ok: false; error: string };

export async function createRecurringRule(
  prisma: Pick<PrismaClient, "recurringRule">,
  userId: string,
  input: RecurringRuleInput,
) {
  return prisma.recurringRule.create({ data: { userId, ...input } });
}

export async function updateRecurringRule(
  prisma: Pick<PrismaClient, "recurringRule">,
  userId: string,
  ruleId: string,
  input: Partial<RecurringRuleInput> & { active?: boolean },
): Promise<RecurringMutationResult> {
  const result = await prisma.recurringRule.updateMany({
    where: { id: ruleId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Recurring rule not found" };
  }
  return { ok: true };
}

export async function listRecurringRules(
  prisma: Pick<PrismaClient, "recurringRule">,
  userId: string,
  options: { includeInactive?: boolean } = {},
) {
  return prisma.recurringRule.findMany({
    where: {
      userId,
      ...(options.includeInactive ? {} : { active: true }),
    },
    orderBy: { nextDate: "asc" },
  });
}

export async function listDueRecurringRules(
  prisma: Pick<PrismaClient, "recurringRule">,
  userId: string,
  asOf: Date,
) {
  return prisma.recurringRule.findMany({
    where: { userId, active: true, nextDate: { lte: asOf } },
    orderBy: { nextDate: "asc" },
  });
}

export type ConfirmOverrides = { amount?: number; date?: Date };

export async function confirmRecurringOccurrence(
  prisma: Pick<PrismaClient, "recurringRule" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  ruleId: string,
  overrides: ConfirmOverrides,
): Promise<RecurringMutationResult> {
  const rule = await prisma.recurringRule.findFirst({ where: { id: ruleId, userId } });
  if (!rule) {
    return { ok: false, error: "Recurring rule not found" };
  }

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: rule.transactionType as SignableTransactionType,
    amount: overrides.amount ?? rule.amount,
    date: overrides.date ?? rule.nextDate,
    accountId: rule.accountId,
    categoryId: rule.categoryId ?? undefined,
    subcategoryId: rule.subcategoryId ?? undefined,
    description: rule.name,
  });

  const nextDate = advanceNextDate(
    rule.nextDate,
    rule.frequency as RecurringFrequency,
    rule.intervalDays ?? undefined,
  );
  await prisma.recurringRule.update({ where: { id: ruleId }, data: { nextDate } });

  return { ok: true };
}

export async function skipRecurringOccurrence(
  prisma: Pick<PrismaClient, "recurringRule">,
  userId: string,
  ruleId: string,
): Promise<RecurringMutationResult> {
  const rule = await prisma.recurringRule.findFirst({ where: { id: ruleId, userId } });
  if (!rule) {
    return { ok: false, error: "Recurring rule not found" };
  }

  const nextDate = advanceNextDate(
    rule.nextDate,
    rule.frequency as RecurringFrequency,
    rule.intervalDays ?? undefined,
  );
  await prisma.recurringRule.update({ where: { id: ruleId }, data: { nextDate } });

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/recurring.test.ts
```

Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add recurring rule domain functions"
```

---

### Task 5: Recurring rule validation schema (with tests)

**Files:**
- Create: `src/lib/validations/recurring.ts`
- Test: `src/lib/validations/recurring.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/validations/recurring.test.ts
import { describe, expect, it } from "vitest";
import { recurringRuleSchema } from "@/lib/validations/recurring";

describe("recurringRuleSchema", () => {
  it("accepts a valid MONTHLY rule", () => {
    const result = recurringRuleSchema.safeParse({
      name: "Monthly rent",
      transactionType: "EXPENSE",
      amount: 15000,
      frequency: "MONTHLY",
      nextDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });

  it("requires intervalDays when frequency is CUSTOM", () => {
    const result = recurringRuleSchema.safeParse({
      name: "Every 10 days",
      transactionType: "EXPENSE",
      amount: 500,
      frequency: "CUSTOM",
      nextDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts CUSTOM with a positive intervalDays", () => {
    const result = recurringRuleSchema.safeParse({
      name: "Every 10 days",
      transactionType: "EXPENSE",
      amount: 500,
      frequency: "CUSTOM",
      intervalDays: 10,
      nextDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative amount", () => {
    const result = recurringRuleSchema.safeParse({
      name: "Invalid",
      transactionType: "EXPENSE",
      amount: 0,
      frequency: "MONTHLY",
      nextDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/validations/recurring.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/validations/recurring'`.

- [ ] **Step 3: Write the schema**

```typescript
// src/lib/validations/recurring.ts
import { z } from "zod";
import { NON_TRANSFER_TYPES } from "@/lib/validations/transaction";
import { RECURRING_FREQUENCIES } from "@/lib/constants/financial";

export const recurringRuleSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    transactionType: z.enum(NON_TRANSFER_TYPES),
    amount: z.number().positive("Amount must be greater than zero"), // major units
    frequency: z.enum(RECURRING_FREQUENCIES),
    intervalDays: z.number().int().positive().optional(),
    nextDate: z.date(),
    accountId: z.string().min(1),
    categoryId: z.string().optional(),
    subcategoryId: z.string().optional(),
  })
  .refine((data) => data.frequency !== "CUSTOM" || data.intervalDays !== undefined, {
    message: "Custom frequency requires an interval (in days)",
    path: ["intervalDays"],
  });
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/validations/recurring.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add recurring rule validation schema"
```

---

### Task 6: Recurring server actions

**Files:**
- Create: `src/actions/recurring.actions.ts`

- [ ] **Step 1: Write the actions**

```typescript
// src/actions/recurring.actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recurringRuleSchema } from "@/lib/validations/recurring";
import {
  confirmRecurringOccurrence,
  createRecurringRule,
  skipRecurringOccurrence,
  updateRecurringRule,
} from "@/lib/recurring";
import { toMinorUnits } from "@/lib/money";

export type RecurringActionResult = { ok: true } | { ok: false; error: string };

function parseRecurringForm(formData: FormData) {
  return recurringRuleSchema.safeParse({
    name: formData.get("name"),
    transactionType: formData.get("transactionType"),
    amount: Number(formData.get("amount")),
    frequency: formData.get("frequency"),
    intervalDays: formData.get("intervalDays") ? Number(formData.get("intervalDays")) : undefined,
    nextDate: new Date(String(formData.get("nextDate"))),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || undefined,
    subcategoryId: formData.get("subcategoryId") || undefined,
  });
}

export async function createRecurringRuleAction(formData: FormData): Promise<RecurringActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = parseRecurringForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the recurring rule details" };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });

  await createRecurringRule(prisma, user.id, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, account.currency),
  });

  revalidatePath("/recurring");
  return { ok: true };
}

export async function updateRecurringRuleAction(
  ruleId: string,
  formData: FormData,
): Promise<RecurringActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const account = await prisma.account.findFirst({ where: { id: String(formData.get("accountId")) } });
  const currency = account?.currency ?? "PHP";

  const parsed = parseRecurringForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the recurring rule details" };

  const result = await updateRecurringRule(prisma, session.user.id, ruleId, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, currency),
  });

  if (result.ok) revalidatePath("/recurring");
  return result;
}

export async function toggleRecurringRuleActiveAction(
  ruleId: string,
  active: boolean,
): Promise<RecurringActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await updateRecurringRule(prisma, session.user.id, ruleId, { active });
  if (result.ok) revalidatePath("/recurring");
  return result;
}

export async function confirmRecurringOccurrenceAction(
  ruleId: string,
  formData: FormData,
): Promise<RecurringActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const overrideAmountRaw = formData.get("amount");
  const overrideDateRaw = formData.get("date");

  let overrideAmount: number | undefined;
  if (overrideAmountRaw) {
    const rule = await prisma.recurringRule.findFirst({ where: { id: ruleId, userId: user.id } });
    if (rule) {
      const account = await prisma.account.findUniqueOrThrow({ where: { id: rule.accountId } });
      overrideAmount = toMinorUnits(Number(overrideAmountRaw), account.currency);
    }
  }

  const result = await confirmRecurringOccurrence(prisma, user.id, user.cycleStartDay, ruleId, {
    amount: overrideAmount,
    date: overrideDateRaw ? new Date(String(overrideDateRaw)) : undefined,
  });

  if (result.ok) revalidatePath("/recurring");
  return result;
}

export async function skipRecurringOccurrenceAction(ruleId: string): Promise<RecurringActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await skipRecurringOccurrence(prisma, session.user.id, ruleId);
  if (result.ok) revalidatePath("/recurring");
  return result;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add recurring rule server actions"
```

---

### Task 7: Recurring page

**Files:**
- Create: `src/components/recurring/due-list.tsx`, `src/components/recurring/rule-form-dialog.tsx`, `src/components/recurring/rule-list.tsx`
- Modify: `src/app/(app)/recurring/page.tsx` (replaces the placeholder)

- [ ] **Step 1: Write the due-now list**

```tsx
// src/components/recurring/due-list.tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  confirmRecurringOccurrenceAction,
  skipRecurringOccurrenceAction,
} from "@/actions/recurring.actions";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DueRule = {
  id: string;
  name: string;
  amount: number;
  nextDate: Date;
  account: { name: string; currency: string };
};

export function DueList({ rules }: { rules: DueRule[] }) {
  const router = useRouter();

  if (rules.length === 0) {
    return null;
  }

  async function handleConfirm(ruleId: string, formData: FormData) {
    const result = await confirmRecurringOccurrenceAction(ruleId, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Transaction added");
    router.refresh();
  }

  async function handleSkip(ruleId: string) {
    const result = await skipRecurringOccurrenceAction(ruleId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Skipped");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h2 className="text-sm font-medium">Due now</h2>
      {rules.map((rule) => (
        <form
          key={rule.id}
          action={(formData) => handleConfirm(rule.id, formData)}
          className="flex flex-wrap items-center gap-2 rounded-md bg-background p-3"
        >
          <div className="mr-auto">
            <p className="font-medium">{rule.name}</p>
            <p className="text-sm text-muted-foreground">
              {rule.account.name} · due {rule.nextDate.toLocaleDateString()}
            </p>
          </div>
          <Input
            name="amount"
            type="number"
            step="0.01"
            defaultValue={toMajorUnits(rule.amount, rule.account.currency)}
            className="w-28"
          />
          <Input name="date" type="date" defaultValue={rule.nextDate.toISOString().slice(0, 10)} className="w-40" />
          <Button type="submit" size="sm">
            Confirm
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => handleSkip(rule.id)}>
            Skip
          </Button>
        </form>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write the rule form dialog (create + edit)**

```tsx
// src/components/recurring/rule-form-dialog.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createRecurringRuleAction, updateRecurringRuleAction } from "@/actions/recurring.actions";
import { NON_TRANSFER_TYPES } from "@/lib/validations/transaction";
import { RECURRING_FREQUENCIES } from "@/lib/constants/financial";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string };

type FormValues = {
  name: string;
  transactionType: (typeof NON_TRANSFER_TYPES)[number];
  amount: number;
  frequency: (typeof RECURRING_FREQUENCIES)[number];
  intervalDays: number;
  nextDate: string;
  accountId: string;
  categoryId: string;
};

type ExistingRule = {
  id: string;
  name: string;
  transactionType: string;
  amount: number;
  frequency: string;
  intervalDays: number | null;
  nextDate: Date;
  accountId: string;
  categoryId: string | null;
};

export function RuleFormDialog({
  accounts,
  categories,
  existing,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  existing?: ExistingRule;
}) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          name: existing.name,
          transactionType: existing.transactionType as FormValues["transactionType"],
          amount: toMajorUnits(
            existing.amount,
            accounts.find((a) => a.id === existing.accountId)?.currency ?? "PHP",
          ),
          frequency: existing.frequency as FormValues["frequency"],
          intervalDays: existing.intervalDays ?? 1,
          nextDate: existing.nextDate.toISOString().slice(0, 10),
          accountId: existing.accountId,
          categoryId: existing.categoryId ?? "",
        }
      : {
          name: "",
          transactionType: "EXPENSE",
          amount: 0,
          frequency: "MONTHLY",
          intervalDays: 1,
          nextDate: new Date().toISOString().slice(0, 10),
          accountId: accounts[0]?.id ?? "",
          categoryId: "",
        },
  });

  const frequency = watch("frequency");

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("transactionType", values.transactionType);
    formData.set("amount", String(values.amount));
    formData.set("frequency", values.frequency);
    if (values.frequency === "CUSTOM") formData.set("intervalDays", String(values.intervalDays));
    formData.set("nextDate", values.nextDate);
    formData.set("accountId", values.accountId);
    formData.set("categoryId", values.categoryId);

    const result = existing
      ? await updateRecurringRuleAction(existing.id, formData)
      : await createRecurringRuleAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Rule updated" : "Rule created");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit" : "Add recurring rule"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit recurring rule" : "Add recurring rule"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transactionType">Type</Label>
            <select
              id="transactionType"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("transactionType")}
            >
              {NON_TRANSFER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" type="number" step="0.01" {...register("amount", { valueAsNumber: true })} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="frequency">Frequency</Label>
            <select
              id="frequency"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("frequency")}
            >
              {RECURRING_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {frequency === "CUSTOM" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="intervalDays">Every N days</Label>
              <Input
                id="intervalDays"
                type="number"
                min="1"
                {...register("intervalDays", { valueAsNumber: true })}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nextDate">Next due date</Label>
            <Input id="nextDate" type="date" {...register("nextDate")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Account</Label>
            <select
              id="accountId"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("accountId")}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="categoryId">Category</Label>
            <select
              id="categoryId"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("categoryId")}
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write the all-rules list**

```tsx
// src/components/recurring/rule-list.tsx
import { formatMoney } from "@/lib/money";
import { RuleFormDialog } from "@/components/recurring/rule-form-dialog";
import { toggleRecurringRuleActiveAction } from "@/actions/recurring.actions";
import { Button } from "@/components/ui/button";

type RuleRow = {
  id: string;
  name: string;
  transactionType: string;
  amount: number;
  frequency: string;
  intervalDays: number | null;
  nextDate: Date;
  accountId: string;
  categoryId: string | null;
  active: boolean;
  account: { name: string; currency: string };
  category: { name: string } | null;
};

export function RuleList({
  rules,
  accounts,
  categories,
}: {
  rules: RuleRow[];
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string }[];
}) {
  if (rules.length === 0) {
    return <p className="text-muted-foreground">No recurring rules yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {rules.map((rule) => (
        <div key={rule.id} className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">{rule.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatMoney(rule.amount, rule.account.currency)} · {rule.frequency}
              {rule.intervalDays ? ` (every ${rule.intervalDays}d)` : ""} · {rule.account.name}
              {rule.category ? ` · ${rule.category.name}` : ""} · next {rule.nextDate.toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2">
            <RuleFormDialog accounts={accounts} categories={categories} existing={rule} />
            <form
              action={async () => {
                "use server";
                await toggleRecurringRuleActiveAction(rule.id, !rule.active);
              }}
            >
              <Button type="submit" variant="ghost">
                {rule.active ? "Deactivate" : "Activate"}
              </Button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Replace the placeholder page**

```tsx
// src/app/(app)/recurring/page.tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { listDueRecurringRules, listRecurringRules } from "@/lib/recurring";
import { DueList } from "@/components/recurring/due-list";
import { RuleFormDialog } from "@/components/recurring/rule-form-dialog";
import { RuleList } from "@/components/recurring/rule-list";

export default async function RecurringPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const [dueRules, allRules, accounts, categories] = await Promise.all([
    prisma.recurringRule.findMany({
      where: { userId: user.id, active: true, nextDate: { lte: new Date() } },
      orderBy: { nextDate: "asc" },
      include: { account: true },
    }),
    prisma.recurringRule.findMany({
      where: { userId: user.id },
      orderBy: { nextDate: "asc" },
      include: { account: true, category: true },
    }),
    listAccounts(prisma, user.id),
    listCategories(prisma, user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Recurring</h1>
        <RuleFormDialog accounts={accounts} categories={categories} />
      </div>

      <DueList rules={dueRules} />

      <RuleList rules={allRules} accounts={accounts} categories={categories} />
    </div>
  );
}
```

Note: this page queries `prisma.recurringRule` directly (with `include`)
rather than through `listDueRecurringRules`/`listRecurringRules` from
Task 4, for the same reason Plan 2B's transactions page bypassed
`listTransactions` — those functions intentionally stay plain
filter-builders without an `include` option. `listDueRecurringRules` and
`listRecurringRules` are already usable in Task 6's server actions;
duplicating their exact filter shape here is temporary until this page's
data-fetching needs stabilize.

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: replace Recurring placeholder with due-now review + rule CRUD"
```

---

### Task 8: Full verification

- [ ] **Step 1: Run the whole test suite**

```bash
npm test
```

Expected: every test passes, including the new recurring-schedule/
recurring/validation tests from Tasks 3-5, on top of everything from
prior plans.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Walk through the flow in a browser**

1. Log in as the demo user, go to Recurring.
2. Confirm it's empty (no rules exist yet — Plan 2A's seed data never
   created a `RecurringRule`).
3. Add a MONTHLY rule (e.g. "Monthly rent", EXPENSE, an amount, an
   account, a `nextDate` of today or earlier) — confirm it appears both
   in "Due now" (since its date has arrived) and in the full rule list.
4. In the "Due now" row, change the amount, then click Confirm — go to
   Transactions and confirm a new transaction was created with the
   overridden amount, not the rule's original one.
5. Confirm the rule's `nextDate` in the rule list advanced by one month
   from its original date, and it's no longer in "Due now".
6. Add a second rule with a due date of today; this time click Skip —
   confirm no transaction was created, but `nextDate` still advanced.
7. Add a CUSTOM-frequency rule; confirm the "every N days" field appears
   only for CUSTOM and the rule saves correctly.
8. Deactivate a rule; confirm it disappears from "Due now" even if its
   date is due, and reactivate it to confirm it reappears.

- [ ] **Step 4: Commit any fixes found**

```bash
git add -A
git commit -m "fix: address issues found during Plan 3A.2 verification"
```
