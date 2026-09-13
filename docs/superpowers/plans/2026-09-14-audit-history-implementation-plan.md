# Audit History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every balance-affecting mutation a permanent `AuditLog` row (what changed, before/after, when, how it was triggered) and a working per-entity-type "Undo" that reverses it safely, surfaced through a new `/audit-log` page and small "history" links on the pages that already show these records.

**Architecture:** A single `AuditLog` model, one `recordAudit()` helper that writes a row, and one `undoAuditLogEntry()` dispatcher that loads a row and calls the matching one of ten small, independently-testable reversal functions (one per entity type) — each wrapped in its own `prisma.$transaction`. `recordAudit` is called either inside a domain function's existing `$transaction` (when Quick Capture never calls that function) or at the server-action layer (when Quick Capture also calls it directly), so Quick Capture's own logging/undo stays completely untouched.

**Tech Stack:** Prisma (Postgres via `@prisma/adapter-neon`), Next.js Server Actions, Vitest with mocked-Prisma fixtures (existing convention), Tailwind/shadcn UI.

Spec: `docs/superpowers/specs/2026-09-14-audit-history-design.md`

---

## Task 1: Add the `AuditLog` Prisma model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model**

Add this to `prisma/schema.prisma`, near the other log-like models (e.g. after `QuickCaptureLog`):

```prisma
model AuditLog {
  id                 String    @id @default(cuid())
  userId             String
  entityType         String
  entityId           String
  action             String
  source             String
  previousValuesJson String?
  newValuesJson      String?
  relatedRecordIds   String[]
  reversalOfId       String?
  createdAt          DateTime  @default(now())

  user       User       @relation(fields: [userId], references: [id])
  reversalOf AuditLog?  @relation("AuditReversal", fields: [reversalOfId], references: [id])
  reversedBy AuditLog[] @relation("AuditReversal")

  @@index([userId, createdAt])
  @@index([userId, entityType, entityId])
}
```

Add `auditLogs AuditLog[]` to the `User` model's relation list (next to `quickCaptureLogs`).

- [ ] **Step 2: Generate the Prisma client**

Run:
```bash
npx prisma generate
```
Expected: completes without error and updates the generated client's types to include `AuditLog`. (This only reads `schema.prisma` — it does not need a reachable database. Applying the schema to a real database via `npx prisma db push` happens at Vercel deploy time per this project's existing convention; run it yourself first if you want to test against a live dev database.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (there is no code referencing `AuditLog` yet).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(audit): add the AuditLog model (plan-38 Stage G, §11)"
```

---

## Task 2: `recordAudit` helper

**Files:**
- Create: `src/lib/audit-log.ts`
- Test: `src/lib/audit-log.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/audit-log.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { recordAudit } from "@/lib/audit-log";

function makeFakePrisma() {
  return {
    auditLog: {
      create: vi.fn(async ({ data }: any) => ({ id: "audit-1", ...data })),
    },
  } as any;
}

