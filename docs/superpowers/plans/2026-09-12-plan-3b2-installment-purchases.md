# Plan 3B.2: Installment Purchases & Schedules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The second sub-plan of Plan 3B — `InstallmentPurchase`/`InstallmentPayment` schema, whole-schedule generation at creation time, a due-terms review banner and pay-a-term flow, all surfaced on the existing Loans & Cards page (Plan 3B.1).

**Architecture:** Unlike `RecurringRule`/`RecurringPayable` (which generate one occurrence at a time, lazily, as `nextDate` comes due), an installment purchase's whole schedule is knowable the moment it's created — a fixed `totalAmount` split across a fixed `numberOfTerms`. So `createInstallmentPurchase` generates **all** `InstallmentPayment` rows up front, each with its own `termNumber`, `amount`, and monthly `dueDate` (reusing `advanceNextDate` from Plan 3A.2 unchanged). Paying a term works exactly like every other "pay a bill" flow already built (`Payable`/`markPayablePaid` in Plan 3A.3, `Loan`/`CreditCard` payments in Plan 3B.1): it logs a normal transaction via `createExpenseLikeTransaction` and flips the row's own status — no new balance math anywhere.

**Documented simplification (flagging rather than silently deciding), consistent with Plan 3B.1's:** an installment purchase is scoped to a `CREDIT_CARD` account only (not `LOAN`) — this is specifically a "buy now, pay later on a card" feature, per the design spec grouping "Credit-card and installment-payment schedules" together as one differentiator. Paying a term logs a `CREDIT_CARD_PAYMENT` transaction against whichever account the user actually pays from (typically checking), same as a regular credit-card payment — it does not touch the card's own account balance, for the same reason Plan 3B.1 didn't wire that up. Editing an installment purchase after creation (changing `totalAmount`/`numberOfTerms` and regenerating the schedule) is **not** supported — only create and archive; this avoids the reconciliation complexity of resizing an already-partially-paid schedule.

**Tech Stack:** Same as prior plans. No new dependencies.

**Read first:** `docs/superpowers/plans/2026-09-12-plan-3b1-loans-credit-cards.md` (the Loans & Cards page this plan extends); `src/lib/recurring-schedule.ts` (`advanceNextDate`, reused unchanged for monthly due-date stepping); `src/lib/transactions.ts` (`createExpenseLikeTransaction`, reused unchanged); `src/lib/payables.ts` (`markPayablePaid` — `payInstallmentTerm` in this plan follows the identical shape).

**Environment reminder:** update `prisma/schema.prisma` **and** `prisma/schema.sql` together, apply with `npm run db:push` (this machine can't run `prisma db push`/`migrate` directly).

**Scope boundary — explicitly NOT in this plan:** dashboard/reports (Plan 3B.3); moving Categories/Recurring into Settings or finishing the nav (Plan 3B.4); editing an existing installment purchase's schedule; loan-linked installment purchases (credit cards only, see above).

---

### Task 1: Add `InstallmentPurchase` and `InstallmentPayment` to the schema

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/schema.sql`

- [ ] **Step 1: Add relation fields**

`User` — add:

```prisma
  installmentPurchases InstallmentPurchase[]
  installmentPayments  InstallmentPayment[]
```

`Account` — add:

```prisma
  installmentPurchases InstallmentPurchase[]
```

`Category` — add:

```prisma
  installmentPurchases InstallmentPurchase[]
```

- [ ] **Step 2: Append the new models**

```prisma
model InstallmentPurchase {
  id            String    @id @default(cuid())
  userId        String
  name          String
  totalAmount   Int       // minor units
  numberOfTerms Int
  accountId     String    // a CREDIT_CARD account — see this plan's documented simplification
  categoryId    String?
  startDate     DateTime
  archivedAt    DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user     User                 @relation(fields: [userId], references: [id])
  account  Account              @relation(fields: [accountId], references: [id])
  category Category?            @relation(fields: [categoryId], references: [id])
  payments InstallmentPayment[]
}

model InstallmentPayment {
  id                    String   @id @default(cuid())
  userId                String
  installmentPurchaseId String
  termNumber            Int      // 1-based
  amount                Int      // minor units
  dueDate               DateTime
  status                String   @default("PENDING") // PENDING | PAID
  paidTransactionId     String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user                User                @relation(fields: [userId], references: [id])
  installmentPurchase InstallmentPurchase @relation(fields: [installmentPurchaseId], references: [id])

  @@unique([installmentPurchaseId, termNumber])
}
```

- [ ] **Step 3: Add the matching tables to `prisma/schema.sql`**

Append:

```sql
CREATE TABLE IF NOT EXISTS "InstallmentPurchase" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "totalAmount" INTEGER NOT NULL,
  "numberOfTerms" INTEGER NOT NULL,
  "accountId" TEXT NOT NULL,
  "categoryId" TEXT,
  "startDate" DATETIME NOT NULL,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("accountId") REFERENCES "Account" ("id"),
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id")
);
CREATE INDEX IF NOT EXISTS "InstallmentPurchase_userId_idx" ON "InstallmentPurchase" ("userId");

