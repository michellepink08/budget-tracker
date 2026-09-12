# Quick Capture Confirmation & Clarification UI (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phase 1 parser to real domain execution behind a Confirm/Edit/Cancel flow, with clarification questions, Undo, and a compact sidebar entry point + `Ctrl/Cmd+K`. This is the phase where Quick Capture becomes something a person can actually use.

**Architecture:** A new `src/lib/quick-capture/execute.ts` dispatches each confirmed draft to the existing domain functions (extended in two small, necessary ways), logging every confirmation to a new `QuickCaptureLog` table for Undo. Three new server actions wrap parse/confirm/undo. A `QuickCapturePanel` (built on the existing `Dialog` primitive) is the only new UI surface, opened from a new compact input in `SideNav` or `Ctrl/Cmd+K`.

**Tech Stack:** No new dependencies.

---

### Task 1: Schema — `QuickCaptureLog`, and two small `Payable` fields

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the two `Payable` fields**

Find the `Payable` model and add `dueDateConfirmed` and `notes`:

```prisma
model Payable {
  id                 String    @id @default(cuid())
  userId             String
  name               String
  amount             Int
  dueDate            DateTime
  dueDateConfirmed   Boolean   @default(true)
  accountId          String
  categoryId         String?
  notes              String?
  status             String    @default("PENDING")
  paidTransactionId  String?
  recurringPayableId String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  user             User              @relation(fields: [userId], references: [id])
  account          Account           @relation(fields: [accountId], references: [id])
  category         Category?         @relation(fields: [categoryId], references: [id])
  recurringPayable RecurringPayable? @relation(fields: [recurringPayableId], references: [id])
}
```

- [ ] **Step 2: Add `QuickCaptureLog`**