describe("recordAudit", () => {
  it("writes a row with the given fields, JSON-encoding previous/new values", async () => {
    const prisma = makeFakePrisma();

    const result = await recordAudit(prisma, {
      userId: "user-1",
      entityType: "PAYABLE_PAYMENT",
      entityId: "payable-1",
      action: "CREATE",
      source: "FORM",
      previousValues: { status: "PENDING" },
      newValues: { status: "PAID" },
      relatedRecordIds: ["txn-1"],
    });

    expect(result.id).toBe("audit-1");
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        entityType: "PAYABLE_PAYMENT",
        entityId: "payable-1",
        action: "CREATE",
        source: "FORM",
        previousValuesJson: JSON.stringify({ status: "PENDING" }),
        newValuesJson: JSON.stringify({ status: "PAID" }),
        relatedRecordIds: ["txn-1"],
        reversalOfId: undefined,
      },
    });
  });

  it("stores null for previousValues/newValues when omitted, and defaults relatedRecordIds to []", async () => {
    const prisma = makeFakePrisma();

    await recordAudit(prisma, {
      userId: "user-1",
      entityType: "TRANSACTION",
      entityId: "txn-1",
      action: "CREATE",
      source: "FORM",
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        entityType: "TRANSACTION",
        entityId: "txn-1",
        action: "CREATE",
        source: "FORM",
        previousValuesJson: null,
        newValuesJson: null,
        relatedRecordIds: [],
        reversalOfId: undefined,
      },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/audit-log.test.ts`
Expected: FAIL — `Cannot find module '@/lib/audit-log'` (the file doesn't exist yet).

- [ ] **Step 3: Implement `recordAudit`**

Create `src/lib/audit-log.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export type AuditEntityType =
  | "TRANSACTION"
  | "TRANSFER"
  | "PAYABLE_PAYMENT"
  | "RECEIPT_CONFIRMATION"
  | "RECURRING_OCCURRENCE"
  | "RECURRING_PAYABLE_OCCURRENCE"
  | "INSTALLMENT_PAYMENT"
  | "CREDIT_CARD_PAYMENT"
  | "REMINDER_PAYMENT"
  | "RECONCILIATION";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "REVERSE";
export type AuditSource = "FORM" | "RECEIPT" | "RECURRING_RULE" | "SYSTEM";

export type RecordAuditInput = {
  userId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  source: AuditSource;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  relatedRecordIds?: string[];
  reversalOfId?: string;
};

// The one place that writes an AuditLog row. Called either inside a domain
// function's own $transaction (when Quick Capture never calls that
// function) or at the server-action layer wrapping a shared domain function
// in a new $transaction (when Quick Capture also calls it directly) — see
// docs/superpowers/specs/2026-09-14-audit-history-design.md for which is
// which. Quick Capture's own logging (QuickCaptureLog) never calls this.
export async function recordAudit(
  prisma: Pick<PrismaClient, "auditLog">,
  input: RecordAuditInput,
): Promise<{ id: string }> {
  const row = await prisma.auditLog.create({
    data: {
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      source: input.source,
      previousValuesJson: input.previousValues ? JSON.stringify(input.previousValues) : null,
      newValuesJson: input.newValues ? JSON.stringify(input.newValues) : null,
      relatedRecordIds: input.relatedRecordIds ?? [],
      reversalOfId: input.reversalOfId,
    },
  });
  return { id: row.id };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/audit-log.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit-log.ts src/lib/audit-log.test.ts
git commit -m "feat(audit): add recordAudit helper (plan-38 Stage G, §11)"
```

---

## Task 3: Wire `recordAudit` into `markPayablePaid` (embedded)

**Files:**
- Modify: `src/lib/payables.ts`
- Modify: `src/lib/payables.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/payables.test.ts`, inside the `describe("markPayablePaid", ...)` block (after the existing tests) — first add `auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) }` to `makeFakePrisma`'s returned object (next to `budgetPeriod`), then add:

```ts
  it("records an audit entry for the payment", async () => {
    const prisma = makeFakePrisma();

    await markPayablePaid(prisma, "user-1", 25, "payable-1", {});

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        entityType: "PAYABLE_PAYMENT",
        entityId: "payable-1",
        action: "CREATE",
        source: "FORM",
        relatedRecordIds: ["txn-1"],
      }),
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/payables.test.ts`
Expected: FAIL — `prisma.auditLog.create` was never called (the wiring doesn't exist yet).

- [ ] **Step 3: Implement**

In `src/lib/payables.ts`, add the import and widen `markPayablePaid`'s Prisma type and body:

```ts
import { recordAudit } from "@/lib/audit-log";
```

Change:
```ts
export async function markPayablePaid(
  prisma: Pick<PrismaClient, "payable" | "transaction" | "budgetPeriod" | "$transaction">,
```
to:
```ts
export async function markPayablePaid(
  prisma: Pick<PrismaClient, "payable" | "transaction" | "budgetPeriod" | "auditLog" | "$transaction">,
```

Inside the `$transaction` callback, right after the existing `await tx.payable.update(...)` call and before `return { ok: true };`, add:

```ts
    await recordAudit(tx, {
      userId,
      entityType: "PAYABLE_PAYMENT",
      entityId: payableId,
      action: "CREATE",
      source: "FORM",
      previousValues: { status: "PENDING", paidTransactionId: null },
      newValues: { status: "PAID", paidTransactionId: transaction.id },
      relatedRecordIds: [transaction.id],
    });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/payables.test.ts`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add src/lib/payables.ts src/lib/payables.test.ts
git commit -m "feat(audit): record PAYABLE_PAYMENT audit entries (plan-38 Stage G, §11)"
```

---

## Task 4: Wire `recordAudit` into `confirmReceipt` (embedded)

**Files:**
- Modify: `src/lib/receipts.ts`
- Modify: `src/lib/receipts.test.ts`

- [ ] **Step 1: Write the failing test**

Add `auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) }` to `receipts.test.ts`'s `makeFakePrisma` object (next to `shoppingPriceHistory`), then add this test inside `describe("confirmReceipt", ...)`:

```ts
  it("records an audit entry listing the transaction and every price-history row created", async () => {
    const prisma = makeFakePrisma({
      receipt: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          id: "receipt-1",
          userId: "user-1",
          storeId: "store-1",
          subtotal: 30000,
          discount: 0,
          tax: 0,
          fees: 0,
          grandTotal: 30000,
          unitemizedDifference: 0,
          lines: [{ id: "line-1", lineTotal: 30000, excluded: false, catalogItemId: "cat-item-1", unitPrice: 30000 }],
        }),
        update: vi.fn(async ({ data }: any) => ({ id: "receipt-1", ...data })),
      },
    });

    await confirmReceipt(prisma, "user-1", 1, "receipt-1", {
      accountId: "acc-1",
      categoryId: "cat-1",
      date: new Date(2026, 0, 1),
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        entityType: "RECEIPT_CONFIRMATION",
        entityId: "receipt-1",
        action: "CREATE",
        source: "RECEIPT",
        relatedRecordIds: ["txn-1", "price-1"],
      }),
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: FAIL — `prisma.auditLog.create` was never called.

- [ ] **Step 3: Implement**

In `src/lib/receipts.ts`, add the import:

```ts
import { recordAudit } from "@/lib/audit-log";
```

Widen `ConfirmPrisma`:
```ts
type ConfirmPrisma = Pick<
  PrismaClient,
  "receipt" | "transaction" | "budgetPeriod" | "shoppingPriceHistory" | "auditLog" | "$transaction"
>;
```

Inside `confirmReceipt`'s `$transaction` callback, capture the price-history ids as they're created and record the audit entry before `return { ok: true, transactionId: transaction.id };`:

```ts
    const priceHistoryIds: string[] = [];
    for (const line of receipt.lines as {
      excluded: boolean;
      catalogItemId: string | null;
      unitPrice: number | null;
    }[]) {
      if (line.excluded || !line.catalogItemId || line.unitPrice === null) continue;
      const priceHistory = await tx.shoppingPriceHistory.create({
        data: {
          userId,
          catalogItemId: line.catalogItemId,
          storeId: receipt.storeId,
          unitPrice: line.unitPrice,
          source: "RECEIPT",
        },
      });
      priceHistoryIds.push(priceHistory.id);
    }

    await recordAudit(tx, {
      userId,
      entityType: "RECEIPT_CONFIRMATION",
      entityId: receiptId,
      action: "CREATE",
      source: "RECEIPT",
      previousValues: { status: "DRAFT_OR_REVIEWED", transactionId: null },
      newValues: { status: "CONFIRMED", transactionId: transaction.id },
      relatedRecordIds: [transaction.id, ...priceHistoryIds],
    });

    return { ok: true, transactionId: transaction.id };
```

This replaces the existing `for (const line of receipt.lines ...)` loop that discarded `tx.shoppingPriceHistory.create`'s result — the loop body is the same, it now also captures each created row's `id`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/lib/receipts.ts src/lib/receipts.test.ts
git commit -m "feat(audit): record RECEIPT_CONFIRMATION audit entries (plan-38 Stage G, §11)"
```

---

## Task 5: Wire `recordAudit` into `confirmRecurringOccurrence` (embedded)

**Files:**
- Modify: `src/lib/recurring.ts`
- Modify: `src/lib/recurring.test.ts`

- [ ] **Step 1: Write the failing test**

Add `auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) }` to `recurring.test.ts`'s `makeFakePrisma` object, then add inside `describe("confirmRecurringOccurrence", ...)`:

```ts
  it("records an audit entry capturing the nextDate change and the created transaction", async () => {
    const prisma = makeFakePrisma();

    await confirmRecurringOccurrence(prisma, "user-1", 25, "rule-1", {});

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        entityType: "RECURRING_OCCURRENCE",
        entityId: "rule-1",
        action: "CREATE",
        source: "RECURRING_RULE",
        previousValuesJson: JSON.stringify({ nextDate: new Date(2026, 8, 25) }),
        newValuesJson: JSON.stringify({ nextDate: new Date(2026, 9, 25) }),
        relatedRecordIds: ["txn-1"],
      }),
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/recurring.test.ts`
Expected: FAIL — `prisma.auditLog.create` was never called.

- [ ] **Step 3: Implement**

In `src/lib/recurring.ts`, add the import:

```ts
import { recordAudit } from "@/lib/audit-log";
```

Widen `confirmRecurringOccurrence`'s Prisma type:
```ts
export async function confirmRecurringOccurrence(
  prisma: Pick<PrismaClient, "recurringRule" | "transaction" | "budgetPeriod" | "auditLog" | "$transaction">,
```

Inside its `$transaction` callback, capture the created transaction (it's already captured, just not currently kept — verify the `const transaction = await createExpenseLikeTransaction(...)` assignment exists; if the current code discards it as a bare `await createExpenseLikeTransaction(...)`, change it to capture the return value) and record the audit entry right before `return { ok: true };`:

```ts
    const transaction = await createExpenseLikeTransaction(tx, userId, cycleStartDay, {
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
    await tx.recurringRule.update({ where: { id: ruleId }, data: { nextDate } });

    await recordAudit(tx, {
      userId,
      entityType: "RECURRING_OCCURRENCE",
      entityId: ruleId,
      action: "CREATE",
      source: "RECURRING_RULE",
      previousValues: { nextDate: rule.nextDate },
      newValues: { nextDate },
      relatedRecordIds: [transaction.id],
    });

    return { ok: true };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/recurring.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring.ts src/lib/recurring.test.ts
git commit -m "feat(audit): record RECURRING_OCCURRENCE audit entries (plan-38 Stage G, §11)"
```

---

## Task 6: Wire `recordAudit` into `confirmRecurringPayableOccurrence` (embedded)

**Files:**
- Modify: `src/lib/recurring-payables.ts`
- Modify: `src/lib/recurring-payables.test.ts`

- [ ] **Step 1: Write the failing test**

Add `auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) }` to `recurring-payables.test.ts`'s `makeFakePrisma` object, then add inside `describe("confirmRecurringPayableOccurrence", ...)` (check the existing test file for its fixture's `payable.create` mock — it must resolve an object with an `id`, e.g. `{ id: "payable-new" }`, for this test to have something to assert on):

```ts
  it("records an audit entry capturing the nextDueDate change and the created payable", async () => {
    const prisma = makeFakePrisma();

    await confirmRecurringPayableOccurrence(prisma, "user-1", "rule-1", {});

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        entityType: "RECURRING_PAYABLE_OCCURRENCE",
        entityId: "rule-1",
        action: "CREATE",
        source: "RECURRING_RULE",
        relatedRecordIds: ["payable-new"],
      }),
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/recurring-payables.test.ts`
Expected: FAIL — `prisma.auditLog.create` was never called.

- [ ] **Step 3: Implement**

In `src/lib/recurring-payables.ts`, add the import:

```ts
import { recordAudit } from "@/lib/audit-log";
```

Widen `confirmRecurringPayableOccurrence`'s Prisma type:
```ts
export async function confirmRecurringPayableOccurrence(
  prisma: Pick<PrismaClient, "recurringPayable" | "payable" | "auditLog" | "$transaction">,
```

Inside its `$transaction` callback, capture the created payable (currently `await tx.payable.create({...})` discards the result — change to `const payable = await tx.payable.create({...})`) and record the audit entry before `return { ok: true };`:

```ts
    const payable = await tx.payable.create({
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
    await tx.recurringPayable.update({ where: { id: ruleId }, data: { nextDueDate } });

    await recordAudit(tx, {
      userId,
      entityType: "RECURRING_PAYABLE_OCCURRENCE",
      entityId: ruleId,
      action: "CREATE",
      source: "RECURRING_RULE",
      previousValues: { nextDueDate: rule.nextDueDate },
      newValues: { nextDueDate },
      relatedRecordIds: [payable.id],
    });

    return { ok: true };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/recurring-payables.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring-payables.ts src/lib/recurring-payables.test.ts
git commit -m "feat(audit): record RECURRING_PAYABLE_OCCURRENCE audit entries (plan-38 Stage G, §11)"
```

---

## Task 7: Wire `recordAudit` into `payInstallmentTerm` (embedded)

**Files:**
- Modify: `src/lib/installment-purchases.ts`
- Modify: `src/lib/installment-purchases.test.ts`

- [ ] **Step 1: Write the failing test**

Add `auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) }` to `installment-purchases.test.ts`'s `makeFakePrisma` object, then add inside `describe("payInstallmentTerm", ...)`:

```ts
  it("records an audit entry for the payment", async () => {
    const prisma = makeFakePrisma();

    await payInstallmentTerm(prisma, "user-1", 25, "payment-1", { accountId: "acc-checking" });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        entityType: "INSTALLMENT_PAYMENT",
        entityId: "payment-1",
        action: "CREATE",
        source: "FORM",
        relatedRecordIds: ["txn-1"],
      }),
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/installment-purchases.test.ts`
Expected: FAIL — `prisma.auditLog.create` was never called.

- [ ] **Step 3: Implement**

In `src/lib/installment-purchases.ts`, add the import:

```ts
import { recordAudit } from "@/lib/audit-log";
```

Widen `payInstallmentTerm`'s Prisma type:
```ts
export async function payInstallmentTerm(
  prisma: Pick<
    PrismaClient,
    "installmentPurchase" | "installmentPayment" | "transaction" | "budgetPeriod" | "auditLog" | "$transaction"
  >,
```

Inside its `$transaction` callback, add the call right before `return { ok: true };`:

```ts
    await recordAudit(tx, {
      userId,
      entityType: "INSTALLMENT_PAYMENT",
      entityId: paymentId,
      action: "CREATE",
      source: "FORM",
      previousValues: { status: "PENDING", paidTransactionId: null },
      newValues: { status: "PAID", paidTransactionId: transaction.id },
      relatedRecordIds: [transaction.id],
    });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/installment-purchases.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/lib/installment-purchases.ts src/lib/installment-purchases.test.ts
git commit -m "feat(audit): record INSTALLMENT_PAYMENT audit entries (plan-38 Stage G, §11)"
```

---

## Task 8: Wire `recordAudit` into calendar reminders' `markPaid` (embedded)

**Files:**
- Modify: `src/lib/calendar/reminders.ts`
- Modify: `src/lib/calendar/reminders.test.ts`

- [ ] **Step 1: Write the failing test**

Add `auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) }` to `reminders.test.ts`'s `makeFakePrisma` object, then add inside `describe("markPaid", ...)`:

```ts
  it("records an audit entry for the payment", async () => {
    const prisma = makeFakePrisma({
      customReminder: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "reminder-1", userId: "user-1", label: "Passport renewal", amount: 500000 }),
        update: vi.fn(async ({ data }: any) => ({ id: "reminder-1", ...data })),
        delete: vi.fn(),
      },
    });

    await markPaid(prisma, "user-1", 1, "reminder-1", { accountId: "acc-1", categoryId: "cat-1" });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        entityType: "REMINDER_PAYMENT",
        entityId: "reminder-1",
        action: "CREATE",
        source: "FORM",
        relatedRecordIds: ["txn-1"],
      }),
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/calendar/reminders.test.ts`
Expected: FAIL — `prisma.auditLog.create` was never called.

- [ ] **Step 3: Implement**

In `src/lib/calendar/reminders.ts`, add the import:

```ts
import { recordAudit } from "@/lib/audit-log";
```

Widen `markPaid`'s Prisma type:
```ts
export async function markPaid(
  prisma: Pick<PrismaClient, "customReminder" | "transaction" | "budgetPeriod" | "auditLog" | "$transaction">,
```

Inside its `$transaction` callback, add the call right before `return { ok: true, id: reminderId };`:

```ts
    await recordAudit(tx, {
      userId,
      entityType: "REMINDER_PAYMENT",
      entityId: reminderId,
      action: "CREATE",
      source: "FORM",
      previousValues: { state: "UPCOMING", linkedTransactionId: null },
      newValues: { state: "PAID", linkedTransactionId: transaction.id },
      relatedRecordIds: [transaction.id],
    });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/calendar/reminders.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar/reminders.ts src/lib/calendar/reminders.test.ts
git commit -m "feat(audit): record REMINDER_PAYMENT audit entries (plan-38 Stage G, §11)"
```

---

## Task 9: Widen `deleteTransaction` to return the deleted row(s), and `makeCreditCardPayment` to return the transaction id

**Files:**
- Modify: `src/lib/transactions.ts`
- Modify: `src/lib/transactions.test.ts`
- Modify: `src/lib/credit-cards.ts`
- Modify: `src/lib/credit-cards.test.ts`

Both of these functions are also called directly by Quick Capture (`src/lib/quick-capture/execute.ts`), which only ever checks `.ok` and never destructures the extra fields added here — so this widening is non-breaking for it. This task exists because the *next* task (action-layer audit wiring) needs data these functions currently throw away.

- [ ] **Step 1: Update the existing tests, and add new ones**

`src/lib/transactions.test.ts` already has a `describe("deleteTransaction", ...)` block with 3 tests. Two of them assert the *old* return shape and one of them (`"deletes both linked rows for a transfer"`) sets `prisma.transaction.findFirst` to an unconditional `mockResolvedValue` — the new implementation (Step 3) calls `findFirst` a second time to fetch the linked row by its own id, so that unconditional mock would incorrectly return the first row again for the second call. Replace the entire block:

```ts
describe("deleteTransaction", () => {
  it("deletes a single (non-transfer) row scoped to the user, and returns it", async () => {
    const prisma = makeFakePrisma();
    const row = { id: "txn-1", userId: "user-1", linkedTransactionId: null, amount: -5000, type: "EXPENSE" };
    prisma.transaction.findFirst.mockResolvedValue(row);

    const result = await deleteTransaction(prisma, "user-1", "txn-1");

    expect(result).toEqual({ ok: true, deletedRows: [row] });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["txn-1"] }, userId: "user-1" },
    });
  });

  it("deletes and returns both linked rows for a transfer", async () => {
    const prisma = makeFakePrisma();
    const outgoing = { id: "txn-1", userId: "user-1", linkedTransactionId: "txn-2", amount: -5000, type: "TRANSFER" };
    const incoming = { id: "txn-2", userId: "user-1", linkedTransactionId: "txn-1", amount: 5000, type: "TRANSFER" };
    prisma.transaction.findFirst = vi.fn((args: any) =>
      Promise.resolve(args.where.id === "txn-1" ? outgoing : incoming),
    );

    const result = await deleteTransaction(prisma, "user-1", "txn-1");

    expect(result).toEqual({ ok: true, deletedRows: [outgoing, incoming] });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["txn-1", "txn-2"] }, userId: "user-1" },
    });
  });

  it("reports not found for a transaction the user doesn't own", async () => {
    const prisma = makeFakePrisma();
    prisma.transaction.findFirst.mockResolvedValue(null);

    const result = await deleteTransaction(prisma, "user-1", "txn-1");

    expect(result).toEqual({ ok: false, error: "Transaction not found" });
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled();
  });
});
```

`src/lib/credit-cards.test.ts` already has a `describe("makeCreditCardPayment", ...)` block whose first test asserts the *old* return shape. Change:
```ts
    expect(result).toEqual({ ok: true });
```
to:
```ts
    expect(result).toEqual({ ok: true, transactionId: "txn-1" });
```
in the `"creates a CREDIT_CARD_PAYMENT transaction against the paying account"` test (its `makeFakePrisma`'s `transaction.create` already resolves `{ id: "txn-1" }`, confirmed from the current file).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/transactions.test.ts src/lib/credit-cards.test.ts`
Expected: FAIL — `deleteTransaction` currently returns `{ ok: true }` with no `deletedRows`; `makeCreditCardPayment` currently returns `{ ok: true }` with no `transactionId`; the transfer-deletion test's two-different-rows mock doesn't match the current single-`findFirst`-call implementation yet either.

- [ ] **Step 3: Implement**

In `src/lib/transactions.ts`, replace `deleteTransaction`:

```ts
export type DeleteTransactionResult =
  | { ok: true; deletedRows: Record<string, unknown>[] }
  | { ok: false; error: string };

export async function deleteTransaction(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  transactionId: string,
): Promise<DeleteTransactionResult> {
  const existing = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  });
  if (!existing) {
    return { ok: false, error: "Transaction not found" };
  }

  const linked = existing.linkedTransactionId
    ? await prisma.transaction.findFirst({ where: { id: existing.linkedTransactionId, userId } })
    : null;

  const idsToDelete = linked ? [existing.id, linked.id] : [existing.id];

  await prisma.transaction.deleteMany({
    where: { id: { in: idsToDelete }, userId },
  });

  return { ok: true, deletedRows: linked ? [existing, linked] : [existing] };
}
```

In `src/lib/credit-cards.ts`, change `CreditCardMutationResult`'s use in `makeCreditCardPayment` to a dedicated return type and capture the created transaction:

```ts
export type MakeCreditCardPaymentResult =
  | { ok: true; transactionId: string }
  | { ok: false; error: string };

export async function makeCreditCardPayment(
  prisma: Pick<PrismaClient, "creditCard" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  creditCardId: string,
  input: CreditCardPaymentInput,
): Promise<MakeCreditCardPaymentResult> {
  const card = await prisma.creditCard.findFirst({ where: { id: creditCardId, userId } });
  if (!card) {
    return { ok: false, error: "Credit card not found" };
  }

  const transaction = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "CREDIT_CARD_PAYMENT",
    amount: input.amount,
    date: input.date,
    accountId: input.accountId,
    description: "Credit card payment",
  });

  return { ok: true, transactionId: transaction.id };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/transactions.test.ts src/lib/credit-cards.test.ts`
Expected: PASS (all tests in both files)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — both callers (`transaction.actions.ts`/`quick-capture/execute.ts` for `deleteTransaction`; `credit-card.actions.ts`/`quick-capture/execute.ts` for `makeCreditCardPayment`) only read `.ok` today, so the wider return type doesn't break them.

- [ ] **Step 6: Commit**

```bash
git add src/lib/transactions.ts src/lib/transactions.test.ts src/lib/credit-cards.ts src/lib/credit-cards.test.ts
git commit -m "feat(audit): widen deleteTransaction/makeCreditCardPayment return values for audit wiring (plan-38 Stage G, §11)"
```

---

## Task 10: Wire `recordAudit` into `transaction.actions.ts` (action-layer)

**Files:**
- Modify: `src/actions/transaction.actions.ts`
- Test: `src/actions/transaction.actions.test.ts` (new — no test file exists for actions today; check first and adjust if one now exists)

This covers manual create/update/delete of a transaction, and creating a transfer — the four flows Quick Capture also reaches directly through the same `src/lib/transactions.ts` functions, so the audit call must live here, one layer above, not inside those shared functions.

- [ ] **Step 1: Write the failing test**

Create `src/actions/transaction.actions.test.ts`. This module's actions call `auth()` and use the shared `prisma` singleton, so test the underlying pattern directly instead of importing the "use server" file (which needs a request context) — write a small local helper mirroring exactly what each action does, calling the real lib functions with a fake prisma, and assert `auditLog.create` is invoked correctly. (If a different testing convention for actions already exists elsewhere in this codebase by the time you implement this, follow that convention instead — check `src/actions/*.test.ts` for a precedent before writing this file.)

```ts
import { describe, expect, it, vi } from "vitest";
import { createExpenseLikeTransaction, createTransferTransaction, deleteTransaction, updateTransaction } from "@/lib/transactions";
import { recordAudit } from "@/lib/audit-log";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  const prisma: any = {
    transaction: {
      create: vi.fn(async ({ data }: any) => ({ id: "txn-1", ...data })),
      findFirst: vi.fn().mockResolvedValue({ id: "txn-1", userId: "user-1", linkedTransactionId: null, amount: -5000, type: "EXPENSE", description: "Coffee", notes: null, categoryId: "cat-1", subcategoryId: null }),
      deleteMany: vi.fn(),
      update: vi.fn(async ({ data }: any) => ({ id: "txn-1", ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    budgetPeriod: { findUnique: vi.fn().mockResolvedValue({ id: "period-1" }), create: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    ...overrides,
  };
  prisma.$transaction = overrides.$transaction ?? vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

// Mirrors createTransactionAction's audit wiring exactly.
async function createTransactionWithAudit(prisma: any, userId: string, cycleStartDay: number, input: any) {
  return prisma.$transaction(async (tx: any) => {
    const transaction = await createExpenseLikeTransaction(tx, userId, cycleStartDay, input);
    await recordAudit(tx, {
      userId,
      entityType: "TRANSACTION",
      entityId: transaction.id,
      action: "CREATE",
      source: "FORM",
      newValues: { rows: [transaction] },
    });
    return transaction;
  });
}

describe("createTransactionAction's audit wiring", () => {
  it("records a TRANSACTION/CREATE audit entry", async () => {
    const prisma = makeFakePrisma();

    await createTransactionWithAudit(prisma, "user-1", 25, {
      type: "EXPENSE",
      amount: 5000,
      date: new Date(2026, 8, 1),
      accountId: "acc-1",
      description: "Coffee",
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", entityType: "TRANSACTION", action: "CREATE", source: "FORM" }),
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/actions/transaction.actions.test.ts`
Expected: FAIL — this test file doesn't exist as passing code yet (it's new), but more importantly it establishes the pattern `transaction.actions.ts` itself doesn't implement yet. Confirm it fails for the right reason (`auditLog.create` not called) once the helper above is in place, then move to Step 3 to make the *real* action file match this pattern.

- [ ] **Step 3: Implement**

Rewrite `src/actions/transaction.actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { transactionSchema, transferSchema } from "@/lib/validations/transaction";
import {
  createExpenseLikeTransaction,
  createTransferTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/lib/transactions";
import { recordAudit } from "@/lib/audit-log";
import { toMinorUnits } from "@/lib/money";

export type TransactionActionResult = { ok: true } | { ok: false; error: string };

async function currentUser() {
  const session = await auth();
  if (!session?.user) return null;
  return prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
}

export async function createTransactionAction(
  formData: FormData,
): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const parsed = transactionSchema.safeParse({
    type: formData.get("type"),
    amount: Number(formData.get("amount")),
    date: new Date(String(formData.get("date"))),
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || undefined,
    subcategoryId: formData.get("subcategoryId") || undefined,
    description: formData.get("description"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Please check the transaction details" };

  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });
  const input = { ...parsed.data, amount: toMinorUnits(parsed.data.amount, account.currency) };

  await prisma.$transaction(async (tx) => {
    const transaction = await createExpenseLikeTransaction(tx, user.id, user.cycleStartDay, input);
    await recordAudit(tx, {
      userId: user.id,
      entityType: "TRANSACTION",
      entityId: transaction.id,
      action: "CREATE",
      source: "FORM",
      newValues: { rows: [transaction] },
    });
  });

  revalidatePath("/transactions");
  return { ok: true };
}

export async function createTransferAction(formData: FormData): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const parsed = transferSchema.safeParse({
    amount: Number(formData.get("amount")),
    date: new Date(String(formData.get("date"))),
    sourceAccountId: formData.get("sourceAccountId"),
    destinationAccountId: formData.get("destinationAccountId"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the transfer details" };
  }

  const [source, destination] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { id: parsed.data.sourceAccountId } }),
    prisma.account.findUniqueOrThrow({ where: { id: parsed.data.destinationAccountId } }),
  ]);

  if (source.currency !== destination.currency) {
    return { ok: false, error: "Transfers between different currencies aren't supported yet" };
  }

  const input = { ...parsed.data, amount: toMinorUnits(parsed.data.amount, source.currency) };

  await prisma.$transaction(async (tx) => {
    const transfer = await createTransferTransaction(tx, user.id, user.cycleStartDay, input);
    await recordAudit(tx, {
      userId: user.id,
      entityType: "TRANSFER",
      entityId: transfer.outgoingTransactionId,
      action: "CREATE",
      source: "FORM",
      relatedRecordIds: [transfer.incomingTransactionId],
    });
  });

  revalidatePath("/transactions");
  return { ok: true };
}

export async function updateTransactionAction(
  transactionId: string,
  formData: FormData,
): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const before = await prisma.transaction.findFirst({ where: { id: transactionId, userId: user.id } });
  if (!before) return { ok: false, error: "Transaction not found" };

  const input = {
    description: String(formData.get("description") ?? ""),
    notes: (formData.get("notes") as string) || undefined,
    categoryId: (formData.get("categoryId") as string) || null,
    subcategoryId: (formData.get("subcategoryId") as string) || null,
  };

  const result = await prisma.$transaction(async (tx) => {
    const updateResult = await updateTransaction(tx, user.id, transactionId, input);
    if (!updateResult.ok) return updateResult;
    await recordAudit(tx, {
      userId: user.id,
      entityType: "TRANSACTION",
      entityId: transactionId,
      action: "UPDATE",
      source: "FORM",
      previousValues: {
        description: before.description,
        notes: before.notes,
        categoryId: before.categoryId,
        subcategoryId: before.subcategoryId,
      },
      newValues: input,
    });
    return updateResult;
  });

  if (result.ok) revalidatePath("/transactions");
  return result;
}

export async function deleteTransactionAction(
  transactionId: string,
): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const result = await prisma.$transaction(async (tx) => {
    const deleteResult = await deleteTransaction(tx, user.id, transactionId);
    if (!deleteResult.ok) return deleteResult;
    await recordAudit(tx, {
      userId: user.id,
      entityType: "TRANSACTION",
      entityId: transactionId,
      action: "DELETE",
      source: "FORM",
      previousValues: { rows: deleteResult.deletedRows },
      relatedRecordIds: deleteResult.deletedRows.slice(1).map((r: any) => r.id as string),
    });
    return deleteResult;
  });

  if (result.ok) revalidatePath("/transactions");
  return { ok: result.ok, ...(result.ok ? {} : { error: result.error }) } as TransactionActionResult;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/actions/transaction.actions.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass (existing manual QA of `/transactions` create/update/delete/transfer forms should also still behave identically — nothing about their inputs or return shapes changed for the caller).

- [ ] **Step 6: Commit**

```bash
git add src/actions/transaction.actions.ts src/actions/transaction.actions.test.ts
git commit -m "feat(audit): record TRANSACTION/TRANSFER audit entries at the action layer (plan-38 Stage G, §11)"
```

---

## Task 11: Wire `recordAudit` into `credit-card.actions.ts` and `reconciliation.actions.ts` (action-layer)

**Files:**
- Modify: `src/actions/credit-card.actions.ts`
- Modify: `src/actions/reconciliation.actions.ts`

- [ ] **Step 1: Implement — credit card payment**

In `src/actions/credit-card.actions.ts`, add the import and wrap `makeCreditCardPaymentAction`'s body:

```ts
import { recordAudit } from "@/lib/audit-log";
```

Replace:
```ts
  const result = await makeCreditCardPayment(prisma, user.id, user.cycleStartDay, creditCardId, {
    accountId,
    amount,
    date,
  });

  if (result.ok) {
```
with:
```ts
  const result = await prisma.$transaction(async (tx) => {
    const paymentResult = await makeCreditCardPayment(tx, user.id, user.cycleStartDay, creditCardId, {
      accountId,
      amount,
      date,
    });
    if (!paymentResult.ok) return paymentResult;
    await recordAudit(tx, {
      userId: user.id,
      entityType: "CREDIT_CARD_PAYMENT",
      entityId: paymentResult.transactionId,
      action: "CREATE",
      source: "FORM",
      newValues: { creditCardId, accountId, amount, date },
    });
    return paymentResult;
  });

  if (result.ok) {
```

(The final `return result;` at the end of the function stays as-is — `result` now carries `transactionId` too, which is fine since `CreditCardActionResult`'s declared type only requires `{ ok: true } | { ok: false; error }` and TypeScript allows returning a structurally-wider value.)

- [ ] **Step 2: Implement — reconciliation**

In `src/actions/reconciliation.actions.ts`, add the import and wrap `applyReconciliationAction`'s body:

```ts
import { recordAudit } from "@/lib/audit-log";
```

Replace:
```ts
  const result = await applyReconciliation(
    prisma,
    user.id,
    user.cycleStartDay,
    accountId,
    toMinorUnits(parsed.data.actualBalance, account.currency),
  );

  if (result.ok) {
```
with:
```ts
  const result = await prisma.$transaction(async (tx) => {
    const reconcileResult = await applyReconciliation(
      tx,
      user.id,
      user.cycleStartDay,
      accountId,
      toMinorUnits(parsed.data.actualBalance, account.currency),
    );
    if (!reconcileResult.ok || reconcileResult.alreadyBalanced || !reconcileResult.transactionId) {
      return reconcileResult;
    }
    await recordAudit(tx, {
      userId: user.id,
      entityType: "RECONCILIATION",
      entityId: reconcileResult.transactionId,
      action: "CREATE",
      source: "SYSTEM",
      newValues: { accountId, actualBalance: toMinorUnits(parsed.data.actualBalance, account.currency) },
    });
    return reconcileResult;
  });

  if (result.ok) {
```

- [ ] **Step 3: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass. (There is no dedicated action-layer test file for these two today, matching the codebase's existing convention of testing the lib functions directly — this task's correctness is covered by Task 12's reversal tests exercising the same `recordAudit` call shape, plus manual verification against the running app in the Definition-of-Done pass.)

- [ ] **Step 4: Commit**

```bash
git add src/actions/credit-card.actions.ts src/actions/reconciliation.actions.ts
git commit -m "feat(audit): record CREDIT_CARD_PAYMENT and RECONCILIATION audit entries at the action layer (plan-38 Stage G, §11)"
```

---

## Task 12: Reversal functions, part 1 — `TRANSACTION`, `TRANSFER`, `PAYABLE_PAYMENT`

**Files:**
- Create: `src/lib/audit-log-reversal.ts`
- Test: `src/lib/audit-log-reversal.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/audit-log-reversal.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { reverseTransaction, reverseTransfer, reversePayablePayment } from "@/lib/audit-log-reversal";

function makeFakePrisma(overrides: Record<string, any> = {}) {
  const prisma: any = {
    transaction: { create: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
    payable: { update: vi.fn() },
    auditLog: { create: vi.fn(async ({ data }: any) => ({ id: "audit-reverse-1", ...data })) },
    ...overrides,
  };
  prisma.$transaction = overrides.$transaction ?? vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

describe("reverseTransaction", () => {
  it("CREATE: deletes the transaction and writes a REVERSE entry", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1",
      userId: "user-1",
      entityType: "TRANSACTION",
      entityId: "txn-1",
      action: "CREATE",
      source: "FORM",
      previousValuesJson: null,
      newValuesJson: JSON.stringify({ rows: [{ id: "txn-1" }] }),
      relatedRecordIds: [],
    };

    const result = await reverseTransaction(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityType: "TRANSACTION", action: "REVERSE", reversalOfId: "audit-1" }),
    });
  });

  it("DELETE: recreates every row from previousValuesJson.rows", async () => {
    const prisma = makeFakePrisma();
    const outgoing = { id: "txn-1", userId: "user-1", amount: -5000 };
    const incoming = { id: "txn-2", userId: "user-1", amount: 5000 };
    const entry = {
      id: "audit-1",
      userId: "user-1",
      entityType: "TRANSACTION",
      entityId: "txn-1",
      action: "DELETE",
      source: "FORM",
      previousValuesJson: JSON.stringify({ rows: [outgoing, incoming] }),
      newValuesJson: null,
      relatedRecordIds: ["txn-2"],
    };

    const result = await reverseTransaction(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.create).toHaveBeenCalledWith({ data: outgoing });
    expect(prisma.transaction.create).toHaveBeenCalledWith({ data: incoming });
  });

  it("UPDATE: restores previousValuesJson onto the row", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1",
      userId: "user-1",
      entityType: "TRANSACTION",
      entityId: "txn-1",
      action: "UPDATE",
      source: "FORM",
      previousValuesJson: JSON.stringify({ description: "Old" }),
      newValuesJson: JSON.stringify({ description: "New" }),
      relatedRecordIds: [],
    };

    await reverseTransaction(prisma, "user-1", entry as any);

    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn-1" },
      data: { description: "Old" },
    });
  });
});

describe("reverseTransfer", () => {
  it("deletes both linked rows and writes a REVERSE entry", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1",
      userId: "user-1",
      entityType: "TRANSFER",
      entityId: "txn-out",
      action: "CREATE",
      source: "FORM",
      previousValuesJson: null,
      newValuesJson: null,
      relatedRecordIds: ["txn-in"],
    };

    const result = await reverseTransfer(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["txn-out", "txn-in"] }, userId: "user-1" },
    });
  });
});