CREATE TABLE IF NOT EXISTS "InstallmentPayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "installmentPurchaseId" TEXT NOT NULL,
  "termNumber" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "dueDate" DATETIME NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paidTransactionId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("installmentPurchaseId") REFERENCES "InstallmentPurchase" ("id")
);
CREATE INDEX IF NOT EXISTS "InstallmentPayment_userId_idx" ON "InstallmentPayment" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "InstallmentPayment_installmentPurchaseId_termNumber_key" ON "InstallmentPayment" ("installmentPurchaseId", "termNumber");
```

- [ ] **Step 4: Apply the schema**

```bash
npm run db:push
```

Expected: `InstallmentPurchase` and `InstallmentPayment` tables created, no errors.

- [ ] **Step 5: Regenerate the Prisma client and verify compile**

```bash
npx prisma generate
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add InstallmentPurchase and InstallmentPayment models"
```

---

### Task 2: Domain — `src/lib/installment-purchases.ts`

**Files:**
- Create: `src/lib/installment-purchases.ts`
- Test: `src/lib/installment-purchases.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/installment-purchases.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  archiveInstallmentPurchase,
  createInstallmentPurchase,
  listDueInstallmentPayments,
  listInstallmentPurchases,
  payInstallmentTerm,
} from "@/lib/installment-purchases";

const SAMPLE_PAYMENT = {
  id: "payment-1",
  userId: "user-1",
  installmentPurchaseId: "purchase-1",
  termNumber: 2,
  amount: 33333,
  dueDate: new Date(2026, 9, 12),
  status: "PENDING",
  paidTransactionId: null,
};

const SAMPLE_PURCHASE = {
  id: "purchase-1",
  userId: "user-1",
  name: "New laptop",
  totalAmount: 100000,
  numberOfTerms: 3,
  accountId: "acc-cc",
};