```prisma
model QuickCaptureLog {
  id                 String   @id @default(cuid())
  userId             String
  rawInput           String
  parsedDraftJson    String
  resultingIds       String[]
  previousValuesJson String?
  createdAt          DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

Add `quickCaptureLogs QuickCaptureLog[]` to `User`'s relation list.

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add QuickCaptureLog and extend Payable with dueDateConfirmed/notes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Extend `updateTransaction` to allow amount/date/account changes

**Files:**
- Modify: `src/lib/transactions.ts`
- Modify: `src/lib/transactions.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/transactions.test.ts` (matching that file's existing mock-Prisma style):

```typescript
describe("updateTransaction — amount/date/account", () => {
  it("updates amount, date, and accountId when given", async () => {
    const prisma = {
      transaction: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as any;

    const result = await updateTransaction(prisma, "user-1", "txn-1", {
      amount: 25000,
      date: new Date(2026, 8, 1),
      accountId: "acc-2",
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: "txn-1", userId: "user-1" },
      data: { amount: 25000, date: new Date(2026, 8, 1), accountId: "acc-2" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/transactions.test.ts`
Expected: FAIL — `amount`/`date`/`accountId` aren't accepted by `TransactionEditableInput` yet (TypeScript error at the call site, or the fields are silently stripped).

- [ ] **Step 3: Extend the type and function**

In `src/lib/transactions.ts`, find:

```typescript
export type TransactionEditableInput = {
  description?: string;
  notes?: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
};
```

Replace with:

```typescript
export type TransactionEditableInput = {
  description?: string;
  notes?: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  amount?: number; // minor units — the caller is responsible for the correct sign
  date?: Date;
  accountId?: string;
};
```

(`updateTransaction`'s body already just spreads `input` into `data`, so no further change is needed there — only the type was too narrow.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/transactions.test.ts`
Expected: PASS (all existing tests plus the new one).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/transactions.ts src/lib/transactions.test.ts
git commit -m "feat: allow updateTransaction to change amount, date, and account

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Extend `Payable` and `previewReconciliation`/`applyReconciliation`

**Files:**
- Modify: `src/lib/payables.ts`
- Modify: `src/lib/payables.test.ts`
- Modify: `src/lib/reconciliation.ts`
- Modify: `src/lib/reconciliation.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/payables.test.ts`:

```typescript
describe("createPayable — dueDateConfirmed and notes", () => {
  it("passes dueDateConfirmed and notes through to the create call", async () => {
    const prisma = { payable: { create: vi.fn().mockResolvedValue({ id: "pay-1" }) } } as any;

    await createPayable(prisma, "user-1", {
      name: "EastWest hospital bill",
      amount: 1551914,
      dueDate: new Date(2026, 9, 5),
      dueDateConfirmed: false,
      accountId: "acc-1",
      notes: "estimated from last month's statement",
    });

    expect(prisma.payable.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "EastWest hospital bill",
        amount: 1551914,
        dueDate: new Date(2026, 9, 5),
        dueDateConfirmed: false,
        accountId: "acc-1",
        notes: "estimated from last month's statement",
      },
    });
  });
});
```

Add to `src/lib/reconciliation.test.ts`:

```typescript
describe("applyReconciliation — returns the created transaction id", () => {
  it("returns the new BALANCE_ADJUSTMENT transaction's id when a difference exists", async () => {
    const prisma = {
      account: { findFirst: vi.fn().mockResolvedValue({ id: "acc-1" }), findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance: 0 }) },
      transaction: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "adj-txn-1" }),
      },
      budgetPeriod: {
        findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      },
    } as any;

    const result = await applyReconciliation(prisma, "user-1", 1, "acc-1", 50000);

    expect(result).toEqual({ ok: true, alreadyBalanced: false, transactionId: "adj-txn-1" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/payables.test.ts src/lib/reconciliation.test.ts`
Expected: FAIL — `dueDateConfirmed`/`notes` rejected by the current `PayableInput` type; `applyReconciliation`'s current return shape has no `transactionId`.

(The reconciliation test's `budgetPeriod.findFirst` mock is a simplification — `resolveBudgetPeriodForDate` may call additional methods depending on its exact implementation; if the test needs a different mock shape to run, adjust the mock to match that function's actual Prisma calls, not the assertion on `applyReconciliation`'s return value.)

- [ ] **Step 3: Extend `payables.ts`**

Find:

```typescript
export type PayableInput = {
  name: string;
  amount: number; // minor units, non-negative magnitude
  dueDate: Date;
  accountId: string;
  categoryId?: string;
};
```

Replace with:

```typescript
export type PayableInput = {
  name: string;
  amount: number; // minor units, non-negative magnitude
  dueDate: Date;
  dueDateConfirmed?: boolean; // defaults to true at the schema level if omitted
  accountId: string;
  categoryId?: string;
  notes?: string;
};
```

(`createPayable`/`updatePayable` already just spread the input into `data`, so no further change is needed there.)

- [ ] **Step 4: Extend `reconciliation.ts`**

Find:

```typescript
export type ReconciliationResult =
  | { ok: true; alreadyBalanced: boolean }
  | { ok: false; error: string };
```

Replace with:

```typescript
export type ReconciliationResult =
  | { ok: true; alreadyBalanced: boolean; transactionId?: string }
  | { ok: false; error: string };
```

Find:

```typescript
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
```

Replace with:

```typescript
  if (difference === 0) {
    return { ok: true, alreadyBalanced: true };
  }

  const date = new Date();
  const period = await resolveBudgetPeriodForDate(prisma, userId, date, cycleStartDay);

  const transaction = await prisma.transaction.create({
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

  return { ok: true, alreadyBalanced: false, transactionId: transaction.id };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/payables.test.ts src/lib/reconciliation.test.ts`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/payables.ts src/lib/payables.test.ts src/lib/reconciliation.ts src/lib/reconciliation.test.ts
git commit -m "feat: extend Payable fields and have applyReconciliation return its transaction id

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: The Quick Capture execution layer

This dispatches a confirmed `CommandDraft` to the right existing domain function, and reverses it on Undo.

**Files:**
- Create: `src/lib/quick-capture/execute.ts`
- Test: `src/lib/quick-capture/execute.test.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// src/lib/quick-capture/execute.ts
import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction, createTransferTransaction, updateTransaction, deleteTransaction } from "@/lib/transactions";
import { applyReconciliation } from "@/lib/reconciliation";
import { createPayable, updatePayable } from "@/lib/payables";
import { makeCreditCardPayment } from "@/lib/credit-cards";
import { makeLoanPayment } from "@/lib/loans";
import type { CommandDraft } from "@/lib/quick-capture/types";

export type ExecuteResult =
  | { ok: true; resultingIds: string[]; previousValues?: Record<string, unknown> }
  | { ok: false; error: string };

type ExecutePrisma = Pick<
  PrismaClient,
  "transaction" | "budgetPeriod" | "account" | "payable" | "creditCard" | "loan"
>;

// Dispatches one confirmed draft to the existing domain function for its
// intent. Every branch reuses domain logic that already existed before
// Quick Capture — this file is pure orchestration, never a new way to
// write to the database.
export async function executeDraft(
  prisma: ExecutePrisma,
  userId: string,
  cycleStartDay: number,
  draft: CommandDraft,
): Promise<ExecuteResult> {
  switch (draft.intent) {
    case "expense":
    case "income":
    case "refund":
    case "credit_card_charge": {
      if (!draft.account.id) return { ok: false, error: "An account is required" };
      const transaction = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
        type: draft.intent === "credit_card_charge" ? "EXPENSE" : draft.intent.toUpperCase() as "EXPENSE" | "INCOME" | "REFUND",
        amount: draft.amountMinorUnits,
        date: draft.date.value,
        accountId: draft.account.id,
        categoryId: draft.category?.id ?? undefined,
        description: draft.description,
      });
      return { ok: true, resultingIds: [transaction.id] };
    }

    case "person_borrowed": {
      if (!draft.account.id) return { ok: false, error: "An account is required" };
      const transaction = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
        type: "EXPENSE",
        amount: draft.amountMinorUnits,
        date: draft.date.value,
        accountId: draft.account.id,
        description: `Lent to ${draft.personName}`,
      });
      return { ok: true, resultingIds: [transaction.id] };
    }

    case "transfer": {
      if (!draft.sourceAccount.id || !draft.destinationAccount.id) {
        return { ok: false, error: "Both accounts are required" };
      }
      const transfer = await createTransferTransaction(prisma, userId, cycleStartDay, {
        amount: draft.amountMinorUnits,
        date: draft.date.value,
        sourceAccountId: draft.sourceAccount.id,
        destinationAccountId: draft.destinationAccount.id,
        description: draft.description,
      });
      const resultingIds = [transfer.outgoingTransactionId, transfer.incomingTransactionId];
      if (draft.feeMinorUnits > 0) {
        const fee = await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
          type: "TRANSFER_FEE",
          amount: draft.feeMinorUnits,
          date: draft.date.value,
          accountId: draft.sourceAccount.id,
          description: "Transfer fee",
        });
        resultingIds.push(fee.id);
      }
      return { ok: true, resultingIds };
    }

    case "credit_card_payment": {
      if (!draft.payingAccount.id || !draft.creditCardAccount.id) {
        return { ok: false, error: "Both accounts are required" };
      }
      const card = await prisma.creditCard.findFirst({ where: { accountId: draft.creditCardAccount.id, userId } });
      if (!card) return { ok: false, error: "Credit card not found" };
      const result = await makeCreditCardPayment(prisma, userId, cycleStartDay, card.id, {
        accountId: draft.payingAccount.id,
        amount: draft.amountMinorUnits,
        date: draft.date.value,
      });
      if (!result.ok) return result;
      return { ok: true, resultingIds: [] }; // makeCreditCardPayment doesn't return the transaction id today
    }

    case "loan_payment": {
      if (!draft.payingAccount.id || !draft.loan.id) {
        return { ok: false, error: "An account and a loan are required" };
      }
      const result = await makeLoanPayment(prisma, userId, cycleStartDay, draft.loan.id, {
        accountId: draft.payingAccount.id,
        amount: draft.amountMinorUnits,
        date: draft.date.value,
      });
      if (!result.ok) return result;
      return { ok: true, resultingIds: [] };
    }

    case "reconciliation": {
      if (!draft.account.id) return { ok: false, error: "An account is required" };
      const result = await applyReconciliation(
        prisma,
        userId,
        cycleStartDay,
        draft.account.id,
        draft.actualBalanceMinorUnits,
      );
      if (!result.ok) return result;
      return { ok: true, resultingIds: result.transactionId ? [result.transactionId] : [] };
    }

    case "payable_create": {
      if (!draft.account.id) return { ok: false, error: "An account is required" };
      const payable = await createPayable(prisma, userId, {
        name: draft.name,
        amount: draft.amountMinorUnits,
        dueDate: draft.dueDate.value,
        dueDateConfirmed: draft.dueDate.confirmed,
        accountId: draft.account.id,
        categoryId: draft.category?.id,
        notes: draft.notes ?? undefined,
      });
      return { ok: true, resultingIds: [payable.id] };
    }

    case "payable_update": {
      if (!draft.target.id) return { ok: false, error: "Couldn't identify which payable to update" };
      const existing = await prisma.payable.findFirst({ where: { id: draft.target.id, userId } });
      if (!existing) return { ok: false, error: "Payable not found" };
      const previousValues = { amount: existing.amount, dueDate: existing.dueDate, notes: existing.notes };
      const result = await updatePayable(prisma, userId, draft.target.id, {
        amount: draft.amountMinorUnits ?? undefined,
        dueDate: draft.dueDate?.value,
        dueDateConfirmed: draft.dueDate?.confirmed,
        notes: draft.notesRemove ? undefined : draft.notes ?? undefined,
      });
      if (!result.ok) return result;
      return { ok: true, resultingIds: [draft.target.id], previousValues };
    }

    case "transaction_update": {
      if (!draft.target.id) return { ok: false, error: "Couldn't identify which transaction to change" };
      const existing = await prisma.transaction.findFirst({ where: { id: draft.target.id, userId } });
      if (!existing) return { ok: false, error: "Transaction not found" };
      const previousValues = { amount: existing.amount, date: existing.date, description: existing.description };
      const result = await updateTransaction(prisma, userId, draft.target.id, {
        amount: draft.amountMinorUnits ?? undefined,
        date: draft.date?.value,
        description: draft.description ?? undefined,
      });
      if (!result.ok) return result;
      return { ok: true, resultingIds: [draft.target.id], previousValues };
    }

    case "transaction_delete": {
      if (!draft.target.id) return { ok: false, error: "Couldn't identify which transaction to delete" };
      const result = await deleteTransaction(prisma, userId, draft.target.id);
      if (!result.ok) return result;
      // Deliberately not undoable — see the design spec's "Undo, backed
      // by QuickCaptureLog" section. resultingIds is empty on purpose.
      return { ok: true, resultingIds: [] };
    }

    case "question":
      return { ok: false, error: "Answering questions isn't available yet" };
  }
}

// Reverses a confirmed draft using exactly what executeDraft recorded —
// never a guess. transaction_delete and any already-balanced
// reconciliation have no resultingIds, so undoing them is a no-op.
export async function undoExecution(
  prisma: Pick<PrismaClient, "transaction" | "payable">,
  userId: string,
  intent: CommandDraft["intent"],
  resultingIds: string[],
  previousValues: Record<string, unknown> | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (resultingIds.length === 0) {
    return { ok: true };
  }

  if (intent === "transaction_update" && previousValues) {
    await prisma.transaction.updateMany({
      where: { id: { in: resultingIds }, userId },
      data: previousValues,
    });
    return { ok: true };
  }

  if (intent === "payable_update" && previousValues) {
    await prisma.payable.updateMany({
      where: { id: { in: resultingIds }, userId },
      data: previousValues,
    });
    return { ok: true };
  }

  if (intent === "payable_create") {
    await prisma.payable.deleteMany({ where: { id: { in: resultingIds }, userId } });
    return { ok: true };
  }

  // expense/income/refund/credit_card_charge/person_borrowed/transfer/reconciliation
  // all reverse the same way: delete the rows that were created.
  await prisma.transaction.deleteMany({ where: { id: { in: resultingIds }, userId } });
  return { ok: true };
}
```

- [ ] **Step 2: Write the tests**

```typescript
// src/lib/quick-capture/execute.test.ts
import { describe, expect, it, vi } from "vitest";
import { executeDraft, undoExecution } from "@/lib/quick-capture/execute";
import type { CommandDraft } from "@/lib/quick-capture/types";

function ref(id: string | null, raw = "x") {
  return { raw, id, candidateIds: [] };
}

function makeFakePrisma(overrides: Record<string, any> = {}) {
  return {
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-new" }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: "txn-1", amount: -1000, date: new Date(), description: "old" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
    },
    account: {
      findFirst: vi.fn().mockResolvedValue({ id: "acc-1" }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "acc-1", openingBalance: 0 }),
    },
    payable: {
      create: vi.fn().mockResolvedValue({ id: "pay-new" }),
      findFirst: vi.fn().mockResolvedValue({ id: "pay-1", amount: 1000, dueDate: new Date(), notes: "old note" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    creditCard: { findFirst: vi.fn().mockResolvedValue({ id: "cc-1" }) },
    loan: { findFirst: vi.fn().mockResolvedValue({ id: "loan-1", remainingBalance: 5000, name: "Car loan" }) },
    ...overrides,
  } as any;
}

const now = new Date(2026, 8, 13);

describe("executeDraft", () => {
  it("creates an expense transaction", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "expense",
      amountMinorUnits: 18000,
      account: ref("acc-1"),
      category: null,
      description: "food",
      date: { value: now, confirmed: true },
      cutoffOverride: null,
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result).toEqual({ ok: true, resultingIds: ["txn-new"] });
  });

  it("creates two linked rows plus a fee transaction for a transfer with a fee", async () => {
    const prisma = makeFakePrisma({
      transaction: {
        create: vi.fn()
          .mockResolvedValueOnce({ id: "txn-out" })
          .mockResolvedValueOnce({ id: "txn-in" })
          .mockResolvedValueOnce({ id: "txn-fee" }),
        update: vi.fn().mockResolvedValue({}),
      },
      budgetPeriod: { findUnique: vi.fn().mockResolvedValue({ id: "period-1" }) },
    });
    const draft: CommandDraft = {
      intent: "transfer",
      amountMinorUnits: 100000,
      feeMinorUnits: 1500,
      sourceAccount: ref("acc-1"),
      destinationAccount: ref("acc-2"),
      description: "Transfer",
      date: { value: now, confirmed: true },
      cutoffOverride: null,
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result).toEqual({ ok: true, resultingIds: ["txn-out", "txn-in", "txn-fee"] });
  });

  it("records money borrowed by another person as an expense with the person's name in the description", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "person_borrowed",
      amountMinorUnits: 50000,
      account: ref("acc-1"),
      personName: "Mama",
      date: { value: now, confirmed: true },
      clauseText: "x",
      clarification: null,
    };
    await executeDraft(prisma, "user-1", 1, draft);
    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ description: "Lent to Mama" }) }),
    );
  });

  it("applies a reconciliation and returns the adjustment transaction id", async () => {
    const prisma = makeFakePrisma();
    prisma.account.findUniqueOrThrow.mockResolvedValue({ id: "acc-1", openingBalance: 40000 });
    const draft: CommandDraft = {
      intent: "reconciliation",
      account: ref("acc-1"),
      actualBalanceMinorUnits: 50000,
      date: { value: now, confirmed: true },
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result).toEqual({ ok: true, resultingIds: ["txn-new"] });
  });

  it("creates a payable with dueDateConfirmed carried through", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "payable_create",
      name: "EastWest hospital bill",
      amountMinorUnits: 1551914,
      dueDate: { value: now, confirmed: false },
      statementDate: null,
      account: ref("acc-1"),
      category: null,
      notes: null,
      cutoff: null,
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result).toEqual({ ok: true, resultingIds: ["pay-new"] });
    expect(prisma.payable.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dueDateConfirmed: false }) }),
    );
  });

  it("updates a transaction and returns its previous values for Undo", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "transaction_update",
      target: ref("txn-1"),
      amountMinorUnits: 25000,
      date: null,
      description: null,
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resultingIds).toEqual(["txn-1"]);
      expect(result.previousValues).toEqual({ amount: -1000, date: expect.any(Date), description: "old" });
    }
  });

  it("deletes a transaction with no undo-able ids", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "transaction_delete",
      target: ref("txn-1"),
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result).toEqual({ ok: true, resultingIds: [] });
  });

  it("refuses to execute a question draft", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "question",
      questionType: "liquid_funds",
      account: null,
      category: null,
      clauseText: "x",
      clarification: null,
    };
    const result = await executeDraft(prisma, "user-1", 1, draft);
    expect(result.ok).toBe(false);
  });

  it("scopes everything to the given userId", async () => {
    const prisma = makeFakePrisma();
    const draft: CommandDraft = {
      intent: "transaction_delete",
      target: ref("txn-1"),
      clauseText: "x",
      clarification: null,
    };
    await executeDraft(prisma, "user-42", 1, draft);
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "user-42" }) }),
    );
  });
});

describe("undoExecution", () => {
  it("deletes created transaction rows", async () => {
    const prisma = makeFakePrisma();
    const result = await undoExecution(prisma, "user-1", "expense", ["txn-new"], null);
    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["txn-new"] }, userId: "user-1" },
    });
  });

  it("restores previous values for a transaction update", async () => {
    const prisma = makeFakePrisma();
    const previousValues = { amount: -1000, date: now, description: "old" };
    const result = await undoExecution(prisma, "user-1", "transaction_update", ["txn-1"], previousValues);
    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["txn-1"] }, userId: "user-1" },
      data: previousValues,
    });
  });

  it("is a no-op when there are no resultingIds (e.g. an already-balanced reconciliation, or a delete)", async () => {
    const prisma = makeFakePrisma();
    const result = await undoExecution(prisma, "user-1", "transaction_delete", [], null);
    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run src/lib/quick-capture/execute.test.ts`
Expected: PASS (10 tests). If any fail, fix `execute.ts` (not the tests) — adjust the mock shapes in the test file only if a real domain function's actual Prisma call signature differs from what's assumed here.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quick-capture/execute.ts src/lib/quick-capture/execute.test.ts
git commit -m "feat: add the Quick Capture execution and undo layer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Server actions

**Files:**
- Create: `src/actions/quick-capture.actions.ts`

- [ ] **Step 1: Write the implementation**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { parseCommand } from "@/lib/quick-capture/deterministic-parser";
import { executeDraft, undoExecution } from "@/lib/quick-capture/execute";
import type { CommandDraft } from "@/lib/quick-capture/types";

async function currentUser() {
  const session = await auth();
  if (!session?.user) return null;
  return prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
}

export type ParseQuickCaptureResult = { ok: true; drafts: CommandDraft[] } | { ok: false; error: string };

export async function parseQuickCaptureAction(text: string): Promise<ParseQuickCaptureResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };
  if (!text.trim()) return { ok: false, error: "Type a command first" };

  const [accounts, categories] = await Promise.all([
    listAccounts(prisma, user.id),
    listCategories(prisma, user.id),
  ]);

  const drafts = await parseCommand(
    prisma,
    {
      userId: user.id,
      currency: user.currency,
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      now: new Date(),
    },
    text,
  );

  return { ok: true, drafts };
}

export type ConfirmQuickCaptureResult =
  | { ok: true; logId: string }
  | { ok: false; error: string };

export async function confirmQuickCaptureDraftAction(
  draft: CommandDraft,
): Promise<ConfirmQuickCaptureResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const result = await executeDraft(prisma, user.id, user.cycleStartDay, draft);
  if (!result.ok) return result;

  const log = await prisma.quickCaptureLog.create({
    data: {
      userId: user.id,
      rawInput: draft.clauseText,
      parsedDraftJson: JSON.stringify(draft),
      resultingIds: result.resultingIds,
      previousValuesJson: result.previousValues ? JSON.stringify(result.previousValues) : null,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true, logId: log.id };
}

export type UndoQuickCaptureResult = { ok: true } | { ok: false; error: string };

export async function undoQuickCaptureAction(logId: string): Promise<UndoQuickCaptureResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const log = await prisma.quickCaptureLog.findFirst({ where: { id: logId, userId: user.id } });
  if (!log) return { ok: false, error: "Nothing to undo" };

  const draft = JSON.parse(log.parsedDraftJson) as CommandDraft;
  const previousValues = log.previousValuesJson ? (JSON.parse(log.previousValuesJson) as Record<string, unknown>) : null;

  const result = await undoExecution(prisma, user.id, draft.intent, log.resultingIds, previousValues);
  if (!result.ok) return result;

  revalidatePath("/", "layout");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/actions/quick-capture.actions.ts
git commit -m "feat: add Quick Capture parse/confirm/undo server actions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `QuickCapturePanel` UI, wired into `SideNav` and `Ctrl/Cmd+K`

**Files:**
- Create: `src/components/quick-capture/quick-capture-panel.tsx`
- Modify: `src/components/nav/side-nav.tsx`

- [ ] **Step 1: Write `QuickCapturePanel`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  parseQuickCaptureAction,
  confirmQuickCaptureDraftAction,
  undoQuickCaptureAction,
} from "@/actions/quick-capture.actions";
import type { CommandDraft } from "@/lib/quick-capture/types";

type DraftState = {
  draft: CommandDraft;
  status: "pending" | "confirmed" | "error";
  error?: string;
  logId?: string;
};

const EXAMPLES = [
  "Paid 180 for food using cash",
  "Transferred 1,000 from BPI to GCash",
  "Received 5,000 from Rei in BPI Savings",
];

function summarize(draft: CommandDraft): string {
  switch (draft.intent) {
    case "expense":
    case "income":
    case "refund":
    case "credit_card_charge":
      return `${draft.intent.replace("_", " ")} — ${(draft.amountMinorUnits / 100).toFixed(2)} (${draft.account.raw})${
        draft.date.confirmed ? "" : " · estimated date"
      }`;
    case "transfer":
      return `transfer — ${(draft.amountMinorUnits / 100).toFixed(2)} from ${draft.sourceAccount.raw} to ${draft.destinationAccount.raw}`;
    case "person_borrowed":
      return `${draft.personName} borrowed ${(draft.amountMinorUnits / 100).toFixed(2)} from ${draft.account.raw}`;
    case "reconciliation":
      return `reconcile ${draft.account.raw} to ${(draft.actualBalanceMinorUnits / 100).toFixed(2)}`;
    case "payable_create":
      return `payable — ${draft.name}, ${(draft.amountMinorUnits / 100).toFixed(2)}${
        draft.dueDate.confirmed ? "" : " · estimated due date"
      }`;
    case "transaction_update":
      return `update transaction${draft.amountMinorUnits ? ` to ${(draft.amountMinorUnits / 100).toFixed(2)}` : ""}`;
    case "transaction_delete":
      return "delete transaction — this can't be undone";
    case "question":
      return "question — answering isn't available yet";
    default:
      return draft.clauseText;
  }
}

export function QuickCapturePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftState[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setText("");
      setDrafts(null);
      setParseError(null);
    }
  }, [open]);

  async function handleParse() {
    setParsing(true);
    setParseError(null);
    const result = await parseQuickCaptureAction(text);
    setParsing(false);
    if (!result.ok) {
      setParseError(result.error);
      return;
    }
    setDrafts(result.drafts.map((draft) => ({ draft, status: "pending" })));
  }

  async function handleConfirm(index: number) {
    if (!drafts) return;
    const entry = drafts[index];
    const result = await confirmQuickCaptureDraftAction(entry.draft);
    setDrafts((prev) =>
      prev!.map((d, i) =>
        i === index
          ? result.ok
            ? { ...d, status: "confirmed", logId: result.logId }
            : { ...d, status: "error", error: result.error }
          : d,
      ),
    );
  }

  async function handleUndo(index: number) {
    if (!drafts) return;
    const entry = drafts[index];
    if (!entry.logId) return;
    await undoQuickCaptureAction(entry.logId);
    setDrafts((prev) => prev!.map((d, i) => (i === index ? { ...d, status: "pending", logId: undefined } : d)));
  }

  function handleCancel(index: number) {
    setDrafts((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Capture</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleParse();
              }}
              placeholder="Paid 180 for food using cash"
            />
            <Button type="button" onClick={handleParse} disabled={parsing || !text.trim()}>
              {parsing ? "..." : "Parse"}
            </Button>
          </div>

          {!drafts && (
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="text-left underline"
                  onClick={() => setText(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          {parseError && <p className="text-sm text-destructive">{parseError}</p>}

          {drafts?.map((entry, index) => (
            <div key={index} className="rounded-lg border p-3 text-sm">
              <p className="mb-2">{summarize(entry.draft)}</p>

              {entry.draft.clarification && entry.status === "pending" && (
                <p className="mb-2 text-amber-600">{entry.draft.clarification.question}</p>
              )}

              {entry.status === "pending" && !entry.draft.clarification && entry.draft.intent !== "question" && (
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => handleConfirm(index)}>
                    Confirm
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => handleCancel(index)}>
                    Cancel
                  </Button>
                </div>
              )}

              {entry.status === "confirmed" && (
                <div className="flex items-center gap-2 text-emerald-700">
                  <span>Added ✓</span>
                  {entry.draft.intent !== "transaction_delete" && (
                    <button type="button" className="underline" onClick={() => handleUndo(index)}>
                      Undo
                    </button>
                  )}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      onOpenChange(false);
                      router.push("/transactions");
                    }}
                  >
                    View
                  </button>
                </div>
              )}

              {entry.status === "error" && <p className="text-destructive">{entry.error}</p>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add the compact input + `Ctrl/Cmd+K` to `SideNav`**

In `src/components/nav/side-nav.tsx`, add the state, the global keyboard listener, the compact trigger button, and render `QuickCapturePanel`:

Add imports:
```tsx
import { useEffect, useState } from "react";
import { QuickCapturePanel } from "@/components/quick-capture/quick-capture-panel";
```

Inside the `SideNav` component function, before the `return`:
```tsx
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickCaptureOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
```

Add a compact trigger button just above the `<nav>` link list:
```tsx
      <button
        type="button"
        onClick={() => setQuickCaptureOpen(true)}
        className="mx-2 mt-2 rounded-md border border-white/15 px-3 py-2 text-left text-sm text-[var(--nav-foreground)]/70 hover:bg-white/10"
      >
        Quick Capture{" "}
        <span className="float-right text-xs opacity-60">⌘K</span>
      </button>
```

And render the panel at the end, alongside the closing `</aside>`:
```tsx
      <QuickCapturePanel open={quickCaptureOpen} onOpenChange={setQuickCaptureOpen} />
```

(This makes `SideNav` a bit more than a pure server-driven nav — it already is `"use client"` from Plan 11's `usePathname` usage, so no directive change is needed.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/quick-capture/quick-capture-panel.tsx src/components/nav/side-nav.tsx
git commit -m "feat: add the QuickCapturePanel UI, wired into the sidebar and Ctrl/Cmd+K

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run everything**

Run: `npm test` — expected PASS, all existing tests plus this phase's new ones, zero regressions.
Run: `npx tsc --noEmit` — expected clean.
Run: `npm run lint` — expected 0 errors.
Run: `npm run build` — expected clean production build.

- [ ] **Step 2: Commit if anything needed fixing**

If any of the above required a fix, commit it now before moving on.

---

### Task 8: Finish the branch and deploy

- [ ] **Step 1:** Follow superpowers:finishing-a-development-branch (tests/typecheck/lint/build already verified in Task 7; per standing user instruction, merge locally without presenting the options menu).

- [ ] **Step 2: Push to GitHub to trigger a live deploy**

```bash
git push origin master
```

- [ ] **Step 3: Manual verification against the live deployment**

Once Vercel shows the deploy "Ready," on the real production URL:
1. Press `Ctrl/Cmd+K` from any page — confirm the panel opens.
2. Type `Paid 180 for food using cash`, press Enter, confirm the preview card shows the right amount/account/category, click Confirm, confirm it shows "Added ✓" with Undo and View.
3. Click Undo — confirm the transaction disappears from `/transactions`.
4. Try a multi-clause command (`Paid 213 for medicine in cash and 703 for food using GCash`) — confirm two preview cards appear and can be confirmed independently.
5. Try a command with an ambiguous account (if two similarly-named accounts exist) — confirm the clarification question appears instead of Confirm/Edit/Cancel.
6. Try `Delete the water transaction I just added` against a real transaction — confirm no Undo link appears on its success state.
7. Confirm the sidebar's compact "Quick Capture ⌘K" button also opens the same panel.
