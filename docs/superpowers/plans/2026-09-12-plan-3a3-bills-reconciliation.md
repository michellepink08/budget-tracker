# Plan 3A.3: Bills, Transfer Recommendations & Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The last piece of the original "Plan 3A" scope — `Payable`/`RecurringPayable` schema, a real Bills page (due-this-week review list, full CRUD, mark-as-paid), a computed "recommended funding transfer" suggestion, and account reconciliation (`previewReconciliation`/`applyReconciliation` plus preview + confirm UI on the Accounts page).

**Architecture:** Same layering as every prior plan — dependency-injected domain functions in `src/lib/`, unit-tested against mocked Prisma clients, called from thin `"use server"` actions in `src/actions/`, rendered by server components + small client dialogs. Four independent-but-related pieces, built in this order because each later one leans on an earlier one:

1. **Payables** — a bill is a `Payable` row (name, amount, due date, paying account, optional category, status). Marking one paid creates a normal `EXPENSE` transaction via the existing `createExpenseLikeTransaction` (Plan 2A/3A.2) — bills don't invent a new way to move money, they just schedule an ordinary expense.
2. **Recurring payables** — `RecurringPayable` is to `Payable` what `RecurringRule` (Plan 3A.2) is to `Transaction`: a template with a `nextDueDate` that never auto-posts. Confirming a due recurring payable **generates a new `Payable`** (not a transaction directly) — the bill still has to be marked paid separately. Reuses `advanceNextDate` from Plan 3A.2 as-is.
3. **Transfer recommendations** — a pure computation, no new schema: "does the user's primary funding account have enough to cover what's due soon, and if not, where could the shortfall come from?" Surfaced as a banner on the Bills page; the user still creates the actual transfer manually (via the existing transfer flow) if they act on it.
4. **Reconciliation** — per the design spec's "Account-balance rules": never silently overwrite a balance. `previewReconciliation` shows the calculated-vs-actual difference; `applyReconciliation` only writes anything on explicit confirmation, and what it writes is a normal `BALANCE_ADJUSTMENT` transaction row (already a valid `Transaction.type` since Plan 2A) — no separate audit-trail model needed, because the adjustment transaction *is* the audit trail.

**Tech Stack:** Same as prior plans. No new dependencies.