function makeFakePrisma(options: { payment?: unknown; purchase?: unknown } = {}) {
  const payment = "payment" in options ? options.payment : SAMPLE_PAYMENT;
  const purchase = "purchase" in options ? options.purchase : SAMPLE_PURCHASE;
  return {
    installmentPurchase: {
      create: vi.fn().mockResolvedValue({ id: "purchase-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(purchase),
      findMany: vi.fn().mockResolvedValue([]),
    },
    installmentPayment: {
      create: vi.fn().mockResolvedValue({ id: "payment-new" }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(payment),
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

describe("createInstallmentPurchase", () => {
  it("creates the purchase and generates one InstallmentPayment per term", async () => {
    const prisma = makeFakePrisma();
    const input = {
      name: "New laptop",
      totalAmount: 100000,
      numberOfTerms: 3,
      accountId: "acc-cc",
      startDate: new Date(2026, 8, 12),
    };

    await createInstallmentPurchase(prisma, "user-1", input);

    expect(prisma.installmentPurchase.create).toHaveBeenCalledWith({
      data: { userId: "user-1", ...input },
    });
    expect(prisma.installmentPayment.create).toHaveBeenCalledTimes(3);
  });

  it("splits totalAmount evenly across terms, with any remainder on the last term", async () => {
    const prisma = makeFakePrisma();

    await createInstallmentPurchase(prisma, "user-1", {
      name: "New laptop",
      totalAmount: 100000, // 100000 / 3 = 33333.33...
      numberOfTerms: 3,
      accountId: "acc-cc",
      startDate: new Date(2026, 8, 12),
    });

    const amounts = prisma.installmentPayment.create.mock.calls.map((call: any) => call[0].data.amount);
    expect(amounts).toEqual([33333, 33333, 33334]);
    expect(amounts.reduce((a: number, b: number) => a + b, 0)).toBe(100000);
  });

  it("sets each term's dueDate one month after the previous term, starting at startDate", async () => {
    const prisma = makeFakePrisma();

    await createInstallmentPurchase(prisma, "user-1", {
      name: "New laptop",
      totalAmount: 90000,
      numberOfTerms: 3,
      accountId: "acc-cc",
      startDate: new Date(2026, 8, 12),
    });

    const dueDates = prisma.installmentPayment.create.mock.calls.map((call: any) => call[0].data.dueDate);
    expect(dueDates).toEqual([
      new Date(2026, 8, 12),
      new Date(2026, 9, 12),
      new Date(2026, 10, 12),
    ]);
  });

  it("numbers terms starting at 1", async () => {
    const prisma = makeFakePrisma();

    await createInstallmentPurchase(prisma, "user-1", {
      name: "New laptop",
      totalAmount: 90000,
      numberOfTerms: 3,
      accountId: "acc-cc",
      startDate: new Date(2026, 8, 12),
    });

    const termNumbers = prisma.installmentPayment.create.mock.calls.map((call: any) => call[0].data.termNumber);
    expect(termNumbers).toEqual([1, 2, 3]);
  });
});

describe("archiveInstallmentPurchase", () => {
  it("sets archivedAt for a purchase belonging to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await archiveInstallmentPurchase(prisma, "user-1", "purchase-1");

    expect(result).toEqual({ ok: true });
    const args = prisma.installmentPurchase.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "purchase-1", userId: "user-1" });
    expect(args.data.archivedAt).toBeInstanceOf(Date);
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.installmentPurchase.updateMany.mockResolvedValue({ count: 0 });

    const result = await archiveInstallmentPurchase(prisma, "user-1", "purchase-1");

    expect(result).toEqual({ ok: false, error: "Installment purchase not found" });
  });
});

describe("listInstallmentPurchases", () => {
  it("scopes to the user, excludes archived purchases by default, and includes payments", async () => {
    const prisma = makeFakePrisma();

    await listInstallmentPurchases(prisma, "user-1");

    expect(prisma.installmentPurchase.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      orderBy: { createdAt: "asc" },
      include: { payments: true },
    });
  });
});

describe("listDueInstallmentPayments", () => {
  it("scopes to the user, pending payments whose dueDate has arrived", async () => {
    const prisma = makeFakePrisma();
    const asOf = new Date(2026, 8, 25);

    await listDueInstallmentPayments(prisma, "user-1", asOf);

    expect(prisma.installmentPayment.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "PENDING", dueDate: { lte: asOf } },
      orderBy: { dueDate: "asc" },
    });
  });
});

