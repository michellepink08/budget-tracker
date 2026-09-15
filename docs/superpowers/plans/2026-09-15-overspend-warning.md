# Overspend Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After saving (creating or editing) a transaction, if the category/subcategory it's charged against
has a budget for that cutoff and is now over, show a non-blocking warning toast alongside the usual success
toast.

**Architecture:** A single pure-ish helper, `checkOverspendWarning`, looks up the one `BudgetAllocation`
that governs a transaction's category/subcategory (reusing `computeCategoryActual`/
`computeSubcategoryActual` from the subcategory-budgets feature), and returns a warning string or `null`.
Both `createTransactionAction` and `updateTransactionAction` call it after their save succeeds and attach
the result as an optional `warning` field on their existing return type — the transaction always saves
either way.

**Tech Stack:** Next.js Server Actions, Prisma, Vitest, `sonner` (`toast.warning`).

---

### Task 1: `checkOverspendWarning`

**Files:**
- Create: `src/lib/overspend-warning.ts`
- Test: `src/lib/overspend-warning.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { checkOverspendWarning } from "@/lib/overspend-warning";

vi.mock("@/lib/category-actual", () => ({
  computeCategoryActual: vi.fn().mockResolvedValue(9500),
  computeSubcategoryActual: vi.fn().mockResolvedValue(15500),
}));

describe("checkOverspendWarning", () => {
  it("returns null when the transaction has no category at all", async () => {
    const prisma = { budgetAllocation: { findFirst: vi.fn() } } as any;

    const warning = await checkOverspendWarning(prisma, "user-1", "period-1", null, null, "PHP");

    expect(warning).toBeNull();
    expect(prisma.budgetAllocation.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when nothing is budgeted for this category/subcategory", async () => {
    const prisma = { budgetAllocation: { findFirst: vi.fn().mockResolvedValue(null) } } as any;

    const warning = await checkOverspendWarning(prisma, "user-1", "period-1", "cat-1", null, "PHP");

    expect(warning).toBeNull();
    expect(prisma.budgetAllocation.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", budgetPeriodId: "period-1", categoryId: "cat-1", subcategoryId: null },
      include: { category: true, subcategory: true },
    });
  });

  it("returns null when the whole-category allocation still has remaining budget", async () => {
    const prisma = {
      budgetAllocation: {
        findFirst: vi.fn().mockResolvedValue({
          plannedAmount: 10000,
          rolloverAmount: 0,
          category: { name: "Groceries" },
          subcategory: null,
        }),
      },
    } as any;

    // computeCategoryActual is mocked to 9500 — under the 10000 planned
    const warning = await checkOverspendWarning(prisma, "user-1", "period-1", "cat-1", null, "PHP");

    expect(warning).toBeNull();
  });

  it("warns with the category name and overage when a whole-category allocation goes negative", async () => {
    const prisma = {
      budgetAllocation: {
        findFirst: vi.fn().mockResolvedValue({
          plannedAmount: 9000, // ₱90.00
          rolloverAmount: 0,
          category: { name: "Groceries" },
          subcategory: null,
        }),
      },
    } as any;

    // effectivePlanned 9000 (₱90.00), actual 9500 (₱95.00, mocked) => remaining -500 (₱5.00 over)
    const warning = await checkOverspendWarning(prisma, "user-1", "period-1", "cat-1", null, "PHP");

    expect(warning).toBe("You're ₱5.00 over budget for Groceries this cutoff.");
  });

  it("warns with 'Category — Subcategory' when a subcategory-level allocation goes negative", async () => {
    const prisma = {
      budgetAllocation: {
        findFirst: vi.fn().mockResolvedValue({
          plannedAmount: 15000, // ₱150.00
          rolloverAmount: 0,
          category: { name: "Home & Groceries" },
          subcategory: { name: "Market / Grocery / Food" },
        }),
      },
    } as any;

    // effectivePlanned 15000 (₱150.00), actual 15500 (₱155.00, mocked) => remaining -500 (₱5.00 over)
    const warning = await checkOverspendWarning(prisma, "user-1", "period-1", "cat-1", "sub-1", "PHP");

    expect(warning).toBe("You're ₱5.00 over budget for Home & Groceries — Market / Grocery / Food this cutoff.");
    expect(prisma.budgetAllocation.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", budgetPeriodId: "period-1", categoryId: "cat-1", subcategoryId: "sub-1" },
      include: { category: true, subcategory: true },
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/overspend-warning.test.ts`
Expected: FAIL — `Cannot find module '@/lib/overspend-warning'`

- [ ] **Step 3: Write the implementation**

```typescript
import type { PrismaClient } from "@prisma/client";
import { computeCategoryActual, computeSubcategoryActual } from "@/lib/category-actual";
import { formatMoney } from "@/lib/money";

// Looks up the one BudgetAllocation that governs a transaction's own
// category/subcategory (the same either/or rule from the subcategory-
// budgets feature: a transaction is governed by at most one allocation)
// and returns a user-facing warning if that allocation's remaining just
// went negative — or null if there's nothing budgeted here, or it's still
// within budget. Never throws, never blocks a save.
export async function checkOverspendWarning(
  prisma: Pick<PrismaClient, "budgetAllocation" | "transaction">,
  userId: string,
  budgetPeriodId: string,
  categoryId: string | null,
  subcategoryId: string | null,
  currency: string,
): Promise<string | null> {
  if (!categoryId) return null;

  const allocation = await prisma.budgetAllocation.findFirst({
    where: { userId, budgetPeriodId, categoryId, subcategoryId },
    include: { category: true, subcategory: true },
  });
  if (!allocation) return null;

  const actual = subcategoryId
    ? await computeSubcategoryActual(prisma, budgetPeriodId, subcategoryId)
    : await computeCategoryActual(prisma, budgetPeriodId, categoryId);

  const effectivePlanned = allocation.plannedAmount + allocation.rolloverAmount;
  const remaining = effectivePlanned - actual;
  if (remaining >= 0) return null;

  const label = allocation.subcategory
    ? `${allocation.category.name} — ${allocation.subcategory.name}`
    : allocation.category.name;
  return `You're ${formatMoney(-remaining, currency)} over budget for ${label} this cutoff.`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/overspend-warning.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/overspend-warning.ts src/lib/overspend-warning.test.ts