describe("reversePayablePayment", () => {
  it("deletes the payment transaction and reverts the payable to PENDING", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1",
      userId: "user-1",
      entityType: "PAYABLE_PAYMENT",
      entityId: "payable-1",
      action: "CREATE",
      source: "FORM",
      previousValuesJson: null,
      newValuesJson: null,
      relatedRecordIds: ["txn-1"],
    };

    const result = await reversePayablePayment(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
    expect(prisma.payable.update).toHaveBeenCalledWith({
      where: { id: "payable-1" },
      data: { status: "PENDING", paidTransactionId: null },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/audit-log-reversal.test.ts`
Expected: FAIL — `Cannot find module '@/lib/audit-log-reversal'`.

- [ ] **Step 3: Implement**

Create `src/lib/audit-log-reversal.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { recordAudit } from "@/lib/audit-log";

export type AuditLogRow = {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  source: string;
  previousValuesJson: string | null;
  newValuesJson: string | null;
  relatedRecordIds: string[];
};

export type ReversalResult = { ok: true } | { ok: false; error: string };

function parseJson<T>(json: string | null): T | null {
  return json ? (JSON.parse(json) as T) : null;
}

// JSON.stringify turns a Date into an ISO string; JSON.parse doesn't turn it
// back. A recreated Transaction row's date/createdAt fields need to be real
// Date instances again before going back through Prisma's create().
function reviveTransactionDates(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    ...(typeof row.date === "string" ? { date: new Date(row.date) } : {}),
    ...(typeof row.createdAt === "string" ? { createdAt: new Date(row.createdAt) } : {}),
  };
}

export async function reverseTransaction(
  prisma: Pick<PrismaClient, "transaction" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    if (entry.action === "CREATE") {
      await tx.transaction.deleteMany({ where: { id: { in: [entry.entityId] }, userId } });
    } else if (entry.action === "DELETE") {
      const previous = parseJson<{ rows: Record<string, unknown>[] }>(entry.previousValuesJson);
      for (const row of previous?.rows ?? []) {
        await tx.transaction.create({ data: reviveTransactionDates(row) });
      }
    } else if (entry.action === "UPDATE") {
      const previous = parseJson<Record<string, unknown>>(entry.previousValuesJson);
      await tx.transaction.update({ where: { id: entry.entityId }, data: previous ?? {} });
    }

    await recordAudit(tx, {
      userId,
      entityType: "TRANSACTION",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as any,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseTransfer(
  prisma: Pick<PrismaClient, "transaction" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    const ids = [entry.entityId, ...entry.relatedRecordIds];
    await tx.transaction.deleteMany({ where: { id: { in: ids }, userId } });

    await recordAudit(tx, {
      userId,
      entityType: "TRANSFER",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as any,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reversePayablePayment(
  prisma: Pick<PrismaClient, "transaction" | "payable" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { id: { in: entry.relatedRecordIds }, userId } });
    await tx.payable.update({
      where: { id: entry.entityId },
      data: { status: "PENDING", paidTransactionId: null },
    });

    await recordAudit(tx, {
      userId,
      entityType: "PAYABLE_PAYMENT",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as any,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/audit-log-reversal.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit-log-reversal.ts src/lib/audit-log-reversal.test.ts
git commit -m "feat(audit): add TRANSACTION/TRANSFER/PAYABLE_PAYMENT reversal functions (plan-38 Stage G, §11)"
```

---

## Task 13: Reversal functions, part 2 — `RECEIPT_CONFIRMATION`, `INSTALLMENT_PAYMENT`, `CREDIT_CARD_PAYMENT`, `RECONCILIATION`

**Files:**
- Modify: `src/lib/audit-log-reversal.ts`
- Modify: `src/lib/audit-log-reversal.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/audit-log-reversal.test.ts` (update the `makeFakePrisma` helper first to also include `receipt: { update: vi.fn() }`, `shoppingPriceHistory: { deleteMany: vi.fn() }`, `installmentPayment: { update: vi.fn() }`):

```ts
describe("reverseReceiptConfirmation", () => {
  it("deletes the transaction and every price-history row, and reverts the receipt", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1",
      userId: "user-1",
      entityType: "RECEIPT_CONFIRMATION",
      entityId: "receipt-1",
      action: "CREATE",
      source: "RECEIPT",
      previousValuesJson: null,
      newValuesJson: null,
      relatedRecordIds: ["txn-1", "price-1", "price-2"],
    };

    const result = await reverseReceiptConfirmation(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
    expect(prisma.shoppingPriceHistory.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["price-1", "price-2"] }, userId: "user-1" },
    });
    expect(prisma.receipt.update).toHaveBeenCalledWith({
      where: { id: "receipt-1" },
      data: { status: "REVIEWED", transactionId: null },
    });
  });
});

describe("reverseInstallmentPayment", () => {
  it("deletes the transaction and reverts the installment payment to PENDING", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1", userId: "user-1", entityType: "INSTALLMENT_PAYMENT", entityId: "payment-1",
      action: "CREATE", source: "FORM", previousValuesJson: null, newValuesJson: null,
      relatedRecordIds: ["txn-1"],
    };

    const result = await reverseInstallmentPayment(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.installmentPayment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: { status: "PENDING", paidTransactionId: null },
    });
  });
});

describe("reverseCreditCardPayment", () => {
  it("deletes the transaction", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1", userId: "user-1", entityType: "CREDIT_CARD_PAYMENT", entityId: "txn-1",
      action: "CREATE", source: "FORM", previousValuesJson: null, newValuesJson: null, relatedRecordIds: [],
    };

    const result = await reverseCreditCardPayment(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
  });
});

describe("reverseReconciliation", () => {
  it("deletes the balance-adjustment transaction", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1", userId: "user-1", entityType: "RECONCILIATION", entityId: "txn-1",
      action: "CREATE", source: "SYSTEM", previousValuesJson: null, newValuesJson: null, relatedRecordIds: [],
    };

    const result = await reverseReconciliation(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
  });
});
```

Add the corresponding imports to the top of the test file:
```ts
import {
  reverseTransaction,
  reverseTransfer,
  reversePayablePayment,
  reverseReceiptConfirmation,
  reverseInstallmentPayment,
  reverseCreditCardPayment,
  reverseReconciliation,
} from "@/lib/audit-log-reversal";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/audit-log-reversal.test.ts`
Expected: FAIL — the four new functions don't exist yet.

- [ ] **Step 3: Implement**

Append to `src/lib/audit-log-reversal.ts`:

```ts
export async function reverseReceiptConfirmation(
  prisma: Pick<PrismaClient, "transaction" | "shoppingPriceHistory" | "receipt" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    const [transactionId, ...priceHistoryIds] = entry.relatedRecordIds;
    if (transactionId) {
      await tx.transaction.deleteMany({ where: { id: { in: [transactionId] }, userId } });
    }
    if (priceHistoryIds.length > 0) {
      await tx.shoppingPriceHistory.deleteMany({ where: { id: { in: priceHistoryIds }, userId } });
    }
    await tx.receipt.update({
      where: { id: entry.entityId },
      data: { status: "REVIEWED", transactionId: null },
    });

    await recordAudit(tx, {
      userId,
      entityType: "RECEIPT_CONFIRMATION",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as any,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseInstallmentPayment(
  prisma: Pick<PrismaClient, "transaction" | "installmentPayment" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { id: { in: entry.relatedRecordIds }, userId } });
    await tx.installmentPayment.update({
      where: { id: entry.entityId },
      data: { status: "PENDING", paidTransactionId: null },
    });

    await recordAudit(tx, {
      userId,
      entityType: "INSTALLMENT_PAYMENT",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as any,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseCreditCardPayment(
  prisma: Pick<PrismaClient, "transaction" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { id: { in: [entry.entityId] }, userId } });

    await recordAudit(tx, {
      userId,
      entityType: "CREDIT_CARD_PAYMENT",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as any,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseReconciliation(
  prisma: Pick<PrismaClient, "transaction" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { id: { in: [entry.entityId] }, userId } });

    await recordAudit(tx, {
      userId,
      entityType: "RECONCILIATION",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as any,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/audit-log-reversal.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit-log-reversal.ts src/lib/audit-log-reversal.test.ts
git commit -m "feat(audit): add RECEIPT_CONFIRMATION/INSTALLMENT_PAYMENT/CREDIT_CARD_PAYMENT/RECONCILIATION reversal functions (plan-38 Stage G, §11)"
```

---

## Task 14: Reversal functions, part 3 — `RECURRING_OCCURRENCE`, `RECURRING_PAYABLE_OCCURRENCE`, `REMINDER_PAYMENT` (with guards)

**Files:**
- Modify: `src/lib/audit-log-reversal.ts`
- Modify: `src/lib/audit-log-reversal.test.ts`

These three carry a guard: don't reverse if something has moved on since. `RECURRING_OCCURRENCE`/`RECURRING_PAYABLE_OCCURRENCE` refuse if the rule's current schedule field no longer matches what this confirm advanced it to; `RECURRING_PAYABLE_OCCURRENCE` additionally refuses if the `Payable` it created has since been paid.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/audit-log-reversal.test.ts` (extend `makeFakePrisma` with `recurringRule: { findFirst: vi.fn(), update: vi.fn() }`, `recurringPayable: { findFirst: vi.fn(), update: vi.fn() }`, `payable: { ...prisma.payable, findFirst: vi.fn() }`, `customReminder: { update: vi.fn() }`):

```ts
describe("reverseRecurringOccurrence", () => {
  const entry = {
    id: "audit-1", userId: "user-1", entityType: "RECURRING_OCCURRENCE", entityId: "rule-1",
    action: "CREATE", source: "RECURRING_RULE",
    previousValuesJson: JSON.stringify({ nextDate: new Date(2026, 8, 25) }),
    newValuesJson: JSON.stringify({ nextDate: new Date(2026, 9, 25) }),
    relatedRecordIds: ["txn-1"],
  };

  it("restores nextDate and deletes the transaction when nothing has advanced since", async () => {
    const prisma = makeFakePrisma({
      recurringRule: { findFirst: vi.fn().mockResolvedValue({ id: "rule-1", nextDate: new Date(2026, 9, 25) }), update: vi.fn() },
    });

    const result = await reverseRecurringOccurrence(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.recurringRule.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { nextDate: new Date(2026, 8, 25) },
    });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
  });

  it("refuses when nextDate has already moved past this confirm", async () => {
    const prisma = makeFakePrisma({
      recurringRule: { findFirst: vi.fn().mockResolvedValue({ id: "rule-1", nextDate: new Date(2026, 10, 25) }), update: vi.fn() },
    });

    const result = await reverseRecurringOccurrence(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: false, error: "A later occurrence has already been confirmed" });
    expect(prisma.recurringRule.update).not.toHaveBeenCalled();
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled();
  });
});

describe("reverseRecurringPayableOccurrence", () => {
  const entry = {
    id: "audit-1", userId: "user-1", entityType: "RECURRING_PAYABLE_OCCURRENCE", entityId: "rule-1",
    action: "CREATE", source: "RECURRING_RULE",
    previousValuesJson: JSON.stringify({ nextDueDate: new Date(2026, 8, 25) }),
    newValuesJson: JSON.stringify({ nextDueDate: new Date(2026, 9, 25) }),
    relatedRecordIds: ["payable-1"],
  };

  it("restores nextDueDate and deletes the created payable when it's still PENDING", async () => {
    const prisma = makeFakePrisma({
      recurringPayable: { findFirst: vi.fn().mockResolvedValue({ id: "rule-1", nextDueDate: new Date(2026, 9, 25) }), update: vi.fn() },
      payable: { findFirst: vi.fn().mockResolvedValue({ id: "payable-1", status: "PENDING" }), deleteMany: vi.fn(), update: vi.fn() },
    });

    const result = await reverseRecurringPayableOccurrence(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.payable.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["payable-1"] }, userId: "user-1" } });
    expect(prisma.recurringPayable.update).toHaveBeenCalledWith({
      where: { id: "rule-1" },
      data: { nextDueDate: new Date(2026, 8, 25) },
    });
  });

  it("refuses when the created payable has already been paid", async () => {
    const prisma = makeFakePrisma({
      recurringPayable: { findFirst: vi.fn().mockResolvedValue({ id: "rule-1", nextDueDate: new Date(2026, 9, 25) }), update: vi.fn() },
      payable: { findFirst: vi.fn().mockResolvedValue({ id: "payable-1", status: "PAID" }), deleteMany: vi.fn(), update: vi.fn() },
    });

    const result = await reverseRecurringPayableOccurrence(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: false, error: "This bill has already been paid — unpay it first" });
    expect(prisma.payable.deleteMany).not.toHaveBeenCalled();
  });
});

describe("reverseReminderPayment", () => {
  it("deletes the transaction and reverts the reminder to UPCOMING", async () => {
    const prisma = makeFakePrisma();
    const entry = {
      id: "audit-1", userId: "user-1", entityType: "REMINDER_PAYMENT", entityId: "reminder-1",
      action: "CREATE", source: "FORM", previousValuesJson: null, newValuesJson: null,
      relatedRecordIds: ["txn-1"],
    };

    const result = await reverseReminderPayment(prisma, "user-1", entry as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.customReminder.update).toHaveBeenCalledWith({
      where: { id: "reminder-1" },
      data: { state: "UPCOMING", linkedTransactionId: null },
    });
  });
});
```

Add the new imports:
```ts
import {
  reverseRecurringOccurrence,
  reverseRecurringPayableOccurrence,
  reverseReminderPayment,
} from "@/lib/audit-log-reversal";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/audit-log-reversal.test.ts`
Expected: FAIL — these three functions don't exist yet.

- [ ] **Step 3: Implement**

Append to `src/lib/audit-log-reversal.ts`:

```ts
export async function reverseRecurringOccurrence(
  prisma: Pick<PrismaClient, "transaction" | "recurringRule" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    const rule = await tx.recurringRule.findFirst({ where: { id: entry.entityId, userId } });
    if (!rule) return { ok: false, error: "Recurring rule not found" };

    const newValues = parseJson<{ nextDate: string }>(entry.newValuesJson);
    if (newValues && new Date(rule.nextDate).getTime() !== new Date(newValues.nextDate).getTime()) {
      return { ok: false, error: "A later occurrence has already been confirmed" };
    }

    const previous = parseJson<{ nextDate: string }>(entry.previousValuesJson);
    if (previous) {
      await tx.recurringRule.update({ where: { id: entry.entityId }, data: { nextDate: new Date(previous.nextDate) } });
    }
    await tx.transaction.deleteMany({ where: { id: { in: entry.relatedRecordIds }, userId } });

    await recordAudit(tx, {
      userId,
      entityType: "RECURRING_OCCURRENCE",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as any,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseRecurringPayableOccurrence(
  prisma: Pick<PrismaClient, "recurringPayable" | "payable" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    const rule = await tx.recurringPayable.findFirst({ where: { id: entry.entityId, userId } });
    if (!rule) return { ok: false, error: "Recurring payable not found" };

    const newValues = parseJson<{ nextDueDate: string }>(entry.newValuesJson);
    if (newValues && new Date(rule.nextDueDate).getTime() !== new Date(newValues.nextDueDate).getTime()) {
      return { ok: false, error: "A later occurrence has already been confirmed" };
    }

    const [payableId] = entry.relatedRecordIds;
    const payable = payableId ? await tx.payable.findFirst({ where: { id: payableId, userId } }) : null;
    if (payable && payable.status !== "PENDING") {
      return { ok: false, error: "This bill has already been paid — unpay it first" };
    }

    if (payableId) {
      await tx.payable.deleteMany({ where: { id: { in: [payableId] }, userId } });
    }
    const previous = parseJson<{ nextDueDate: string }>(entry.previousValuesJson);
    if (previous) {
      await tx.recurringPayable.update({
        where: { id: entry.entityId },
        data: { nextDueDate: new Date(previous.nextDueDate) },
      });
    }

    await recordAudit(tx, {
      userId,
      entityType: "RECURRING_PAYABLE_OCCURRENCE",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as any,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}

export async function reverseReminderPayment(
  prisma: Pick<PrismaClient, "transaction" | "customReminder" | "auditLog" | "$transaction">,
  userId: string,
  entry: AuditLogRow,
): Promise<ReversalResult> {
  return prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { id: { in: entry.relatedRecordIds }, userId } });
    await tx.customReminder.update({
      where: { id: entry.entityId },
      data: { state: "UPCOMING", linkedTransactionId: null },
    });

    await recordAudit(tx, {
      userId,
      entityType: "REMINDER_PAYMENT",
      entityId: entry.entityId,
      action: "REVERSE",
      source: entry.source as any,
      reversalOfId: entry.id,
    });

    return { ok: true };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/audit-log-reversal.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit-log-reversal.ts src/lib/audit-log-reversal.test.ts
git commit -m "feat(audit): add RECURRING_OCCURRENCE/RECURRING_PAYABLE_OCCURRENCE/REMINDER_PAYMENT reversal functions with guards (plan-38 Stage G, §11)"
```

---

## Task 15: `undoAuditLogEntry` dispatcher

**Files:**
- Modify: `src/lib/audit-log-reversal.ts`
- Modify: `src/lib/audit-log-reversal.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/audit-log-reversal.test.ts`:

```ts
describe("undoAuditLogEntry", () => {
  function makeDispatchPrisma(entry: any) {
    return makeFakePrisma({
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(entry),
        create: vi.fn().mockResolvedValue({ id: "audit-reverse-1" }),
      },
    });
  }

  it("refuses when the entry doesn't exist or doesn't belong to the user", async () => {
    const prisma = makeDispatchPrisma(null);

    const result = await undoAuditLogEntry(prisma, "user-1", "audit-1");

    expect(result).toEqual({ ok: false, error: "Audit entry not found" });
  });

  it("refuses to reverse a REVERSE entry", async () => {
    const prisma = makeDispatchPrisma({ id: "audit-1", userId: "user-1", action: "REVERSE", entityType: "TRANSACTION" });

    const result = await undoAuditLogEntry(prisma, "user-1", "audit-1");

    expect(result).toEqual({ ok: false, error: "This is already an undo — it can't be undone again" });
  });

  it("dispatches CREDIT_CARD_PAYMENT to reverseCreditCardPayment", async () => {
    const prisma = makeDispatchPrisma({
      id: "audit-1", userId: "user-1", entityType: "CREDIT_CARD_PAYMENT", entityId: "txn-1",
      action: "CREATE", source: "FORM", previousValuesJson: null, newValuesJson: null, relatedRecordIds: [],
    });

    const result = await undoAuditLogEntry(prisma, "user-1", "audit-1");

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
  });
});
```

Add the import:
```ts
import { undoAuditLogEntry } from "@/lib/audit-log-reversal";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/audit-log-reversal.test.ts`
Expected: FAIL — `undoAuditLogEntry` doesn't exist yet.

- [ ] **Step 3: Implement**

Append to `src/lib/audit-log-reversal.ts`:

```ts
export type UndoPrisma = Pick<
  PrismaClient,
  | "auditLog"
  | "transaction"
  | "payable"
  | "receipt"
  | "shoppingPriceHistory"
  | "recurringRule"
  | "recurringPayable"
  | "installmentPayment"
  | "customReminder"
  | "$transaction"
>;

export async function undoAuditLogEntry(
  prisma: UndoPrisma,
  userId: string,
  auditLogId: string,
): Promise<ReversalResult> {
  const entry = await prisma.auditLog.findFirst({ where: { id: auditLogId, userId } });
  if (!entry) return { ok: false, error: "Audit entry not found" };
  if (entry.action === "REVERSE") {
    return { ok: false, error: "This is already an undo — it can't be undone again" };
  }

  const row = entry as unknown as AuditLogRow;
  switch (entry.entityType as AuditLogRow["entityType"]) {
    case "TRANSACTION":
      return reverseTransaction(prisma, userId, row);
    case "TRANSFER":
      return reverseTransfer(prisma, userId, row);
    case "PAYABLE_PAYMENT":
      return reversePayablePayment(prisma, userId, row);
    case "RECEIPT_CONFIRMATION":
      return reverseReceiptConfirmation(prisma, userId, row);
    case "RECURRING_OCCURRENCE":
      return reverseRecurringOccurrence(prisma, userId, row);
    case "RECURRING_PAYABLE_OCCURRENCE":
      return reverseRecurringPayableOccurrence(prisma, userId, row);
    case "INSTALLMENT_PAYMENT":
      return reverseInstallmentPayment(prisma, userId, row);
    case "CREDIT_CARD_PAYMENT":
      return reverseCreditCardPayment(prisma, userId, row);
    case "REMINDER_PAYMENT":
      return reverseReminderPayment(prisma, userId, row);
    case "RECONCILIATION":
      return reverseReconciliation(prisma, userId, row);
    default:
      return { ok: false, error: "Unrecognized audit entry type" };
  }
}
```

`AuditLogRow`'s `entityType` field is typed as `string` — change it to the exported `AuditEntityType` union from `src/lib/audit-log.ts` for the `switch` above to be exhaustively checked by TypeScript:

```ts
import type { AuditEntityType, AuditSource } from "@/lib/audit-log";
```

and update `AuditLogRow`:
```ts
export type AuditLogRow = {
  id: string;
  userId: string;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  source: AuditSource;
  previousValuesJson: string | null;
  newValuesJson: string | null;
  relatedRecordIds: string[];
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/audit-log-reversal.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/audit-log-reversal.ts src/lib/audit-log-reversal.test.ts
git commit -m "feat(audit): add undoAuditLogEntry dispatcher (plan-38 Stage G, §11)"
```

---

## Task 16: Listing + undo server actions

**Files:**
- Create: `src/lib/audit-log-query.ts`
- Test: `src/lib/audit-log-query.test.ts`
- Create: `src/actions/audit-log.actions.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/audit-log-query.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { listAuditLog } from "@/lib/audit-log-query";

function makeFakePrisma() {
  return {
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
  } as any;
}

describe("listAuditLog", () => {
  it("scopes to the user, newest first", async () => {
    const prisma = makeFakePrisma();

    await listAuditLog(prisma, "user-1", {});

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      include: { reversedBy: true },
    });
  });

  it("filters by entityType and entityId when given", async () => {
    const prisma = makeFakePrisma();

    await listAuditLog(prisma, "user-1", { entityType: "TRANSACTION", entityId: "txn-1" });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", entityType: "TRANSACTION", entityId: "txn-1" },
      orderBy: { createdAt: "desc" },
      include: { reversedBy: true },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/audit-log-query.test.ts`
Expected: FAIL — `Cannot find module '@/lib/audit-log-query'`.

- [ ] **Step 3: Implement**

Create `src/lib/audit-log-query.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type { AuditEntityType } from "@/lib/audit-log";

export type AuditLogFilter = { entityType?: AuditEntityType; entityId?: string };

export async function listAuditLog(
  prisma: Pick<PrismaClient, "auditLog">,
  userId: string,
  filter: AuditLogFilter,
) {
  return prisma.auditLog.findMany({
    where: {
      userId,
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { reversedBy: true },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/audit-log-query.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Create the server actions (no new test — thin wrappers around already-tested functions, matching this codebase's existing convention of not unit-testing "use server" action files directly)**

Create `src/actions/audit-log.actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAuditLog, type AuditLogFilter } from "@/lib/audit-log-query";
import { undoAuditLogEntry } from "@/lib/audit-log-reversal";

export type AuditLogActionResult = { ok: true } | { ok: false; error: string };

export async function listAuditLogAction(filter: AuditLogFilter) {
  const session = await auth();
  if (!session?.user) return [];
  return listAuditLog(prisma, session.user.id, filter);
}

export async function undoAuditLogEntryAction(auditLogId: string): Promise<AuditLogActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await undoAuditLogEntry(prisma, session.user.id, auditLogId);

  if (result.ok) {
    revalidatePath("/audit-log");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    revalidatePath("/bills");
    revalidatePath("/loans-cards");
    revalidatePath("/calendar");
  }
  return result;
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/audit-log-query.ts src/lib/audit-log-query.test.ts src/actions/audit-log.actions.ts
git commit -m "feat(audit): add listAuditLog query and audit-log server actions (plan-38 Stage G, §11)"
```

---

## Task 17: `/audit-log` page and nav entry

**Files:**
- Create: `src/app/(app)/audit-log/page.tsx`
- Create: `src/components/audit-log/audit-log-summary.ts`
- Create: `src/components/audit-log/undo-button.tsx`
- Modify: `src/components/nav/nav-links.ts`

- [ ] **Step 1: Human-readable summaries**

Create `src/components/audit-log/audit-log-summary.ts` (pure function, easy to unit-test later if the plan-38 §12 test-infrastructure stage adds coverage here — no test required now since it's a straightforward formatting function with no branching logic risk beyond what a manual check catches):

```ts
import { formatMoney } from "@/lib/money";
import type { AuditEntityType } from "@/lib/audit-log";

const ENTITY_LABELS: Record<AuditEntityType, string> = {
  TRANSACTION: "Transaction",
  TRANSFER: "Transfer",
  PAYABLE_PAYMENT: "Bill payment",
  RECEIPT_CONFIRMATION: "Receipt",
  RECURRING_OCCURRENCE: "Recurring transaction",
  RECURRING_PAYABLE_OCCURRENCE: "Recurring bill",
  INSTALLMENT_PAYMENT: "Installment payment",
  CREDIT_CARD_PAYMENT: "Credit card payment",
  REMINDER_PAYMENT: "Reminder payment",
  RECONCILIATION: "Balance adjustment",
};

export function auditEntityLabel(entityType: AuditEntityType): string {
  return ENTITY_LABELS[entityType];
}

export function auditActionLabel(action: string): string {
  if (action === "REVERSE") return "Undone";
  if (action === "DELETE") return "Deleted";
  if (action === "UPDATE") return "Edited";
  return "Created";
}

// currency is a best-effort display default (the app is single-currency-
// per-account, and AuditLog doesn't itself store one) — good enough for a
// history list where the amount is secondary to the description.
export function formatAuditAmount(minorUnits: number, currency = "PHP"): string {
  return formatMoney(minorUnits, currency);
}
```

- [ ] **Step 2: Undo button**

Create `src/components/audit-log/undo-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { undoAuditLogEntryAction } from "@/actions/audit-log.actions";
import { Button } from "@/components/ui/button";

export function UndoButton({ auditLogId }: { auditLogId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleUndo() {
    setIsPending(true);
    const result = await undoAuditLogEntryAction(auditLogId);
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Undone");
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={handleUndo}>
      Undo
    </Button>
  );
}
```

- [ ] **Step 3: The page**

Create `src/app/(app)/audit-log/page.tsx`:

```tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAuditLog } from "@/lib/audit-log-query";
import type { AuditEntityType } from "@/lib/audit-log";
import { auditActionLabel, auditEntityLabel } from "@/components/audit-log/audit-log-summary";
import { UndoButton } from "@/components/audit-log/undo-button";
import { Card } from "@/components/ui/card";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; entityId?: string }>;
}) {
  const { entityType, entityId } = await searchParams;
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const entries = await listAuditLog(prisma, user.id, {
    entityType: entityType as AuditEntityType | undefined,
    entityId,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Audit History</h1>
      <p className="text-sm text-muted-foreground">
        Every change that affected a real balance, and — where safe — a way to undo it.
      </p>

      {entries.length === 0 ? (
        <p className="text-muted-foreground">No audit history yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry: any) => {
            const isReversed = entry.reversedBy.length > 0;
            const canUndo = entry.action !== "REVERSE" && !isReversed;
            return (
              <Card key={entry.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-medium">
                    {auditEntityLabel(entry.entityType)} — {auditActionLabel(entry.action)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {entry.createdAt.toLocaleString()} · {entry.source.toLowerCase().replace("_", " ")}
                    {isReversed ? " · undone" : ""}
                  </p>
                </div>
                {canUndo && <UndoButton auditLogId={entry.id} />}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the nav entry**

In `src/components/nav/nav-links.ts`, import `History` from `lucide-react` and add a new entry to `navLinks` (after `"Settings"` or wherever fits alphabetically/logically — placing it last, right before Settings, keeps the day-to-day pages first):

```ts
import {
  Home,
  ArrowLeftRight,
  PiggyBank,
  Receipt,
  Wallet,
  CreditCard,
  BarChart3,
  Settings,
  CalendarRange,
  ShoppingCart,
  CalendarDays,
  History,
  type LucideIcon,
} from "lucide-react";
```
```ts
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/audit-log", label: "Audit History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npx next build`
Expected: no errors, build succeeds, `/audit-log` appears in the route list.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/audit-log/page.tsx src/components/audit-log/ src/components/nav/nav-links.ts
git commit -m "feat(audit): add the /audit-log page with Undo, and a nav entry (plan-38 Stage G, §11)"
```

---

## Task 18: Per-record "history" links

Confirmed today's exact row shape in each file below (re-check if it has
changed by the time you implement this, but as of this plan these are the
precise insertion points).

**Files:**
- Create: `src/components/audit-log/audit-history-link.tsx`
- Modify: `src/components/transactions/transaction-list.tsx`
- Modify: `src/components/bills/payable-list.tsx`
- Modify: `src/components/calendar/calendar-entry-card.tsx`

`src/components/loans-cards/installment-purchase-list.tsx` only renders the
aggregate purchase (paid-count/remaining-total), not individual
`InstallmentPayment` rows — there is no existing per-payment row to attach a
link to, so it's skipped for this stage, same as credit card payments (both
remain reachable via the unfiltered `/audit-log` page).

- [ ] **Step 1: The shared link component**

Create `src/components/audit-log/audit-history-link.tsx`:

```tsx
import Link from "next/link";
import type { AuditEntityType } from "@/lib/audit-log";

export function AuditHistoryLink({ entityType, entityId }: { entityType: AuditEntityType; entityId: string }) {
  return (
    <Link
      href={`/audit-log?entityType=${entityType}&entityId=${entityId}`}
      className="text-sm text-muted-foreground underline"
    >
      History
    </Link>
  );
}
```

- [ ] **Step 2: Wire it into Transactions**

In `src/components/transactions/transaction-list.tsx`, add the import:

```ts
import { AuditHistoryLink } from "@/components/audit-log/audit-history-link";
```

Change:
```tsx
          <div className="flex items-center gap-3">
            <span className={txn.amount < 0 ? "text-destructive" : "text-foreground"}>
              {formatMoney(txn.amount, txn.account.currency)}
            </span>
            <DeleteTransactionButton transactionId={txn.id} />
          </div>
```
to:
```tsx
          <div className="flex items-center gap-3">
            <span className={txn.amount < 0 ? "text-destructive" : "text-foreground"}>
              {formatMoney(txn.amount, txn.account.currency)}
            </span>
            <AuditHistoryLink entityType="TRANSACTION" entityId={txn.id} />
            <DeleteTransactionButton transactionId={txn.id} />
          </div>
```

- [ ] **Step 3: Wire it into Payables**

In `src/components/bills/payable-list.tsx`, add the import:

```ts
import { AuditHistoryLink } from "@/components/audit-log/audit-history-link";
```

Then change:
```tsx
          {payable.status === "PENDING" && (
            <PayableFormDialog accounts={accounts} categories={categories} existing={payable} />
          )}
```
to:
```tsx
          {payable.status === "PENDING" ? (
            <PayableFormDialog accounts={accounts} categories={categories} existing={payable} />
          ) : (
            <AuditHistoryLink entityType="PAYABLE_PAYMENT" entityId={payable.id} />
          )}
```

- [ ] **Step 4: Wire it into Calendar**

In `src/components/calendar/calendar-entry-card.tsx`, add the import:

```ts
import { AuditHistoryLink } from "@/components/audit-log/audit-history-link";
```

Then add the link inside the existing `entry.sourceType === "CUSTOM_REMINDER"` block, right before its closing `</>`:

```tsx
            {entry.state === "PAID" && (
              <AuditHistoryLink entityType="REMINDER_PAYMENT" entityId={entry.sourceId} />
            )}
```

- [ ] **Step 5: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npx eslint src && npx vitest run && npx next build`
Expected: no errors, all tests pass, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/audit-log/audit-history-link.tsx src/components/transactions/transaction-list.tsx src/components/bills/payable-list.tsx src/components/calendar/calendar-entry-card.tsx
git commit -m "feat(audit): add per-record 'History' links on Transactions, Payables, and Calendar (plan-38 Stage G, §11)"
```

---

## Task 19: Named financial-invariant test

**Files:**
- Modify: `src/lib/financial-invariants.test.ts`

- [ ] **Step 1: Write the test**

Add to `src/lib/financial-invariants.test.ts`:

```ts
describe("§11 invariant: reversing a payable payment restores it to exactly its pre-payment state", () => {
  it("reversePayablePayment clears paidTransactionId and deletes only the payment transaction — no other account is touched", async () => {
    const prisma: any = {
      transaction: { deleteMany: vi.fn() },
      payable: { update: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-reverse-1" }) },
    };
    prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));

    const { reversePayablePayment } = await import("@/lib/audit-log-reversal");
    const result = await reversePayablePayment(prisma, "user-1", {
      id: "audit-1",
      userId: "user-1",
      entityType: "PAYABLE_PAYMENT",
      entityId: "payable-1",
      action: "CREATE",
      source: "FORM",
      previousValuesJson: null,
      newValuesJson: null,
      relatedRecordIds: ["txn-1"],
    } as any);

    expect(result).toEqual({ ok: true });
    expect(prisma.payable.update).toHaveBeenCalledWith({
      where: { id: "payable-1" },
      data: { status: "PENDING", paidTransactionId: null },
    });
    // Exactly the one payment transaction is deleted — nothing else.
    expect(prisma.transaction.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1"] }, userId: "user-1" } });
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/lib/financial-invariants.test.ts`
Expected: PASS (this reuses an already-implemented, already-tested function from Task 12 — this is a naming/documentation pass, not new behavior, so it should pass immediately).

- [ ] **Step 3: Commit**

```bash
git add src/lib/financial-invariants.test.ts
git commit -m "test(audit): name the payable-payment-reversal invariant explicitly (plan-38 Stage G, §11/§13)"
```

---

## Task 20: Full verification sweep

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: every test file passes, including all new/modified ones from Tasks 1–19.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx eslint src`
Expected: no new errors (pre-existing warnings unrelated to this work, if any, are fine).

- [ ] **Step 4: Production build**

Run: `npx next build`
Expected: succeeds, `/audit-log` appears in the route list.

- [ ] **Step 5: Manual smoke check (once a reachable dev database is available)**

- Pay a bill from `/bills`, confirm a row appears on `/audit-log`, click Undo, confirm the bill goes back to unpaid and the transaction disappears from `/transactions`.
- Confirm a receipt, undo it, confirm price history rows and the transaction are gone and the receipt is back to reviewable.
- Confirm a recurring rule's occurrence twice in a row (advancing past the first), then try to undo the first confirm — expect the "A later occurrence has already been confirmed" refusal.
- Pay a recurring-payable-generated bill, then try to undo the *occurrence* confirm (not the payment) — expect the "This bill has already been paid" refusal; undo the payment first, then the occurrence undo should succeed.

- [ ] **Step 6: No commit for this task** — it's verification only. If any step surfaces a bug, fix it in a follow-up commit referencing the task/step where it was caught.