describe("payInstallmentTerm", () => {
  it("creates a CREDIT_CARD_PAYMENT transaction and marks the term paid", async () => {
    const prisma = makeFakePrisma();

    const result = await payInstallmentTerm(prisma, "user-1", 25, "payment-1", {
      accountId: "acc-checking",
    });

    expect(result).toEqual({ ok: true });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("CREDIT_CARD_PAYMENT");
    expect(txnArgs.amount).toBe(-33333);
    expect(txnArgs.accountId).toBe("acc-checking");
    expect(txnArgs.description).toBe("Installment: New laptop (term 2 of 3)");

    expect(prisma.installmentPayment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: { status: "PAID", paidTransactionId: "txn-1" },
    });
  });

  it("applies an amount/date override instead of the term's defaults", async () => {
    const prisma = makeFakePrisma();

    await payInstallmentTerm(prisma, "user-1", 25, "payment-1", {
      accountId: "acc-checking",
      amount: 40000,
      date: new Date(2026, 9, 10),
    });

    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.amount).toBe(-40000);
    expect(txnArgs.date).toEqual(new Date(2026, 9, 10));
  });

  it("reports not found for a term the user doesn't own, or already paid", async () => {
    const prisma = makeFakePrisma({ payment: null });

    const result = await payInstallmentTerm(prisma, "user-1", 25, "payment-1", {
      accountId: "acc-checking",
    });

    expect(result).toEqual({ ok: false, error: "Installment payment not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/installment-purchases.test.ts
```

Expected: FAIL — `src/lib/installment-purchases.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/installment-purchases.ts
import type { PrismaClient } from "@prisma/client";
import { advanceNextDate } from "@/lib/recurring-schedule";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type InstallmentPurchaseInput = {
  name: string;
  totalAmount: number; // minor units
  numberOfTerms: number;
  accountId: string; // a CREDIT_CARD account
  categoryId?: string;
  startDate: Date;
};

export type InstallmentMutationResult = { ok: true } | { ok: false; error: string };

// Generates the whole schedule up front — an installment purchase's terms
// are fixed at creation time (totalAmount split across numberOfTerms),
// unlike RecurringRule/RecurringPayable which generate one occurrence at a
// time as it comes due. Any remainder from the division lands on the last
// term so the terms always sum to exactly totalAmount.
export async function createInstallmentPurchase(
  prisma: Pick<PrismaClient, "installmentPurchase" | "installmentPayment">,
  userId: string,
  input: InstallmentPurchaseInput,
) {
  const purchase = await prisma.installmentPurchase.create({ data: { userId, ...input } });

  const baseAmount = Math.floor(input.totalAmount / input.numberOfTerms);
  const remainder = input.totalAmount - baseAmount * input.numberOfTerms;

  let dueDate = input.startDate;
  for (let termNumber = 1; termNumber <= input.numberOfTerms; termNumber++) {
    const amount = termNumber === input.numberOfTerms ? baseAmount + remainder : baseAmount;
    await prisma.installmentPayment.create({
      data: {
        userId,
        installmentPurchaseId: purchase.id,
        termNumber,
        amount,
        dueDate,
      },
    });
    dueDate = advanceNextDate(dueDate, "MONTHLY");
  }

  return purchase;
}

export async function archiveInstallmentPurchase(
  prisma: Pick<PrismaClient, "installmentPurchase">,
  userId: string,
  purchaseId: string,
): Promise<InstallmentMutationResult> {
  const result = await prisma.installmentPurchase.updateMany({
    where: { id: purchaseId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Installment purchase not found" };
  }
  return { ok: true };
}

export async function listInstallmentPurchases(
  prisma: Pick<PrismaClient, "installmentPurchase">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.installmentPurchase.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "asc" },
    include: { payments: true },
  });
}

export async function listDueInstallmentPayments(
  prisma: Pick<PrismaClient, "installmentPayment">,
  userId: string,
  asOf: Date,
) {
  return prisma.installmentPayment.findMany({
    where: { userId, status: "PENDING", dueDate: { lte: asOf } },
    orderBy: { dueDate: "asc" },
  });
}

export type PayInstallmentTermInput = { accountId: string; amount?: number; date?: Date };

export async function payInstallmentTerm(
  prisma: Pick<PrismaClient, "installmentPurchase" | "installmentPayment" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  paymentId: string,
  input: PayInstallmentTermInput,
): Promise<InstallmentMutationResult> {
  const payment = await prisma.installmentPayment.findFirst({
    where: { id: paymentId, userId, status: "PENDING" },
  });
  if (!payment) {
    return { ok: false, error: "Installment payment not found" };
  }

  const purchase = await prisma.installmentPurchase.findFirst({
    where: { id: payment.installmentPurchaseId },
  });

  const transaction = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "CREDIT_CARD_PAYMENT",
    amount: input.amount ?? payment.amount,
    date: input.date ?? new Date(),
    accountId: input.accountId,
    description: `Installment: ${purchase!.name} (term ${payment.termNumber} of ${purchase!.numberOfTerms})`,
  });

  await prisma.installmentPayment.update({
    where: { id: paymentId },
    data: { status: "PAID", paidTransactionId: transaction.id },
  });

  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/installment-purchases.test.ts
```

Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add installment purchases domain functions"
```

---

### Task 3: Validation schema

**Files:**
- Create: `src/lib/validations/installment-purchase.ts`
- Test: `src/lib/validations/installment-purchase.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/validations/installment-purchase.test.ts
import { describe, expect, it } from "vitest";
import { installmentPurchaseSchema } from "@/lib/validations/installment-purchase";

describe("installmentPurchaseSchema", () => {
  it("accepts a valid installment purchase", () => {
    const result = installmentPurchaseSchema.safeParse({
      name: "New laptop",
      totalAmount: 1000,
      numberOfTerms: 6,
      accountId: "acc-1",
      startDate: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative totalAmount", () => {
    const result = installmentPurchaseSchema.safeParse({
      name: "Invalid",
      totalAmount: 0,
      numberOfTerms: 6,
      accountId: "acc-1",
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects fewer than 2 terms", () => {
    const result = installmentPurchaseSchema.safeParse({
      name: "Invalid",
      totalAmount: 1000,
      numberOfTerms: 1,
      accountId: "acc-1",
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 60 terms", () => {
    const result = installmentPurchaseSchema.safeParse({
      name: "Invalid",
      totalAmount: 1000,
      numberOfTerms: 61,
      accountId: "acc-1",
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer numberOfTerms", () => {
    const result = installmentPurchaseSchema.safeParse({
      name: "Invalid",
      totalAmount: 1000,
      numberOfTerms: 6.5,
      accountId: "acc-1",
      startDate: new Date(),
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/validations/installment-purchase.test.ts
```

Expected: FAIL — the schema file does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/validations/installment-purchase.ts
import { z } from "zod";

export const installmentPurchaseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  totalAmount: z.number().positive("Total amount must be greater than zero"), // major units
  numberOfTerms: z.number().int().min(2, "At least 2 terms").max(60, "At most 60 terms"),
  accountId: z.string().min(1),
  categoryId: z.string().optional(),
  startDate: z.date(),
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/validations/installment-purchase.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add installment purchase validation schema"
```

---

### Task 4: Server actions

**Files:**
- Create: `src/actions/installment-purchase.actions.ts`

- [ ] **Step 1: Implement**

```typescript
// src/actions/installment-purchase.actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { installmentPurchaseSchema } from "@/lib/validations/installment-purchase";
import {
  archiveInstallmentPurchase,
  createInstallmentPurchase,
  payInstallmentTerm,
} from "@/lib/installment-purchases";
import { toMinorUnits } from "@/lib/money";

export type InstallmentActionResult = { ok: true } | { ok: false; error: string };

export async function createInstallmentPurchaseAction(
  formData: FormData,
): Promise<InstallmentActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = installmentPurchaseSchema.safeParse({
    name: formData.get("name"),
    totalAmount: Number(formData.get("totalAmount")),
    numberOfTerms: Number(formData.get("numberOfTerms")),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || undefined,
    startDate: new Date(String(formData.get("startDate"))),
  });
  if (!parsed.success) return { ok: false, error: "Please check the installment purchase details" };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });

  await createInstallmentPurchase(prisma, session.user.id, {
    ...parsed.data,
    totalAmount: toMinorUnits(parsed.data.totalAmount, account.currency),
  });

  revalidatePath("/loans-cards");
  return { ok: true };
}