git commit -m "feat(budget): add checkOverspendWarning

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Wire the warning into `createTransactionAction` and `updateTransactionAction`

**Files:**
- Modify: `src/actions/transaction.actions.ts`

No new test file — this codebase's convention (established in the rollover feature) is thin action
wrappers aren't separately unit tested; the logic under test lives in `overspend-warning.test.ts`.

- [ ] **Step 1: Update the shared result type and add the import**

```typescript
import { checkOverspendWarning } from "@/lib/overspend-warning";
```

Replace:

```typescript
export type TransactionActionResult = { ok: true } | { ok: false; error: string };
```

with:

```typescript
export type TransactionActionResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };
```

- [ ] **Step 2: Attach the warning in `createTransactionAction`**

Replace:

```typescript
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
```

with:

```typescript
  const createdTransaction = await prisma.$transaction(async (tx) => {
    const transaction = await createExpenseLikeTransaction(tx, user.id, user.cycleStartDay, input);
    await recordAudit(tx, {
      userId: user.id,
      entityType: "TRANSACTION",
      entityId: transaction.id,
      action: "CREATE",
      source: "FORM",
      newValues: { rows: [transaction] },
    });
    return transaction;
  });

  const warning = createdTransaction.budgetPeriodId
    ? await checkOverspendWarning(
        prisma,
        user.id,
        createdTransaction.budgetPeriodId,
        createdTransaction.categoryId,
        createdTransaction.subcategoryId,
        user.currency,
      )
    : null;

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true, ...(warning ? { warning } : {}) };
}
```

- [ ] **Step 3: Attach the warning in `updateTransactionAction`**

Replace:

```typescript
  if (result.ok) revalidatePath("/transactions");
  return result;
}

export async function deleteTransactionAction(
```

with:

```typescript
  if (!result.ok) return result;

  const warning = before.budgetPeriodId
    ? await checkOverspendWarning(
        prisma,
        user.id,
        before.budgetPeriodId,
        input.categoryId,
        input.subcategoryId,
        user.currency,
      )
    : null;

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { ok: true, ...(warning ? { warning } : {}) };
}

export async function deleteTransactionAction(
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/actions/transaction.actions.ts
git commit -m "feat(budget): return an overspend warning from the transaction actions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Show the warning toast in both forms

**Files:**
- Modify: `src/components/transactions/transaction-form.tsx`
- Modify: `src/components/transactions/edit-transaction-button.tsx`

- [ ] **Step 1: Update `transaction-form.tsx`**

Replace:

```typescript
    toast.success(isTransfer ? "Transfer recorded" : "Transaction added");
    router.refresh();
    onSaved?.();
```

with:

```typescript
    toast.success(isTransfer ? "Transfer recorded" : "Transaction added");
    if (!isTransfer && result.warning) toast.warning(result.warning);
    router.refresh();
    onSaved?.();
```

- [ ] **Step 2: Update `edit-transaction-button.tsx`**

Replace:

```typescript
    toast.success("Transaction updated");
    setOpen(false);
    router.refresh();
```

with:

```typescript
    toast.success("Transaction updated");
    if (result.warning) toast.warning(result.warning);
    setOpen(false);
    router.refresh();
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — `createTransferAction`'s result type is still `TransactionActionResult`, so
`result.warning` is valid there too even though it's only read when `!isTransfer`.

- [ ] **Step 4: Commit**

```bash
git add src/components/transactions/transaction-form.tsx src/components/transactions/edit-transaction-button.tsx
git commit -m "feat(budget): show the overspend warning toast after saving a transaction

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Full verification pass

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (previous total plus the 5 new `overspend-warning.test.ts` tests)

- [ ] **Step 3: Lint changed files**

Run:
```bash
npx eslint src/lib/overspend-warning.ts src/actions/transaction.actions.ts src/components/transactions/transaction-form.tsx src/components/transactions/edit-transaction-button.tsx
```
Expected: no errors

- [ ] **Step 4: Manually verify against the demo account (then reset it)**

Using the Browser pane:
1. On the Budget page, add a small whole-category allocation (e.g. ₱100) for a category the demo account
   already has transactions in, or add a fresh one.
2. Add a transaction against that category for an amount that pushes it over (e.g. ₱150).
3. Confirm both toasts appear: "Transaction added" and the warning ("You're ₱50.00 over budget for
   \<category\> this cutoff.").
4. Add another small transaction to the same category — confirm the warning still appears (still over).
5. Edit an unrelated transaction to move it into an over-budget category and confirm the warning fires
   there too.
6. Confirm a transaction against a category with no allocation at all produces no warning.
7. Reset demo data: `npm run db:seed-demo`