**Read first:** `docs/superpowers/specs/2026-09-12-budget-tracker-design.md` ("Account-balance rules" section for reconciliation semantics; "Core differentiators" #4–#5 and #8 for bills/recommendations/reconciliation); Plan 3A.2's plan doc and `src/lib/recurring.ts`/`src/lib/recurring-schedule.ts` (this plan's `RecurringPayable` mirrors that shape exactly); `src/lib/transactions.ts` (`createExpenseLikeTransaction`, reused unchanged for "mark paid"); `src/lib/account-balance.ts` (`computeAccountBalance`, reused unchanged for both reconciliation and funding recommendations).

**Environment reminder:** update `prisma/schema.prisma` **and** `prisma/schema.sql` together, apply with `npm run db:push` (this machine can't run `prisma db push`/`migrate` directly).

**Scope boundary — explicitly NOT in this plan:** no `AccountReconciliation` audit-trail model (the spec calls this out as something to add only "if richer reconciliation history turns out to be needed" — a `BALANCE_ADJUSTMENT` transaction is sufficient for now); no automatic transfer execution from the recommendation banner (the user still uses the existing manual transfer flow); no loans/credit cards/installments (that's Plan 3B).

---

### Task 1: Constants — add `PAYABLE_STATUSES`

**Files:**
- Modify: `src/lib/constants/financial.ts`

- [ ] **Step 1: Add the new fixed value set**

Append to `src/lib/constants/financial.ts`:

```typescript
export const PAYABLE_STATUSES = ["PENDING", "PAID"] as const;
export type PayableStatus = (typeof PAYABLE_STATUSES)[number];
```

(`RecurringPayable` reuses the existing `RECURRING_FREQUENCIES`/`RecurringFrequency` — no new frequency set needed.)

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add PAYABLE_STATUSES constant"
```

---

### Task 2: Add `Payable` and `RecurringPayable` to the schema

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/schema.sql`

- [ ] **Step 1: Add relation fields**

`User` — add:

```prisma
  payables          Payable[]
  recurringPayables RecurringPayable[]
```

`Account` — add:

```prisma
  payables          Payable[]
  recurringPayables RecurringPayable[]
```

`Category` — add:

```prisma
  payables          Payable[]
  recurringPayables RecurringPayable[]
```

- [ ] **Step 2: Append the new models**

```prisma
model Payable {
  id                 String    @id @default(cuid())
  userId             String
  name               String
  amount             Int       // minor units
  dueDate            DateTime
  accountId          String
  categoryId         String?
  status             String    @default("PENDING") // PENDING | PAID
  paidTransactionId  String?
  recurringPayableId String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  user             User              @relation(fields: [userId], references: [id])
  account          Account           @relation(fields: [accountId], references: [id])
  category         Category?         @relation(fields: [categoryId], references: [id])
  recurringPayable RecurringPayable? @relation(fields: [recurringPayableId], references: [id])
}

model RecurringPayable {
  id           String   @id @default(cuid())
  userId       String
  name         String
  amount       Int      // minor units
  frequency    String   // WEEKLY | MONTHLY | CUSTOM
  intervalDays Int?
  nextDueDate  DateTime
  accountId    String
  categoryId   String?
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user     User      @relation(fields: [userId], references: [id])
  account  Account   @relation(fields: [accountId], references: [id])
  category Category? @relation(fields: [categoryId], references: [id])
  payables Payable[]
}
```

- [ ] **Step 3: Add the matching tables to `prisma/schema.sql`**

Append:

```sql
CREATE TABLE IF NOT EXISTS "RecurringPayable" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "frequency" TEXT NOT NULL,
  "intervalDays" INTEGER,
  "nextDueDate" DATETIME NOT NULL,
  "accountId" TEXT NOT NULL,
  "categoryId" TEXT,
  "active" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("accountId") REFERENCES "Account" ("id"),
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id")
);
CREATE INDEX IF NOT EXISTS "RecurringPayable_userId_idx" ON "RecurringPayable" ("userId");

CREATE TABLE IF NOT EXISTS "Payable" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "dueDate" DATETIME NOT NULL,
  "accountId" TEXT NOT NULL,
  "categoryId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paidTransactionId" TEXT,
  "recurringPayableId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("accountId") REFERENCES "Account" ("id"),
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id"),
  FOREIGN KEY ("recurringPayableId") REFERENCES "RecurringPayable" ("id")
);
CREATE INDEX IF NOT EXISTS "Payable_userId_idx" ON "Payable" ("userId");
CREATE INDEX IF NOT EXISTS "Payable_accountId_idx" ON "Payable" ("accountId");
```

Note: `RecurringPayable` must be created before `Payable` in `schema.sql` (Payable's foreign key references it) — append them to the file in that order.

- [ ] **Step 4: Apply the schema**

```bash
npm run db:push
```

Expected: `Payable` and `RecurringPayable` tables created, no errors.

- [ ] **Step 5: Regenerate the Prisma client and verify compile**

```bash
npx prisma generate
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Payable and RecurringPayable models"
```

---

### Task 3: Domain — `src/lib/payables.ts`

**Files:**
- Create: `src/lib/payables.ts`
- Test: `src/lib/payables.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/payables.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  createPayable,
  listDuePayables,
  listPayables,
  markPayablePaid,
  updatePayable,
} from "@/lib/payables";

const SAMPLE_PAYABLE = {
  id: "payable-1",
  userId: "user-1",
  name: "Electric bill",
  amount: 250000,
  dueDate: new Date(2026, 8, 20),
  accountId: "acc-1",
  categoryId: "cat-1",
  status: "PENDING",
  paidTransactionId: null,
  recurringPayableId: null,
};

function makeFakePrisma(payable: unknown = SAMPLE_PAYABLE) {
  return {
    payable: {
      create: vi.fn().mockResolvedValue({ id: "payable-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(payable),
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

describe("createPayable", () => {
  it("creates a payable scoped to the given user", async () => {
    const prisma = makeFakePrisma();
    const input = {
      name: "Electric bill",
      amount: 250000,
      dueDate: new Date(2026, 8, 20),
      accountId: "acc-1",
      categoryId: "cat-1",
    };

    await createPayable(prisma, "user-1", input);

    expect(prisma.payable.create).toHaveBeenCalledWith({ data: { userId: "user-1", ...input } });
  });
});

describe("updatePayable", () => {
  it("updates only a pending payable belonging to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updatePayable(prisma, "user-1", "payable-1", { amount: 300000 });

    expect(result).toEqual({ ok: true });
    expect(prisma.payable.updateMany).toHaveBeenCalledWith({
      where: { id: "payable-1", userId: "user-1", status: "PENDING" },
      data: { amount: 300000 },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.payable.updateMany.mockResolvedValue({ count: 0 });

    const result = await updatePayable(prisma, "user-1", "payable-1", { amount: 300000 });

    expect(result).toEqual({ ok: false, error: "Payable not found" });
  });
});

describe("listPayables", () => {
  it("scopes to the user and excludes paid payables by default", async () => {
    const prisma = makeFakePrisma();

    await listPayables(prisma, "user-1");

    expect(prisma.payable.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "PENDING" },
      orderBy: { dueDate: "asc" },
    });
  });

  it("includes paid payables when asked", async () => {
    const prisma = makeFakePrisma();

    await listPayables(prisma, "user-1", { includePaid: true });

    expect(prisma.payable.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { dueDate: "asc" },
    });
  });
});

describe("listDuePayables", () => {
  it("scopes to the user, pending payables whose dueDate has arrived", async () => {
    const prisma = makeFakePrisma();
    const asOf = new Date(2026, 8, 25);

    await listDuePayables(prisma, "user-1", asOf);

    expect(prisma.payable.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "PENDING", dueDate: { lte: asOf } },
      orderBy: { dueDate: "asc" },
    });
  });
});

describe("markPayablePaid", () => {
  it("creates an expense transaction and marks the payable paid", async () => {
    const prisma = makeFakePrisma();

    const result = await markPayablePaid(prisma, "user-1", 25, "payable-1", {});

    expect(result).toEqual({ ok: true });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("EXPENSE");
    expect(txnArgs.amount).toBe(-250000);
    expect(txnArgs.accountId).toBe("acc-1");
    expect(txnArgs.description).toBe("Electric bill");

    expect(prisma.payable.update).toHaveBeenCalledWith({
      where: { id: "payable-1" },
      data: { status: "PAID", paidTransactionId: "txn-1" },
    });
  });

  it("applies an amount/date override instead of the payable's defaults", async () => {
    const prisma = makeFakePrisma();

    await markPayablePaid(prisma, "user-1", 25, "payable-1", {
      amount: 260000,
      date: new Date(2026, 8, 19),
    });

    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.amount).toBe(-260000);
    expect(txnArgs.date).toEqual(new Date(2026, 8, 19));
  });

  it("reports not found for a payable the user doesn't own, or already paid", async () => {
    const prisma = makeFakePrisma(null);

    const result = await markPayablePaid(prisma, "user-1", 25, "payable-1", {});

    expect(result).toEqual({ ok: false, error: "Payable not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/payables.test.ts
```

Expected: FAIL — `src/lib/payables.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/payables.ts
import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type PayableInput = {
  name: string;
  amount: number; // minor units, non-negative magnitude
  dueDate: Date;
  accountId: string;
  categoryId?: string;
};

export type PayableMutationResult = { ok: true } | { ok: false; error: string };

export async function createPayable(
  prisma: Pick<PrismaClient, "payable">,
  userId: string,
  input: PayableInput,
) {
  return prisma.payable.create({ data: { userId, ...input } });
}

export async function updatePayable(
  prisma: Pick<PrismaClient, "payable">,
  userId: string,
  payableId: string,
  input: Partial<PayableInput>,
): Promise<PayableMutationResult> {
  // Scoped to PENDING — a paid payable's history shouldn't be edited out
  // from under its already-created transaction.
  const result = await prisma.payable.updateMany({
    where: { id: payableId, userId, status: "PENDING" },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Payable not found" };
  }
  return { ok: true };
}

export async function listPayables(
  prisma: Pick<PrismaClient, "payable">,
  userId: string,
  options: { includePaid?: boolean } = {},
) {
  return prisma.payable.findMany({
    where: {
      userId,
      ...(options.includePaid ? {} : { status: "PENDING" }),
    },
    orderBy: { dueDate: "asc" },
  });
}

export async function listDuePayables(
  prisma: Pick<PrismaClient, "payable">,
  userId: string,
  asOf: Date,
) {
  return prisma.payable.findMany({
    where: { userId, status: "PENDING", dueDate: { lte: asOf } },
    orderBy: { dueDate: "asc" },
  });
}

export type MarkPaidOverrides = { amount?: number; date?: Date };

export async function markPayablePaid(
  prisma: Pick<PrismaClient, "payable" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  payableId: string,
  overrides: MarkPaidOverrides,
): Promise<PayableMutationResult> {
  const payable = await prisma.payable.findFirst({
    where: { id: payableId, userId, status: "PENDING" },
  });
  if (!payable) {
    return { ok: false, error: "Payable not found" };
  }

  const transaction = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "EXPENSE",
    amount: overrides.amount ?? payable.amount,
    date: overrides.date ?? new Date(),
    accountId: payable.accountId,
    categoryId: payable.categoryId ?? undefined,
    description: payable.name,
  });

  await prisma.payable.update({
    where: { id: payableId },
    data: { status: "PAID", paidTransactionId: transaction.id },
  });

  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/payables.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add payables domain functions"
```

---

### Task 4: Domain — `src/lib/recurring-payables.ts`

**Files:**
- Create: `src/lib/recurring-payables.ts`
- Test: `src/lib/recurring-payables.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/recurring-payables.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  confirmRecurringPayableOccurrence,
  createRecurringPayable,
  listDueRecurringPayables,
  listRecurringPayables,
  skipRecurringPayableOccurrence,
  updateRecurringPayable,
} from "@/lib/recurring-payables";

const SAMPLE_RULE = {
  id: "rp-1",
  userId: "user-1",
  name: "Internet bill",
  amount: 199900,
  frequency: "MONTHLY",
  intervalDays: null,
  nextDueDate: new Date(2026, 8, 25),
  accountId: "acc-1",
  categoryId: "cat-1",
  active: true,
};

function makeFakePrisma(rule: unknown = SAMPLE_RULE) {
  return {
    recurringPayable: {
      create: vi.fn().mockResolvedValue({ id: "rp-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(rule),
      findMany: vi.fn().mockResolvedValue([]),
    },
    payable: {
      create: vi.fn().mockResolvedValue({ id: "payable-new" }),
    },
  } as any;
}

describe("createRecurringPayable", () => {
  it("creates a rule scoped to the given user", async () => {
    const prisma = makeFakePrisma();
    const input = {
      name: "Internet bill",
      amount: 199900,
      frequency: "MONTHLY",
      nextDueDate: new Date(2026, 8, 25),
      accountId: "acc-1",
      categoryId: "cat-1",
    };

    await createRecurringPayable(prisma, "user-1", input);

    expect(prisma.recurringPayable.create).toHaveBeenCalledWith({
      data: { userId: "user-1", ...input },
    });
  });
});

describe("updateRecurringPayable", () => {
  it("updates only when the rule belongs to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updateRecurringPayable(prisma, "user-1", "rp-1", { active: false });

    expect(result).toEqual({ ok: true });
    expect(prisma.recurringPayable.updateMany).toHaveBeenCalledWith({
      where: { id: "rp-1", userId: "user-1" },
      data: { active: false },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.recurringPayable.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateRecurringPayable(prisma, "user-1", "rp-1", { active: false });

    expect(result).toEqual({ ok: false, error: "Recurring payable not found" });
  });
});

describe("listRecurringPayables", () => {
  it("scopes to the user and excludes inactive rules by default", async () => {
    const prisma = makeFakePrisma();

    await listRecurringPayables(prisma, "user-1");

    expect(prisma.recurringPayable.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", active: true },
      orderBy: { nextDueDate: "asc" },
    });
  });
});

describe("listDueRecurringPayables", () => {
  it("scopes to the user, active rules whose nextDueDate has arrived", async () => {
    const prisma = makeFakePrisma();
    const asOf = new Date(2026, 8, 25);

    await listDueRecurringPayables(prisma, "user-1", asOf);

    expect(prisma.recurringPayable.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", active: true, nextDueDate: { lte: asOf } },
      orderBy: { nextDueDate: "asc" },
    });
  });
});

describe("confirmRecurringPayableOccurrence", () => {
  it("generates a Payable from the rule and advances nextDueDate", async () => {
    const prisma = makeFakePrisma();

    const result = await confirmRecurringPayableOccurrence(prisma, "user-1", "rp-1", {});

    expect(result).toEqual({ ok: true });
    const payableArgs = prisma.payable.create.mock.calls[0][0].data;
    expect(payableArgs.name).toBe("Internet bill");
    expect(payableArgs.amount).toBe(199900);
    expect(payableArgs.accountId).toBe("acc-1");
    expect(payableArgs.recurringPayableId).toBe("rp-1");

    expect(prisma.recurringPayable.update).toHaveBeenCalledWith({
      where: { id: "rp-1" },
      data: { nextDueDate: new Date(2026, 9, 25) },
    });
  });

  it("applies an amount/dueDate override instead of the rule's defaults", async () => {
    const prisma = makeFakePrisma();

    await confirmRecurringPayableOccurrence(prisma, "user-1", "rp-1", {
      amount: 210000,
      dueDate: new Date(2026, 8, 26),
    });

    const payableArgs = prisma.payable.create.mock.calls[0][0].data;
    expect(payableArgs.amount).toBe(210000);
    expect(payableArgs.dueDate).toEqual(new Date(2026, 8, 26));
  });

  it("reports not found for a rule the user doesn't own", async () => {
    const prisma = makeFakePrisma(null);

    const result = await confirmRecurringPayableOccurrence(prisma, "user-1", "rp-1", {});

    expect(result).toEqual({ ok: false, error: "Recurring payable not found" });
    expect(prisma.payable.create).not.toHaveBeenCalled();
  });
});

describe("skipRecurringPayableOccurrence", () => {
  it("advances nextDueDate without generating a payable", async () => {
    const prisma = makeFakePrisma();

    const result = await skipRecurringPayableOccurrence(prisma, "user-1", "rp-1");

    expect(result).toEqual({ ok: true });
    expect(prisma.payable.create).not.toHaveBeenCalled();
    expect(prisma.recurringPayable.update).toHaveBeenCalledWith({
      where: { id: "rp-1" },
      data: { nextDueDate: new Date(2026, 9, 25) },
    });
  });

  it("reports not found for a rule the user doesn't own", async () => {
    const prisma = makeFakePrisma(null);

    const result = await skipRecurringPayableOccurrence(prisma, "user-1", "rp-1");

    expect(result).toEqual({ ok: false, error: "Recurring payable not found" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/recurring-payables.test.ts
```

Expected: FAIL — `src/lib/recurring-payables.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/recurring-payables.ts
import type { PrismaClient } from "@prisma/client";
import { advanceNextDate } from "@/lib/recurring-schedule";
import type { RecurringFrequency } from "@/lib/constants/financial";

export type RecurringPayableInput = {
  name: string;
  amount: number; // minor units
  frequency: string;
  intervalDays?: number;
  nextDueDate: Date;
  accountId: string;
  categoryId?: string;
};

export type RecurringPayableMutationResult = { ok: true } | { ok: false; error: string };

export async function createRecurringPayable(
  prisma: Pick<PrismaClient, "recurringPayable">,
  userId: string,
  input: RecurringPayableInput,
) {
  return prisma.recurringPayable.create({ data: { userId, ...input } });
}

export async function updateRecurringPayable(
  prisma: Pick<PrismaClient, "recurringPayable">,
  userId: string,
  ruleId: string,
  input: Partial<RecurringPayableInput> & { active?: boolean },
): Promise<RecurringPayableMutationResult> {
  const result = await prisma.recurringPayable.updateMany({
    where: { id: ruleId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Recurring payable not found" };
  }
  return { ok: true };
}

export async function listRecurringPayables(
  prisma: Pick<PrismaClient, "recurringPayable">,
  userId: string,
  options: { includeInactive?: boolean } = {},
) {
  return prisma.recurringPayable.findMany({
    where: {
      userId,
      ...(options.includeInactive ? {} : { active: true }),
    },
    orderBy: { nextDueDate: "asc" },
  });
}

export async function listDueRecurringPayables(
  prisma: Pick<PrismaClient, "recurringPayable">,
  userId: string,
  asOf: Date,
) {
  return prisma.recurringPayable.findMany({
    where: { userId, active: true, nextDueDate: { lte: asOf } },
    orderBy: { nextDueDate: "asc" },
  });
}

export type ConfirmPayableOverrides = { amount?: number; dueDate?: Date };

// Unlike RecurringRule's confirm (which posts a Transaction directly), a
// recurring payable's occurrence becomes a new Payable — the bill still
// has to be marked paid separately (src/lib/payables.ts).
export async function confirmRecurringPayableOccurrence(
  prisma: Pick<PrismaClient, "recurringPayable" | "payable">,
  userId: string,
  ruleId: string,
  overrides: ConfirmPayableOverrides,
): Promise<RecurringPayableMutationResult> {
  const rule = await prisma.recurringPayable.findFirst({ where: { id: ruleId, userId } });
  if (!rule) {
    return { ok: false, error: "Recurring payable not found" };
  }

  await prisma.payable.create({
    data: {
      userId,
      name: rule.name,
      amount: overrides.amount ?? rule.amount,
      dueDate: overrides.dueDate ?? rule.nextDueDate,
      accountId: rule.accountId,
      categoryId: rule.categoryId ?? undefined,
      recurringPayableId: rule.id,
    },
  });

  const nextDueDate = advanceNextDate(
    rule.nextDueDate,
    rule.frequency as RecurringFrequency,
    rule.intervalDays ?? undefined,
  );
  await prisma.recurringPayable.update({ where: { id: ruleId }, data: { nextDueDate } });

  return { ok: true };
}

export async function skipRecurringPayableOccurrence(
  prisma: Pick<PrismaClient, "recurringPayable">,
  userId: string,
  ruleId: string,
): Promise<RecurringPayableMutationResult> {
  const rule = await prisma.recurringPayable.findFirst({ where: { id: ruleId, userId } });
  if (!rule) {
    return { ok: false, error: "Recurring payable not found" };
  }

  const nextDueDate = advanceNextDate(
    rule.nextDueDate,
    rule.frequency as RecurringFrequency,
    rule.intervalDays ?? undefined,
  );
  await prisma.recurringPayable.update({ where: { id: ruleId }, data: { nextDueDate } });

  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/recurring-payables.test.ts
```

Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add recurring payables domain functions"
```

---

### Task 5: Domain — `src/lib/reconciliation.ts`

**Files:**
- Create: `src/lib/reconciliation.ts`
- Test: `src/lib/reconciliation.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/reconciliation.test.ts
import { describe, expect, it, vi } from "vitest";
import { applyReconciliation, previewReconciliation } from "@/lib/reconciliation";

function makeFakePrisma(options: { account?: unknown; transactions?: unknown[] } = {}) {
  const account = options.account ?? { id: "acc-1", userId: "user-1", openingBalance: 500000 };
  const transactions = options.transactions ?? [];
  return {
    account: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(account),
      findFirst: vi.fn().mockResolvedValue(account),
    },
    transaction: {
      findMany: vi.fn().mockResolvedValue(transactions),
      create: vi.fn().mockResolvedValue({ id: "txn-adjust" }),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
  } as any;
}

describe("previewReconciliation", () => {
  it("returns the calculated balance, actual balance, and the difference", async () => {
    const prisma = makeFakePrisma({
      transactions: [{ accountId: "acc-1", amount: -100000 }], // balance = 400000
    });

    const preview = await previewReconciliation(prisma, "acc-1", 420000);

    expect(preview).toEqual({
      calculatedBalance: 400000,
      actualBalance: 420000,
      difference: 20000,
    });
  });
});

describe("applyReconciliation", () => {
  it("reports already balanced and writes nothing when there is no difference", async () => {
    const prisma = makeFakePrisma({ transactions: [] }); // balance = 500000

    const result = await applyReconciliation(prisma, "user-1", 25, "acc-1", 500000);

    expect(result).toEqual({ ok: true, alreadyBalanced: true });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("creates a signed BALANCE_ADJUSTMENT transaction closing the gap", async () => {
    const prisma = makeFakePrisma({ transactions: [] }); // balance = 500000

    const result = await applyReconciliation(prisma, "user-1", 25, "acc-1", 480000);

    expect(result).toEqual({ ok: true, alreadyBalanced: false });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("BALANCE_ADJUSTMENT");
    expect(txnArgs.amount).toBe(-20000);
    expect(txnArgs.accountId).toBe("acc-1");
  });

  it("reports not found for an account the user doesn't own", async () => {
    const prisma = makeFakePrisma();
    prisma.account.findFirst.mockResolvedValue(null);

    const result = await applyReconciliation(prisma, "user-1", 25, "acc-1", 480000);

    expect(result).toEqual({ ok: false, error: "Account not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/reconciliation.test.ts
```

Expected: FAIL — `src/lib/reconciliation.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/reconciliation.ts
import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";

export type ReconciliationPreview = {
  calculatedBalance: number;
  actualBalance: number;
  difference: number; // actualBalance - calculatedBalance; the signed adjustment amount
};

export async function previewReconciliation(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  accountId: string,
  actualBalance: number,
): Promise<ReconciliationPreview> {
  const calculatedBalance = await computeAccountBalance(prisma, accountId);
  return {
    calculatedBalance,
    actualBalance,
    difference: actualBalance - calculatedBalance,
  };
}

export type ReconciliationResult =
  | { ok: true; alreadyBalanced: boolean }
  | { ok: false; error: string };

// Never silently overwrites a balance (design spec's "Account-balance
// rules"): the only thing this writes, and only once the difference is
// confirmed to be non-zero, is a normal BALANCE_ADJUSTMENT transaction row
// — that row is the audit trail, so no separate reconciliation-history
// model is needed.
export async function applyReconciliation(
  prisma: Pick<PrismaClient, "account" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  accountId: string,
  actualBalance: number,
): Promise<ReconciliationResult> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  const { difference } = await previewReconciliation(prisma, accountId, actualBalance);
  if (difference === 0) {
    return { ok: true, alreadyBalanced: true };
  }

  const date = new Date();
  const period = await resolveBudgetPeriodForDate(prisma, userId, date, cycleStartDay);

  await prisma.transaction.create({
    data: {
      userId,
      date,
      type: "BALANCE_ADJUSTMENT",
      amount: difference,
      accountId,
      budgetPeriodId: period.id,
      description: "Balance adjustment",
    },
  });

  return { ok: true, alreadyBalanced: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/reconciliation.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add reconciliation preview/apply domain functions"
```

---

### Task 6: Domain — `src/lib/transfer-recommendations.ts`

**Files:**
- Create: `src/lib/transfer-recommendations.ts`
- Test: `src/lib/transfer-recommendations.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/transfer-recommendations.test.ts
import { describe, expect, it, vi } from "vitest";
import { getRecommendedFundingTransfer } from "@/lib/transfer-recommendations";

const FUNDING_ACCOUNT = {
  id: "checking",
  userId: "user-1",
  isPrimaryFundingAccount: true,
  archivedAt: null,
  includeInLiquidFunds: true,
  accountType: "CHECKING",
};
const SAVINGS_ACCOUNT = {
  id: "savings",
  userId: "user-1",
  isPrimaryFundingAccount: false,
  archivedAt: null,
  includeInLiquidFunds: true,
  accountType: "SAVINGS",
};
const CREDIT_CARD_ACCOUNT = {
  id: "cc",
  userId: "user-1",
  isPrimaryFundingAccount: false,
  archivedAt: null,
  includeInLiquidFunds: true,
  accountType: "CREDIT_CARD",
};

function makeFakePrisma(options: {
  otherAccounts?: unknown[];
  payables?: unknown[];
  balances?: Record<string, number>;
}) {
  const otherAccounts = options.otherAccounts ?? [SAVINGS_ACCOUNT];
  const payables = options.payables ?? [];
  const balances = options.balances ?? {};

  return {
    account: {
      findFirst: vi.fn().mockResolvedValue(FUNDING_ACCOUNT),
      findMany: vi.fn().mockResolvedValue(otherAccounts),
      findUniqueOrThrow: vi.fn((args: { where: { id: string } }) => {
        const id = args.where.id;
        if (id === FUNDING_ACCOUNT.id) return Promise.resolve(FUNDING_ACCOUNT);
        return Promise.resolve(otherAccounts.find((a: any) => a.id === id));
      }),
    },
    payable: {
      findMany: vi.fn().mockResolvedValue(payables),
    },
    transaction: {
      findMany: vi.fn((args: { where: { accountId: string } }) => {
        const accountId = args.where.accountId;
        const balance = balances[accountId] ?? 0;
        return Promise.resolve(balance === 0 ? [] : [{ accountId, amount: balance }]);
      }),
    },
  } as any;
}

describe("getRecommendedFundingTransfer", () => {
  it("returns null when there is no primary funding account", async () => {
    const prisma = makeFakePrisma({});
    prisma.account.findFirst.mockResolvedValue(null);

    const result = await getRecommendedFundingTransfer(prisma, "user-1", new Date(2026, 8, 12));

    expect(result).toBeNull();
  });

  it("returns null when the funding account can already cover what's due", async () => {
    const prisma = makeFakePrisma({
      payables: [{ accountId: "checking", amount: 100000, dueDate: new Date(2026, 8, 15) }],
      balances: { checking: 200000 },
    });

    const result = await getRecommendedFundingTransfer(prisma, "user-1", new Date(2026, 8, 12));

    expect(result).toBeNull();
  });

  it("recommends transferring the shortfall from the highest-balance eligible account", async () => {
    const prisma = makeFakePrisma({
      otherAccounts: [SAVINGS_ACCOUNT, CREDIT_CARD_ACCOUNT],
      payables: [{ accountId: "checking", amount: 300000, dueDate: new Date(2026, 8, 15) }],
      balances: { checking: 50000, savings: 1000000, cc: 5000000 },
    });

    const result = await getRecommendedFundingTransfer(prisma, "user-1", new Date(2026, 8, 12));

    // shortfall = 300000 - 50000 = 250000; credit card is excluded as a source
    expect(result).toEqual({ fromAccountId: "savings", toAccountId: "checking", amount: 250000 });
  });

  it("returns null when no eligible source account has a positive balance", async () => {
    const prisma = makeFakePrisma({
      payables: [{ accountId: "checking", amount: 300000, dueDate: new Date(2026, 8, 15) }],
      balances: { checking: 50000, savings: 0 },
    });

    const result = await getRecommendedFundingTransfer(prisma, "user-1", new Date(2026, 8, 12));

    expect(result).toBeNull();
  });

  it("ignores payables due after the look-ahead window", async () => {
    const prisma = makeFakePrisma({
      payables: [{ accountId: "checking", amount: 300000, dueDate: new Date(2026, 9, 1) }],
      balances: { checking: 50000, savings: 1000000 },
    });
    // account.findMany's where clause isn't asserted here — the payable
    // query itself is expected to exclude this far-future bill, so with a
    // 7-day look-ahead from Sep 12 there's nothing due and no shortfall.
    prisma.payable.findMany.mockResolvedValue([]);

    const result = await getRecommendedFundingTransfer(prisma, "user-1", new Date(2026, 8, 12));

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/transfer-recommendations.test.ts
```

Expected: FAIL — `src/lib/transfer-recommendations.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/transfer-recommendations.ts
import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";

export type FundingRecommendation = {
  fromAccountId: string;
  toAccountId: string;
  amount: number; // minor units, non-negative
};

// Credit and loan accounts are never a source of "real" funds to move —
// same hard rule as liquid-funds totals (design spec's "Account-balance
// rules").
const EXCLUDED_FROM_SOURCE = ["CREDIT_CARD", "LOAN"];

// A pure computation — no schema, nothing persisted. Surfaced as a
// suggestion on the Bills page; the user still creates the actual
// transfer manually via the existing transfer flow if they act on it.
export async function getRecommendedFundingTransfer(
  prisma: Pick<PrismaClient, "account" | "transaction" | "payable">,
  userId: string,
  asOf: Date,
  options: { lookAheadDays?: number } = {},
): Promise<FundingRecommendation | null> {
  const lookAheadDays = options.lookAheadDays ?? 7;

  const fundingAccount = await prisma.account.findFirst({
    where: { userId, isPrimaryFundingAccount: true, archivedAt: null },
  });
  if (!fundingAccount) return null;

  const horizon = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate() + lookAheadDays);

  const upcomingPayables = await prisma.payable.findMany({
    where: {
      userId,
      status: "PENDING",
      accountId: fundingAccount.id,
      dueDate: { lte: horizon },
    },
  });
  const upcomingTotal = upcomingPayables.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);

  const fundingBalance = await computeAccountBalance(prisma, fundingAccount.id);
  const shortfall = upcomingTotal - fundingBalance;
  if (shortfall <= 0) return null;

  const otherAccounts = await prisma.account.findMany({
    where: {
      userId,
      id: { not: fundingAccount.id },
      archivedAt: null,
      includeInLiquidFunds: true,
      accountType: { notIn: EXCLUDED_FROM_SOURCE },
    },
  });

  const balances = await Promise.all(
    otherAccounts.map(async (account: { id: string }) => ({
      accountId: account.id,
      balance: await computeAccountBalance(prisma, account.id),
    })),
  );

  const bestSource = balances
    .filter((entry) => entry.balance > 0)
    .sort((a, b) => b.balance - a.balance)[0];

  if (!bestSource) return null;

  return {
    fromAccountId: bestSource.accountId,
    toAccountId: fundingAccount.id,
    amount: Math.min(shortfall, bestSource.balance),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/transfer-recommendations.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add recommended funding transfer computation"
```

---

### Task 7: Validation schemas

**Files:**
- Create: `src/lib/validations/payable.ts`, `src/lib/validations/recurring-payable.ts`, `src/lib/validations/reconciliation.ts`
- Test: `src/lib/validations/payable.test.ts`, `src/lib/validations/recurring-payable.test.ts`, `src/lib/validations/reconciliation.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/validations/payable.test.ts
import { describe, expect, it } from "vitest";
import { payableSchema } from "@/lib/validations/payable";

describe("payableSchema", () => {
  it("accepts a valid payable", () => {
    const result = payableSchema.safeParse({
      name: "Electric bill",
      amount: 2500,
      dueDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative amount", () => {
    const result = payableSchema.safeParse({
      name: "Invalid",
      amount: 0,
      dueDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });

  it("requires a name", () => {
    const result = payableSchema.safeParse({
      name: "",
      amount: 2500,
      dueDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });
});
```

```typescript
// src/lib/validations/recurring-payable.test.ts
import { describe, expect, it } from "vitest";
import { recurringPayableSchema } from "@/lib/validations/recurring-payable";

describe("recurringPayableSchema", () => {
  it("accepts a valid MONTHLY rule", () => {
    const result = recurringPayableSchema.safeParse({
      name: "Internet bill",
      amount: 1999,
      frequency: "MONTHLY",
      nextDueDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });

  it("requires intervalDays when frequency is CUSTOM", () => {
    const result = recurringPayableSchema.safeParse({
      name: "Every 10 days",
      amount: 500,
      frequency: "CUSTOM",
      nextDueDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts CUSTOM with a positive intervalDays", () => {
    const result = recurringPayableSchema.safeParse({
      name: "Every 10 days",
      amount: 500,
      frequency: "CUSTOM",
      intervalDays: 10,
      nextDueDate: new Date(),
      accountId: "acc-1",
    });
    expect(result.success).toBe(true);
  });
});
```

```typescript
// src/lib/validations/reconciliation.test.ts
import { describe, expect, it } from "vitest";
import { reconciliationSchema } from "@/lib/validations/reconciliation";

describe("reconciliationSchema", () => {
  it("accepts a valid actual balance, including zero or negative (e.g. an overdrawn account)", () => {
    expect(reconciliationSchema.safeParse({ actualBalance: 100.5 }).success).toBe(true);
    expect(reconciliationSchema.safeParse({ actualBalance: 0 }).success).toBe(true);
    expect(reconciliationSchema.safeParse({ actualBalance: -50 }).success).toBe(true);
  });

  it("rejects a non-numeric actual balance", () => {
    const result = reconciliationSchema.safeParse({ actualBalance: "abc" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/validations/payable.test.ts src/lib/validations/recurring-payable.test.ts src/lib/validations/reconciliation.test.ts
```

Expected: FAIL — none of the three schema files exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/validations/payable.ts
import { z } from "zod";

export const payableSchema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.number().positive("Amount must be greater than zero"), // major units
  dueDate: z.date(),
  accountId: z.string().min(1),
  categoryId: z.string().optional(),
});
```

```typescript
// src/lib/validations/recurring-payable.ts
import { z } from "zod";
import { RECURRING_FREQUENCIES } from "@/lib/constants/financial";

export const recurringPayableSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    amount: z.number().positive("Amount must be greater than zero"), // major units
    frequency: z.enum(RECURRING_FREQUENCIES),
    intervalDays: z.number().int().positive().optional(),
    nextDueDate: z.date(),
    accountId: z.string().min(1),
    categoryId: z.string().optional(),
  })
  .refine((data) => data.frequency !== "CUSTOM" || data.intervalDays !== undefined, {
    message: "Custom frequency requires an interval (in days)",
    path: ["intervalDays"],
  });
```

```typescript
// src/lib/validations/reconciliation.ts
import { z } from "zod";

// The actual balance a user enters can legitimately be zero or negative
// (an overdrawn credit card, an emptied e-wallet) — only non-numeric input
// is rejected.
export const reconciliationSchema = z.object({
  actualBalance: z.number(), // major units
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/validations/payable.test.ts src/lib/validations/recurring-payable.test.ts src/lib/validations/reconciliation.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add payable, recurring-payable, and reconciliation validation schemas"
```

---

### Task 8: Server actions

**Files:**
- Create: `src/actions/payable.actions.ts`, `src/actions/recurring-payable.actions.ts`, `src/actions/reconciliation.actions.ts`

- [ ] **Step 1: Implement `src/actions/payable.actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { payableSchema } from "@/lib/validations/payable";
import { createPayable, markPayablePaid, updatePayable } from "@/lib/payables";
import { toMinorUnits } from "@/lib/money";

export type PayableActionResult = { ok: true } | { ok: false; error: string };

function parsePayableForm(formData: FormData) {
  return payableSchema.safeParse({
    name: formData.get("name"),
    amount: Number(formData.get("amount")),
    dueDate: new Date(String(formData.get("dueDate"))),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || undefined,
  });
}

export async function createPayableAction(formData: FormData): Promise<PayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parsePayableForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the bill details" };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });

  await createPayable(prisma, session.user.id, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, account.currency),
  });

  revalidatePath("/bills");
  return { ok: true };
}

export async function updatePayableAction(
  payableId: string,
  formData: FormData,
): Promise<PayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const account = await prisma.account.findFirst({ where: { id: String(formData.get("accountId")) } });
  const currency = account?.currency ?? "PHP";

  const parsed = parsePayableForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the bill details" };

  const result = await updatePayable(prisma, session.user.id, payableId, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, currency),
  });

  if (result.ok) revalidatePath("/bills");
  return result;
}

export async function markPayablePaidAction(
  payableId: string,
  formData: FormData,
): Promise<PayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const overrideAmountRaw = formData.get("amount");
  const overrideDateRaw = formData.get("date");

  let overrideAmount: number | undefined;
  if (overrideAmountRaw) {
    const payable = await prisma.payable.findFirst({ where: { id: payableId, userId: user.id } });
    if (payable) {
      const account = await prisma.account.findUniqueOrThrow({ where: { id: payable.accountId } });
      overrideAmount = toMinorUnits(Number(overrideAmountRaw), account.currency);
    }
  }

  const result = await markPayablePaid(prisma, user.id, user.cycleStartDay, payableId, {
    amount: overrideAmount,
    date: overrideDateRaw ? new Date(String(overrideDateRaw)) : undefined,
  });

  if (result.ok) {
    revalidatePath("/bills");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
  }
  return result;
}
```

- [ ] **Step 2: Implement `src/actions/recurring-payable.actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recurringPayableSchema } from "@/lib/validations/recurring-payable";
import {
  confirmRecurringPayableOccurrence,
  createRecurringPayable,
  skipRecurringPayableOccurrence,
  updateRecurringPayable,
} from "@/lib/recurring-payables";
import { toMinorUnits } from "@/lib/money";

export type RecurringPayableActionResult = { ok: true } | { ok: false; error: string };

function parseRecurringPayableForm(formData: FormData) {
  return recurringPayableSchema.safeParse({
    name: formData.get("name"),
    amount: Number(formData.get("amount")),
    frequency: formData.get("frequency"),
    intervalDays: formData.get("intervalDays") ? Number(formData.get("intervalDays")) : undefined,
    nextDueDate: new Date(String(formData.get("nextDueDate"))),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || undefined,
  });
}

export async function createRecurringPayableAction(
  formData: FormData,
): Promise<RecurringPayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseRecurringPayableForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the recurring bill details" };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });

  await createRecurringPayable(prisma, session.user.id, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, account.currency),
  });

  revalidatePath("/bills");
  return { ok: true };
}

export async function updateRecurringPayableAction(
  ruleId: string,
  formData: FormData,
): Promise<RecurringPayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const account = await prisma.account.findFirst({ where: { id: String(formData.get("accountId")) } });
  const currency = account?.currency ?? "PHP";

  const parsed = parseRecurringPayableForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the recurring bill details" };

  const result = await updateRecurringPayable(prisma, session.user.id, ruleId, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, currency),
  });

  if (result.ok) revalidatePath("/bills");
  return result;
}

export async function toggleRecurringPayableActiveAction(
  ruleId: string,
  active: boolean,
): Promise<RecurringPayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await updateRecurringPayable(prisma, session.user.id, ruleId, { active });
  if (result.ok) revalidatePath("/bills");
  return result;
}

export async function confirmRecurringPayableOccurrenceAction(
  ruleId: string,
  formData: FormData,
): Promise<RecurringPayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const overrideAmountRaw = formData.get("amount");
  const overrideDateRaw = formData.get("dueDate");

  let overrideAmount: number | undefined;
  if (overrideAmountRaw) {
    const rule = await prisma.recurringPayable.findFirst({
      where: { id: ruleId, userId: session.user.id },
    });
    if (rule) {
      const account = await prisma.account.findUniqueOrThrow({ where: { id: rule.accountId } });
      overrideAmount = toMinorUnits(Number(overrideAmountRaw), account.currency);
    }
  }

  const result = await confirmRecurringPayableOccurrence(prisma, session.user.id, ruleId, {
    amount: overrideAmount,
    dueDate: overrideDateRaw ? new Date(String(overrideDateRaw)) : undefined,
  });

  if (result.ok) revalidatePath("/bills");
  return result;
}

export async function skipRecurringPayableOccurrenceAction(
  ruleId: string,
): Promise<RecurringPayableActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await skipRecurringPayableOccurrence(prisma, session.user.id, ruleId);
  if (result.ok) revalidatePath("/bills");
  return result;
}
```

- [ ] **Step 3: Implement `src/actions/reconciliation.actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reconciliationSchema } from "@/lib/validations/reconciliation";
import { applyReconciliation, previewReconciliation } from "@/lib/reconciliation";
import { toMinorUnits } from "@/lib/money";

export type ReconciliationPreviewResult =
  | { ok: true; calculatedBalance: number; actualBalance: number; difference: number }
  | { ok: false; error: string };

export type ReconciliationApplyResult =
  | { ok: true; alreadyBalanced: boolean }
  | { ok: false; error: string };

export async function previewReconciliationAction(
  accountId: string,
  actualBalanceMajor: number,
): Promise<ReconciliationPreviewResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = reconciliationSchema.safeParse({ actualBalance: actualBalanceMajor });
  if (!parsed.success) return { ok: false, error: "Please enter a valid balance" };

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: session.user.id },
  });
  if (!account) return { ok: false, error: "Account not found" };

  const preview = await previewReconciliation(
    prisma,
    accountId,
    toMinorUnits(parsed.data.actualBalance, account.currency),
  );

  return { ok: true, ...preview };
}

export async function applyReconciliationAction(
  accountId: string,
  actualBalanceMajor: number,
): Promise<ReconciliationApplyResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = reconciliationSchema.safeParse({ actualBalance: actualBalanceMajor });
  if (!parsed.success) return { ok: false, error: "Please enter a valid balance" };

  const account = await prisma.account.findFirst({ where: { id: accountId, userId: user.id } });
  if (!account) return { ok: false, error: "Account not found" };

  const result = await applyReconciliation(
    prisma,
    user.id,
    user.cycleStartDay,
    accountId,
    toMinorUnits(parsed.data.actualBalance, account.currency),
  );

  if (result.ok) {
    revalidatePath("/accounts");
    revalidatePath("/transactions");
  }
  return result;
}
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add server actions for bills, recurring payables, and reconciliation"
```

---

### Task 9: Bills page UI — payables

**Files:**
- Create: `src/components/bills/payable-form-dialog.tsx`, `src/components/bills/due-payables-banner.tsx`, `src/components/bills/payable-list.tsx`

- [ ] **Step 1: Implement `src/components/bills/payable-form-dialog.tsx`**

Mirrors `src/components/recurring/rule-form-dialog.tsx`'s structure exactly, minus the frequency fields:

```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createPayableAction, updatePayableAction } from "@/actions/payable.actions";
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
  amount: number;
  dueDate: string;
  accountId: string;
  categoryId: string;
};

type ExistingPayable = {
  id: string;
  name: string;
  amount: number;
  dueDate: Date;
  accountId: string;
  categoryId: string | null;
};

export function PayableFormDialog({
  accounts,
  categories,
  existing,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  existing?: ExistingPayable;
}) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          name: existing.name,
          amount: toMajorUnits(
            existing.amount,
            accounts.find((a) => a.id === existing.accountId)?.currency ?? "PHP",
          ),
          dueDate: existing.dueDate.toISOString().slice(0, 10),
          accountId: existing.accountId,
          categoryId: existing.categoryId ?? "",
        }
      : {
          name: "",
          amount: 0,
          dueDate: new Date().toISOString().slice(0, 10),
          accountId: accounts[0]?.id ?? "",
          categoryId: "",
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("amount", String(values.amount));
    formData.set("dueDate", values.dueDate);
    formData.set("accountId", values.accountId);
    formData.set("categoryId", values.categoryId);

    const result = existing
      ? await updatePayableAction(existing.id, formData)
      : await createPayableAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Bill updated" : "Bill added");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit" : "Add bill"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit bill" : "Add bill"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" type="number" step="0.01" {...register("amount", { valueAsNumber: true })} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dueDate">Due date</Label>
            <Input id="dueDate" type="date" {...register("dueDate")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Paying account</Label>
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

- [ ] **Step 2: Implement `src/components/bills/due-payables-banner.tsx`**

Mirrors `src/components/recurring/due-list.tsx`, using "mark paid" instead of "confirm":

```typescript
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { markPayablePaidAction } from "@/actions/payable.actions";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DuePayable = {
  id: string;
  name: string;
  amount: number;
  dueDate: Date;
  account: { name: string; currency: string };
};

export function DuePayablesBanner({ payables }: { payables: DuePayable[] }) {
  const router = useRouter();

  if (payables.length === 0) {
    return null;
  }

  async function handleMarkPaid(payableId: string, formData: FormData) {
    const result = await markPayablePaidAction(payableId, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked paid");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h2 className="text-sm font-medium">Due this week</h2>
      {payables.map((payable) => (
        <form
          key={payable.id}
          action={(formData) => handleMarkPaid(payable.id, formData)}
          className="flex flex-wrap items-center gap-2 rounded-md bg-background p-3"
        >
          <div className="mr-auto">
            <p className="font-medium">{payable.name}</p>
            <p className="text-sm text-muted-foreground">
              {payable.account.name} · due {payable.dueDate.toLocaleDateString()}
            </p>
          </div>
          <Input
            name="amount"
            type="number"
            step="0.01"
            defaultValue={toMajorUnits(payable.amount, payable.account.currency)}
            className="w-28"
          />
          <Input
            name="date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-40"
          />
          <Button type="submit" size="sm">
            Mark paid
          </Button>
        </form>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Implement `src/components/bills/payable-list.tsx`**

```typescript
import { formatMoney } from "@/lib/money";
import { PayableFormDialog } from "@/components/bills/payable-form-dialog";

type PayableRow = {
  id: string;
  name: string;
  amount: number;
  dueDate: Date;
  accountId: string;
  categoryId: string | null;
  status: string;
  account: { name: string; currency: string };
  category: { name: string } | null;
};

export function PayableList({
  payables,
  accounts,
  categories,
}: {
  payables: PayableRow[];
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string }[];
}) {
  if (payables.length === 0) {
    return <p className="text-muted-foreground">No bills yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {payables.map((payable) => (
        <div key={payable.id} className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">
              {payable.name}
              {payable.status === "PAID" && (
                <span className="ml-2 text-xs text-muted-foreground">(paid)</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatMoney(payable.amount, payable.account.currency)} · {payable.account.name}
              {payable.category ? ` · ${payable.category.name}` : ""} · due{" "}
              {payable.dueDate.toLocaleDateString()}
            </p>
          </div>
          {payable.status === "PENDING" && (
            <PayableFormDialog accounts={accounts} categories={categories} existing={payable} />
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add payable form dialog, due-this-week banner, and payable list"
```

---

### Task 10: Bills page UI — recurring payables, funding recommendation, and the page itself

**Files:**
- Create: `src/components/bills/recurring-payable-form-dialog.tsx`, `src/components/bills/recurring-payable-due-list.tsx`, `src/components/bills/recurring-payable-list.tsx`, `src/components/bills/funding-recommendation-banner.tsx`, `src/app/(app)/bills/page.tsx`
- Modify: `src/components/nav/top-nav.tsx`

- [ ] **Step 1: Implement `src/components/bills/recurring-payable-form-dialog.tsx`**

Same structure as `src/components/recurring/rule-form-dialog.tsx` (name/amount/frequency/intervalDays/date/account/category), with `transactionType` removed and `nextDate` renamed to `nextDueDate`:

```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  createRecurringPayableAction,
  updateRecurringPayableAction,
} from "@/actions/recurring-payable.actions";
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
  amount: number;
  frequency: (typeof RECURRING_FREQUENCIES)[number];
  intervalDays: number;
  nextDueDate: string;
  accountId: string;
  categoryId: string;
};

type ExistingRule = {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  intervalDays: number | null;
  nextDueDate: Date;
  accountId: string;
  categoryId: string | null;
};

export function RecurringPayableFormDialog({
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
          amount: toMajorUnits(
            existing.amount,
            accounts.find((a) => a.id === existing.accountId)?.currency ?? "PHP",
          ),
          frequency: existing.frequency as FormValues["frequency"],
          intervalDays: existing.intervalDays ?? 1,
          nextDueDate: existing.nextDueDate.toISOString().slice(0, 10),
          accountId: existing.accountId,
          categoryId: existing.categoryId ?? "",
        }
      : {
          name: "",
          amount: 0,
          frequency: "MONTHLY",
          intervalDays: 1,
          nextDueDate: new Date().toISOString().slice(0, 10),
          accountId: accounts[0]?.id ?? "",
          categoryId: "",
        },
  });

  const frequency = watch("frequency");

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("amount", String(values.amount));
    formData.set("frequency", values.frequency);
    if (values.frequency === "CUSTOM") formData.set("intervalDays", String(values.intervalDays));
    formData.set("nextDueDate", values.nextDueDate);
    formData.set("accountId", values.accountId);
    formData.set("categoryId", values.categoryId);

    const result = existing
      ? await updateRecurringPayableAction(existing.id, formData)
      : await createRecurringPayableAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Recurring bill updated" : "Recurring bill created");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit" : "Add recurring bill"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit recurring bill" : "Add recurring bill"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
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
            <Label htmlFor="nextDueDate">Next due date</Label>
            <Input id="nextDueDate" type="date" {...register("nextDueDate")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Paying account</Label>
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

- [ ] **Step 2: Implement `src/components/bills/recurring-payable-due-list.tsx`**

```typescript
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  confirmRecurringPayableOccurrenceAction,
  skipRecurringPayableOccurrenceAction,
} from "@/actions/recurring-payable.actions";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DueRule = {
  id: string;
  name: string;
  amount: number;
  nextDueDate: Date;
  account: { name: string; currency: string };
};

export function RecurringPayableDueList({ rules }: { rules: DueRule[] }) {
  const router = useRouter();

  if (rules.length === 0) {
    return null;
  }

  async function handleConfirm(ruleId: string, formData: FormData) {
    const result = await confirmRecurringPayableOccurrenceAction(ruleId, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Bill added");
    router.refresh();
  }

  async function handleSkip(ruleId: string) {
    const result = await skipRecurringPayableOccurrenceAction(ruleId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Skipped");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h2 className="text-sm font-medium">Recurring bills due</h2>
      {rules.map((rule) => (
        <form
          key={rule.id}
          action={(formData) => handleConfirm(rule.id, formData)}
          className="flex flex-wrap items-center gap-2 rounded-md bg-background p-3"
        >
          <div className="mr-auto">
            <p className="font-medium">{rule.name}</p>
            <p className="text-sm text-muted-foreground">
              {rule.account.name} · due {rule.nextDueDate.toLocaleDateString()}
            </p>
          </div>
          <Input
            name="amount"
            type="number"
            step="0.01"
            defaultValue={toMajorUnits(rule.amount, rule.account.currency)}
            className="w-28"
          />
          <Input
            name="dueDate"
            type="date"
            defaultValue={rule.nextDueDate.toISOString().slice(0, 10)}
            className="w-40"
          />
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

- [ ] **Step 3: Implement `src/components/bills/recurring-payable-list.tsx`**

```typescript
import { formatMoney } from "@/lib/money";
import { RecurringPayableFormDialog } from "@/components/bills/recurring-payable-form-dialog";
import { toggleRecurringPayableActiveAction } from "@/actions/recurring-payable.actions";
import { Button } from "@/components/ui/button";

type RuleRow = {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  intervalDays: number | null;
  nextDueDate: Date;
  accountId: string;
  categoryId: string | null;
  active: boolean;
  account: { name: string; currency: string };
  category: { name: string } | null;
};

export function RecurringPayableList({
  rules,
  accounts,
  categories,
}: {
  rules: RuleRow[];
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string }[];
}) {
  if (rules.length === 0) {
    return <p className="text-muted-foreground">No recurring bills yet.</p>;
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
              {rule.category ? ` · ${rule.category.name}` : ""} · next{" "}
              {rule.nextDueDate.toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2">
            <RecurringPayableFormDialog accounts={accounts} categories={categories} existing={rule} />
            <form
              action={async () => {
                "use server";
                await toggleRecurringPayableActiveAction(rule.id, !rule.active);
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

- [ ] **Step 4: Implement `src/components/bills/funding-recommendation-banner.tsx`**

```typescript
import { formatMoney } from "@/lib/money";

type Recommendation = {
  fromAccountName: string;
  toAccountName: string;
  amount: number;
  currency: string;
};

export function FundingRecommendationBanner({
  recommendation,
}: {
  recommendation: Recommendation | null;
}) {
  if (!recommendation) return null;

  return (
    <div className="rounded-lg border border-dashed p-4 text-sm">
      <span className="font-medium">Funding suggestion: </span>
      move {formatMoney(recommendation.amount, recommendation.currency)} from{" "}
      <span className="font-medium">{recommendation.fromAccountName}</span> to{" "}
      <span className="font-medium">{recommendation.toAccountName}</span> to cover bills due soon.
    </div>
  );
}
```

- [ ] **Step 5: Implement `src/app/(app)/bills/page.tsx`**

```typescript
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { getRecommendedFundingTransfer } from "@/lib/transfer-recommendations";
import { PayableFormDialog } from "@/components/bills/payable-form-dialog";
import { DuePayablesBanner } from "@/components/bills/due-payables-banner";
import { PayableList } from "@/components/bills/payable-list";
import { RecurringPayableFormDialog } from "@/components/bills/recurring-payable-form-dialog";
import { RecurringPayableDueList } from "@/components/bills/recurring-payable-due-list";
import { RecurringPayableList } from "@/components/bills/recurring-payable-list";
import { FundingRecommendationBanner } from "@/components/bills/funding-recommendation-banner";

const DUE_SOON_WINDOW_DAYS = 7;

export default async function BillsPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const now = new Date();
  const dueSoonHorizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + DUE_SOON_WINDOW_DAYS);

  const [
    duePayables,
    allPayables,
    dueRecurringPayables,
    allRecurringPayables,
    accounts,
    categories,
    recommendation,
  ] = await Promise.all([
    prisma.payable.findMany({
      where: { userId: user.id, status: "PENDING", dueDate: { lte: dueSoonHorizon } },
      orderBy: { dueDate: "asc" },
      include: { account: true },
    }),
    prisma.payable.findMany({
      where: { userId: user.id },
      orderBy: { dueDate: "asc" },
      include: { account: true, category: true },
    }),
    prisma.recurringPayable.findMany({
      where: { userId: user.id, active: true, nextDueDate: { lte: now } },
      orderBy: { nextDueDate: "asc" },
      include: { account: true },
    }),
    prisma.recurringPayable.findMany({
      where: { userId: user.id },
      orderBy: { nextDueDate: "asc" },
      include: { account: true, category: true },
    }),
    listAccounts(prisma, user.id),
    listCategories(prisma, user.id),
    getRecommendedFundingTransfer(prisma, user.id, now, { lookAheadDays: DUE_SOON_WINDOW_DAYS }),
  ]);

  let recommendationView = null;
  if (recommendation) {
    const fromAccount = accounts.find((a) => a.id === recommendation.fromAccountId);
    const toAccount = accounts.find((a) => a.id === recommendation.toAccountId);
    if (fromAccount && toAccount) {
      recommendationView = {
        fromAccountName: fromAccount.name,
        toAccountName: toAccount.name,
        amount: recommendation.amount,
        currency: toAccount.currency,
      };
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Bills</h1>
        <div className="flex gap-2">
          <RecurringPayableFormDialog accounts={accounts} categories={categories} />
          <PayableFormDialog accounts={accounts} categories={categories} />
        </div>
      </div>

      <FundingRecommendationBanner recommendation={recommendationView} />

      <RecurringPayableDueList rules={dueRecurringPayables} />
      <DuePayablesBanner payables={duePayables} />

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recurring bills</h2>
        <RecurringPayableList rules={allRecurringPayables} accounts={accounts} categories={categories} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">All bills</h2>
        <PayableList payables={allPayables} accounts={accounts} categories={categories} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add the nav link**

In `src/components/nav/top-nav.tsx`, add `{ href: "/bills", label: "Bills" }` to the `links` array, after `"Accounts"` and before `"Recurring"`:

```typescript
const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budget", label: "Budget" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
  { href: "/bills", label: "Bills" },
  { href: "/recurring", label: "Recurring" },
  { href: "/settings", label: "Settings" },
];
```

- [ ] **Step 7: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Bills page with recurring bills and funding recommendation"
```

---

### Task 11: Reconciliation UI on the Accounts page

**Files:**
- Create: `src/components/accounts/reconcile-dialog.tsx`
- Modify: `src/components/accounts/account-list.tsx`

- [ ] **Step 1: Implement `src/components/accounts/reconcile-dialog.tsx`**

Two-step dialog: enter actual balance → preview the difference → confirm or cancel. Uses local state (not react-hook-form) since it's a single-field, two-stage flow rather than a create/edit form.

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { applyReconciliationAction, previewReconciliationAction } from "@/actions/reconciliation.actions";
import { formatMoney } from "@/lib/money";
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

type Preview = { calculatedBalance: number; actualBalance: number; difference: number };

export function ReconcileDialog({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actualBalanceInput, setActualBalanceInput] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isPending, setIsPending] = useState(false);

  function reset() {
    setActualBalanceInput("");
    setPreview(null);
  }

  async function handlePreview() {
    setIsPending(true);
    const result = await previewReconciliationAction(accountId, Number(actualBalanceInput));
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPreview(result);
  }

  async function handleConfirm() {
    setIsPending(true);
    const result = await applyReconciliationAction(accountId, Number(actualBalanceInput));
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.alreadyBalanced ? "Already balanced — nothing to adjust" : "Balance adjusted");
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="ghost" />}>Reconcile</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reconcile balance</DialogTitle>
        </DialogHeader>

        {!preview ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="actualBalance">What does this account actually hold?</Label>
              <Input
                id="actualBalance"
                type="number"
                step="0.01"
                value={actualBalanceInput}
                onChange={(e) => setActualBalanceInput(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button onClick={handlePreview} disabled={isPending || actualBalanceInput === ""}>
                Preview
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 text-sm">
              <p>Calculated: {formatMoney(preview.calculatedBalance, currency)}</p>
              <p>Actual: {formatMoney(preview.actualBalance, currency)}</p>
              <p className="font-medium">
                Difference: {formatMoney(preview.difference, currency)}
                {preview.difference === 0 && " — already balanced"}
              </p>
              {preview.difference !== 0 && (
                <p className="text-muted-foreground">
                  Confirming creates a balance-adjustment transaction closing this gap.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={isPending}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={isPending}>
                Confirm
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it into `src/components/accounts/account-list.tsx`**

Add the import:

```typescript
import { ReconcileDialog } from "@/components/accounts/reconcile-dialog";
```

Add `<ReconcileDialog accountId={account.id} currency={account.currency} />` into the row's action button group, alongside `AccountFormDialog` and the archive form:

```typescript
          <div className="flex gap-2">
            <AccountFormDialog existing={account} />
            <ReconcileDialog accountId={account.id} currency={account.currency} />
            <form
              action={async () => {
                "use server";
                await archiveAccountAction(account.id);
              }}
            >
              <Button type="submit" variant="ghost">
                Archive
              </Button>
            </form>
          </div>
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add reconciliation dialog to the Accounts page"
```

---

### Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (existing 118 plus this plan's new tests — 9 payables + 10 recurring-payables + 4 reconciliation + 5 transfer-recommendations + 8 validation ≈ 36 new tests, ~154 total).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Browser walkthrough**

Start the dev server, log in as `demo@example.com` / `demopassword123`, and manually verify (fixing any real bug found, then re-running Steps 1–2):

- Bills page loads with empty states for bills and recurring bills.
- Create a one-off bill due today or earlier — confirm it appears in "Due this week."
- Mark it paid — confirm it disappears from "Due this week," appears as "(paid)" in "All bills," and a matching `EXPENSE` transaction appears on the Transactions page.
- Create a recurring bill (MONTHLY) with `nextDueDate` = today — confirm it appears in "Recurring bills due."
- Confirm the occurrence — confirm a new PENDING bill appears in "All bills" with the right due date, and the recurring rule's "next" date advanced by one month.
- Skip an occurrence on a different recurring bill — confirm no bill was generated and its next date still advanced.
- On the Accounts page, click "Reconcile" on an account, enter a different actual balance, preview the difference, confirm — verify a `BALANCE_ADJUSTMENT` transaction was created and the account's displayed balance now matches the entered actual balance. Also test entering the *current* calculated balance — confirm it reports "already balanced" and creates no transaction.
- To see the funding recommendation banner: mark one account as the primary funding account (via its edit dialog) with a balance smaller than an upcoming bill assigned to it, while another liquid account has a larger balance — confirm the banner appears with a sensible suggested amount and account names; confirm it disappears once the shortfall is resolved.
- Clean up any test data created during this walkthrough (delete test bills/recurring bills, undo any reconciliation adjustment made purely for testing, restore the primary-funding-account flag if changed) the same way prior plans' verification steps have.

- [ ] **Step 4: Confirm a clean working tree**

```bash
git status --short
```

Expected: no output (everything already committed; verification found no code changes needed, or any fix was committed above).