export async function archiveInstallmentPurchaseAction(
  purchaseId: string,
): Promise<InstallmentActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await archiveInstallmentPurchase(prisma, session.user.id, purchaseId);
  if (result.ok) revalidatePath("/loans-cards");
  return result;
}

export async function payInstallmentTermAction(
  paymentId: string,
  formData: FormData,
): Promise<InstallmentActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const accountId = String(formData.get("accountId"));
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });

  const overrideAmountRaw = formData.get("amount");
  const overrideDateRaw = formData.get("date");

  const result = await payInstallmentTerm(prisma, user.id, user.cycleStartDay, paymentId, {
    accountId,
    amount: overrideAmountRaw ? toMinorUnits(Number(overrideAmountRaw), account.currency) : undefined,
    date: overrideDateRaw ? new Date(String(overrideDateRaw)) : undefined,
  });

  if (result.ok) {
    revalidatePath("/loans-cards");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
  }
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
git commit -m "feat: add server actions for installment purchases"
```

---

### Task 5: Loans & Cards UI — installment purchases

**Files:**
- Create: `src/components/loans-cards/installment-purchase-form-dialog.tsx`, `src/components/loans-cards/due-installment-payments-banner.tsx`, `src/components/loans-cards/installment-purchase-list.tsx`

- [ ] **Step 1: Implement `src/components/loans-cards/installment-purchase-form-dialog.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createInstallmentPurchaseAction } from "@/actions/installment-purchase.actions";
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
  totalAmount: number;
  numberOfTerms: number;
  accountId: string;
  categoryId: string;
  startDate: string;
};

export function InstallmentPurchaseFormDialog({
  creditCardAccounts,
  categories,
}: {
  creditCardAccounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      name: "",
      totalAmount: 0,
      numberOfTerms: 6,
      accountId: creditCardAccounts[0]?.id ?? "",
      categoryId: "",
      startDate: new Date().toISOString().slice(0, 10),
    },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("totalAmount", String(values.totalAmount));
    formData.set("numberOfTerms", String(values.numberOfTerms));
    formData.set("accountId", values.accountId);
    formData.set("categoryId", values.categoryId);
    formData.set("startDate", values.startDate);

    const result = await createInstallmentPurchaseAction(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Installment purchase added");
    setOpen(false);
  }

  const noCreditCardAccounts = creditCardAccounts.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={noCreditCardAccounts} />}>
        Add installment purchase
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add installment purchase</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="totalAmount">Total amount</Label>
            <Input
              id="totalAmount"
              type="number"
              step="0.01"
              {...register("totalAmount", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="numberOfTerms">Number of terms (months)</Label>
            <Input
              id="numberOfTerms"
              type="number"
              min="2"
              max="60"
              {...register("numberOfTerms", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Credit card</Label>
            <select
              id="accountId"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("accountId")}
            >
              {creditCardAccounts.map((a) => (
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">First term due date</Label>
            <Input id="startDate" type="date" {...register("startDate")} />
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

- [ ] **Step 2: Implement `src/components/loans-cards/due-installment-payments-banner.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { payInstallmentTermAction } from "@/actions/installment-purchase.actions";
import { toMajorUnits } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AccountOption = { id: string; name: string; currency: string };

type DuePayment = {
  id: string;
  termNumber: number;
  amount: number;
  dueDate: Date;
  purchaseName: string;
  numberOfTerms: number;
};

export function DueInstallmentPaymentsBanner({
  payments,
  payingAccounts,
}: {
  payments: DuePayment[];
  payingAccounts: AccountOption[];
}) {
  const router = useRouter();
  const [payingAccountId, setPayingAccountId] = useState(payingAccounts[0]?.id ?? "");

  if (payments.length === 0) {
    return null;
  }

  const currency = payingAccounts.find((a) => a.id === payingAccountId)?.currency ?? "PHP";

  async function handlePay(paymentId: string, formData: FormData) {
    formData.set("accountId", payingAccountId);
    const result = await payInstallmentTermAction(paymentId, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Term paid");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Installments due</h2>
        <select
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={payingAccountId}
          onChange={(e) => setPayingAccountId(e.target.value)}
        >
          {payingAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      {payments.map((payment) => (
        <form
          key={payment.id}
          action={(formData) => handlePay(payment.id, formData)}
          className="flex flex-wrap items-center gap-2 rounded-md bg-background p-3"
        >
          <div className="mr-auto">
            <p className="font-medium">
              {payment.purchaseName} — term {payment.termNumber} of {payment.numberOfTerms}
            </p>
            <p className="text-sm text-muted-foreground">due {payment.dueDate.toLocaleDateString()}</p>
          </div>
          <Input
            name="amount"
            type="number"
            step="0.01"
            defaultValue={toMajorUnits(payment.amount, currency)}
            className="w-28"
          />
          <Input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-40" />
          <Button type="submit" size="sm">
            Pay
          </Button>
        </form>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Implement `src/components/loans-cards/installment-purchase-list.tsx`**

```typescript
import { formatMoney } from "@/lib/money";
import { archiveInstallmentPurchaseAction } from "@/actions/installment-purchase.actions";
import { Button } from "@/components/ui/button";

type PurchaseRow = {
  id: string;
  name: string;
  totalAmount: number;
  numberOfTerms: number;
  payments: { status: string; amount: number }[];
  account: { currency: string };
};

export function InstallmentPurchaseList({ purchases }: { purchases: PurchaseRow[] }) {
  if (purchases.length === 0) {
    return <p className="text-muted-foreground">No installment purchases yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {purchases.map((purchase) => {
        const paidCount = purchase.payments.filter((p) => p.status === "PAID").length;
        const remaining = purchase.payments
          .filter((p) => p.status === "PENDING")
          .reduce((sum, p) => sum + p.amount, 0);

        return (
          <div key={purchase.id} className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">{purchase.name}</p>
              <p className="text-sm text-muted-foreground">
                {paidCount} of {purchase.numberOfTerms} terms paid ·{" "}
                {formatMoney(remaining, purchase.account.currency)} remaining of{" "}
                {formatMoney(purchase.totalAmount, purchase.account.currency)}
              </p>
            </div>
            <form
              action={async () => {
                "use server";
                await archiveInstallmentPurchaseAction(purchase.id);
              }}
            >
              <Button type="submit" variant="ghost">
                Archive
              </Button>
            </form>
          </div>
        );
      })}
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
git commit -m "feat: add installment purchase form dialog, due-terms banner, and purchase list"
```

---

### Task 6: Wire installment purchases into the Loans & Cards page

**Files:**
- Modify: `src/app/(app)/loans-cards/page.tsx`

- [ ] **Step 1: Update the page**

Replace the file with:

```typescript
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { listLoans } from "@/lib/loans";
import { listCreditCards } from "@/lib/credit-cards";
import { computeAccountBalance } from "@/lib/account-balance";
import {
  listDueInstallmentPayments,
  listInstallmentPurchases,
} from "@/lib/installment-purchases";
import { LoanFormDialog } from "@/components/loans-cards/loan-form-dialog";
import { LoanList } from "@/components/loans-cards/loan-list";
import { CreditCardFormDialog } from "@/components/loans-cards/credit-card-form-dialog";
import { CreditCardList } from "@/components/loans-cards/credit-card-list";
import { InstallmentPurchaseFormDialog } from "@/components/loans-cards/installment-purchase-form-dialog";
import { DueInstallmentPaymentsBanner } from "@/components/loans-cards/due-installment-payments-banner";
import { InstallmentPurchaseList } from "@/components/loans-cards/installment-purchase-list";

const DEBT_ACCOUNT_TYPES = ["CREDIT_CARD", "LOAN"];

export default async function LoansCardsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const now = new Date();

  const [accounts, categories, loans, creditCards, installmentPurchases, dueInstallmentPayments] =
    await Promise.all([
      listAccounts(prisma, userId),
      listCategories(prisma, userId),
      listLoans(prisma, userId),
      listCreditCards(prisma, userId),
      listInstallmentPurchases(prisma, userId),
      listDueInstallmentPayments(prisma, userId, now),
    ]);

  const payingAccounts = accounts.filter((a) => !DEBT_ACCOUNT_TYPES.includes(a.accountType));

  const linkedAccountIds = new Set(creditCards.map((c) => c.accountId));
  const linkableAccounts = accounts.filter(
    (a) => a.accountType === "CREDIT_CARD" && !linkedAccountIds.has(a.id),
  );
  const creditCardAccounts = accounts.filter((a) => a.accountType === "CREDIT_CARD");

  const cardsWithAccount = await Promise.all(
    creditCards.map(async (card) => {
      const account = accounts.find((a) => a.id === card.accountId)!;
      return {
        ...card,
        account: {
          name: account.name,
          currency: account.currency,
          balance: await computeAccountBalance(prisma, account.id),
        },
      };
    }),
  );

  const purchasesWithAccount = installmentPurchases.map((purchase) => {
    const account = accounts.find((a) => a.id === purchase.accountId)!;
    return { ...purchase, account: { currency: account.currency } };
  });

  const dueInstallmentPaymentsView = dueInstallmentPayments.map((payment) => {
    const purchase = installmentPurchases.find((p) => p.id === payment.installmentPurchaseId)!;
    return {
      id: payment.id,
      termNumber: payment.termNumber,
      amount: payment.amount,
      dueDate: payment.dueDate,
      purchaseName: purchase.name,
      numberOfTerms: purchase.numberOfTerms,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Loans & Cards</h1>
        <div className="flex gap-2">
          <LoanFormDialog />
          <CreditCardFormDialog linkableAccounts={linkableAccounts} />
          <InstallmentPurchaseFormDialog creditCardAccounts={creditCardAccounts} categories={categories} />
        </div>
      </div>

      <DueInstallmentPaymentsBanner payments={dueInstallmentPaymentsView} payingAccounts={payingAccounts} />

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Loans</h2>
        <LoanList loans={loans} payingAccounts={payingAccounts} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Credit cards</h2>
        <CreditCardList
          cards={cardsWithAccount}
          linkableAccounts={linkableAccounts}
          payingAccounts={payingAccounts}
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Installment purchases</h2>
        <InstallmentPurchaseList purchases={purchasesWithAccount} />
      </div>
    </div>
  );
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
git commit -m "feat: wire installment purchases into the Loans & Cards page"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (existing 177 plus this plan's new tests — 11 installment purchases + 5 validation = 16 new tests, 193 total).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Browser walkthrough**

Start the dev server, log in as `demo@example.com` / `demopassword123`, and manually verify (fixing any real bug found, then re-running Steps 1–2):

- Loans & Cards page loads with an empty "Installment purchases" section and "Add installment purchase" disabled if there's no `CREDIT_CARD` account yet (add one via Plan 3B.1's credit card flow first if needed).
- Add an installment purchase (e.g. ₱1000 over 3 terms, first term due today) against the `Everyday Rewards Card` account — confirm the purchase list shows "0 of 3 terms paid" and the full ₱1000 remaining, and confirm the "Installments due" banner shows term 1 due today.
- Pay term 1 — confirm it disappears from the due banner, the purchase list updates to "1 of 3 terms paid" with the correct remaining balance, and a `CREDIT_CARD_PAYMENT` transaction with description "Installment: <name> (term 1 of 3)" appears on the Transactions page.
- Confirm term 2 is *not* yet in the due banner (its due date is a month out) — direct SQLite query is fine for confirming its `dueDate` landed exactly one month after term 1's.
- Archive the installment purchase — confirm it disappears from the list.
- Clean up any test data created during this walkthrough (delete the test installment purchase, its payments, and any transactions created) the same way prior plans' verification steps have.

- [ ] **Step 4: Confirm a clean working tree**

```bash
git status --short
```

Expected: no output (everything already committed; verification found no code changes needed, or any fix was committed above).
