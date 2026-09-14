# Cross-User Ownership Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every place a create/update action trusts a client-supplied account/category/subcategory/budget-period/catalog-item/savings-goal ID without verifying it belongs to the signed-in user.

**Architecture:** Four small, reusable ownership-check helpers (matching the `assertOwnedPlan`/`assertOwnedList`/`assertOwnedReceipt` pattern already used correctly elsewhere in this codebase), then one fix per action file — replacing an unscoped lookup (or adding one where none existed) with the appropriate helper, returning a clean `{ ok: false, error }` before any write happens. Action files have no existing unit-test convention in this codebase (only `transaction.actions.test.ts` exists, and it tests the underlying lib function, not the action itself) — verification for action-layer fixes is `tsc`/`vitest run`/`next build` plus a manual browser check, not new per-action tests. The four new helpers, which live in already-tested lib files, get real unit tests.

**Tech Stack:** TypeScript, Prisma, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-cross-user-ownership-audit-design.md`

---

### Task 1: Add the four shared ownership-check helpers

**Files:**
- Modify: `src/lib/accounts.ts`
- Modify: `src/lib/categories.ts`
- Modify: `src/lib/budget-period.ts`
- Modify: `src/lib/shopping-catalog.ts`
- Test: `src/lib/accounts.test.ts`, `src/lib/categories.test.ts`, `src/lib/budget-period.test.ts`, `src/lib/shopping-catalog.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/accounts.test.ts`:

```ts
describe("assertOwnedAccount", () => {
  it("returns the account when it belongs to the user", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "acc-1", userId: "user-1", currency: "PHP" });
    const prisma = { account: { findFirst } } as any;

    const result = await assertOwnedAccount(prisma, "user-1", "acc-1");

    expect(result).toEqual({ id: "acc-1", userId: "user-1", currency: "PHP" });
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "acc-1", userId: "user-1" } });
  });

  it("returns null when the account belongs to another user (or doesn't exist)", async () => {
    const prisma = { account: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    expect(await assertOwnedAccount(prisma, "user-1", "acc-owned-by-someone-else")).toBeNull();
  });
});
```

Add the import at the top: change `import { archiveAccount, createAccount, listAccounts, updateAccount } from "@/lib/accounts";` to `import { archiveAccount, assertOwnedAccount, createAccount, listAccounts, updateAccount } from "@/lib/accounts";`.

Append to `src/lib/categories.test.ts`:

```ts
describe("assertOwnedCategory", () => {
  it("returns true when the category belongs to the user", async () => {
    const prisma = { category: { findFirst: vi.fn().mockResolvedValue({ id: "cat-1" }) } } as any;
    expect(await assertOwnedCategory(prisma, "user-1", "cat-1")).toBe(true);
  });

  it("returns false when the category belongs to another user", async () => {
    const prisma = { category: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    expect(await assertOwnedCategory(prisma, "user-1", "cat-owned-by-someone-else")).toBe(false);
  });
});

describe("assertOwnedSubcategory", () => {
  it("returns true when the subcategory belongs to the user", async () => {
    const prisma = { subcategory: { findFirst: vi.fn().mockResolvedValue({ id: "sub-1" }) } } as any;
    expect(await assertOwnedSubcategory(prisma, "user-1", "sub-1")).toBe(true);
  });

  it("returns false when the subcategory belongs to another user", async () => {
    const prisma = { subcategory: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    expect(await assertOwnedSubcategory(prisma, "user-1", "sub-owned-by-someone-else")).toBe(false);
  });
});
```

Update `categories.test.ts`'s import line to add `assertOwnedCategory, assertOwnedSubcategory,`.

Append to `src/lib/budget-period.test.ts`:

```ts
describe("assertOwnedBudgetPeriod", () => {
  it("returns true when the budget period belongs to the user", async () => {
    const prisma = { budgetPeriod: { findFirst: vi.fn().mockResolvedValue({ id: "period-1" }) } } as any;
    expect(await assertOwnedBudgetPeriod(prisma, "user-1", "period-1")).toBe(true);
  });

  it("returns false when the budget period belongs to another user", async () => {
    const prisma = { budgetPeriod: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    expect(await assertOwnedBudgetPeriod(prisma, "user-1", "period-owned-by-someone-else")).toBe(false);
  });
});
```

Update `budget-period.test.ts`'s import to add `assertOwnedBudgetPeriod,`.

Append to `src/lib/shopping-catalog.test.ts`:

```ts
describe("assertOwnedCatalogItem", () => {
  it("returns true when the catalog item belongs to the user", async () => {
    const prisma = { shoppingCatalogItem: { findFirst: vi.fn().mockResolvedValue({ id: "item-1" }) } } as any;
    expect(await assertOwnedCatalogItem(prisma, "user-1", "item-1")).toBe(true);
  });

  it("returns false when the catalog item belongs to another user", async () => {
    const prisma = { shoppingCatalogItem: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    expect(await assertOwnedCatalogItem(prisma, "user-1", "item-owned-by-someone-else")).toBe(false);
  });
});
```

Update `shopping-catalog.test.ts`'s import to add `assertOwnedCatalogItem,`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/accounts.test.ts src/lib/categories.test.ts src/lib/budget-period.test.ts src/lib/shopping-catalog.test.ts`
Expected: FAIL — none of the four functions exist yet (or, for `assertOwnedCatalogItem`, isn't exported yet)

- [ ] **Step 3: Implement**

In `src/lib/accounts.ts`, append:

```ts
export async function assertOwnedAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  accountId: string,
) {
  return prisma.account.findFirst({ where: { id: accountId, userId } });
}
```

In `src/lib/categories.ts`, append:

```ts
export async function assertOwnedCategory(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  categoryId: string,
): Promise<boolean> {
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  return category !== null;
}

export async function assertOwnedSubcategory(
  prisma: Pick<PrismaClient, "subcategory">,
  userId: string,
  subcategoryId: string,
): Promise<boolean> {
  const subcategory = await prisma.subcategory.findFirst({ where: { id: subcategoryId, userId } });
  return subcategory !== null;
}
```

In `src/lib/budget-period.ts`, append:

```ts
export async function assertOwnedBudgetPeriod(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  budgetPeriodId: string,
): Promise<boolean> {
  const period = await prisma.budgetPeriod.findFirst({ where: { id: budgetPeriodId, userId } });
  return period !== null;
}
```

In `src/lib/shopping-catalog.ts`, change:

```ts
async function assertOwnedCatalogItem(
```

to:

```ts
export async function assertOwnedCatalogItem(
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/accounts.test.ts src/lib/categories.test.ts src/lib/budget-period.test.ts src/lib/shopping-catalog.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/accounts.ts src/lib/accounts.test.ts src/lib/categories.ts src/lib/categories.test.ts src/lib/budget-period.ts src/lib/budget-period.test.ts src/lib/shopping-catalog.ts src/lib/shopping-catalog.test.ts
git commit -m "feat(security): add assertOwned* helpers for account/category/subcategory/budget-period/catalog-item

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Fix `transaction.actions.ts` (create + transfer)

**Files:**
- Modify: `src/actions/transaction.actions.ts`

- [ ] **Step 1: Fix `createTransactionAction`**

Change:

```ts
  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });
  const input = { ...parsed.data, amount: toMinorUnits(parsed.data.amount, account.currency) };
```

to:

```ts
  const account = await assertOwnedAccount(prisma, user.id, parsed.data.accountId);
  if (!account) return { ok: false, error: "Account not found" };
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
  if (parsed.data.subcategoryId && !(await assertOwnedSubcategory(prisma, user.id, parsed.data.subcategoryId))) {
    return { ok: false, error: "Subcategory not found" };
  }
  const input = { ...parsed.data, amount: toMinorUnits(parsed.data.amount, account.currency) };
```

- [ ] **Step 2: Fix `createTransferAction`**

Change:

```ts
    prisma.account.findUniqueOrThrow({ where: { id: parsed.data.sourceAccountId } }),
    prisma.account.findUniqueOrThrow({ where: { id: parsed.data.destinationAccountId } }),
```

to:

```ts
    assertOwnedAccount(prisma, user.id, parsed.data.sourceAccountId),
    assertOwnedAccount(prisma, user.id, parsed.data.destinationAccountId),
```

Then, immediately after that `Promise.all(...)` destructures its two results (find the line assigning them, e.g. `const [sourceAccount, destinationAccount] = await Promise.all([...]);`), add right after it:

```ts
  if (!sourceAccount) return { ok: false, error: "Source account not found" };
  if (!destinationAccount) return { ok: false, error: "Destination account not found" };
```

- [ ] **Step 3: Add the imports**

Change:

```ts
import { transactionSchema, transferSchema } from "@/lib/validations/transaction";
```

to:

```ts
import { transactionSchema, transferSchema } from "@/lib/validations/transaction";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertOwnedCategory, assertOwnedSubcategory } from "@/lib/categories";
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/actions/transaction.actions.ts
git commit -m "fix(security): verify account/category ownership before creating a transaction or transfer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Fix `payable.actions.ts` (create + update)

**Files:**
- Modify: `src/actions/payable.actions.ts`

- [ ] **Step 1: Fix `createPayableAction`**

Change:

```ts
  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });
```

to:

```ts
  const account = await assertOwnedAccount(prisma, session.user.id, parsed.data.accountId);
  if (!account) return { ok: false, error: "Account not found" };
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
```

- [ ] **Step 2: Fix `updatePayableAction`**

Change:

```ts
  const account = await prisma.account.findFirst({ where: { id: String(formData.get("accountId")) } });
  const currency = account?.currency ?? "PHP";

  const parsed = parsePayableForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the bill details" };
```

to:

```ts
  const accountId = String(formData.get("accountId"));
  const account = await assertOwnedAccount(prisma, session.user.id, accountId);
  if (!account) return { ok: false, error: "Account not found" };
  const currency = account.currency;

  const parsed = parsePayableForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the bill details" };
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
```

- [ ] **Step 3: Add the imports**

Change:

```ts
import { createPayable, markPayablePaid, updatePayable } from "@/lib/payables";
```

to:

```ts
import { createPayable, markPayablePaid, updatePayable } from "@/lib/payables";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertOwnedCategory } from "@/lib/categories";
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/actions/payable.actions.ts
git commit -m "fix(security): verify account/category ownership before creating or editing a bill

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Fix `credit-card.actions.ts` (create + update + payment)

**Files:**
- Modify: `src/actions/credit-card.actions.ts`

- [ ] **Step 1: Fix `createCreditCardAction` and `updateCreditCardAction`**

Both currently have the identical line:

```ts
  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });
```

Replace **both occurrences** with:

```ts
  const account = await assertOwnedAccount(prisma, session.user.id, parsed.data.accountId);
  if (!account) return { ok: false, error: "Account not found" };
```

- [ ] **Step 2: Fix `makeCreditCardPaymentAction`**

Change:

```ts
  const accountId = String(formData.get("accountId"));
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const amount = toMinorUnits(Number(formData.get("amount")), account.currency);
```

to:

```ts
  const accountId = String(formData.get("accountId"));
  const account = await assertOwnedAccount(prisma, user.id, accountId);
  if (!account) return { ok: false, error: "Account not found" };
  const amount = toMinorUnits(Number(formData.get("amount")), account.currency);
```

- [ ] **Step 3: Add the import**

Change:

```ts
import { createCreditCard, makeCreditCardPayment, updateCreditCard } from "@/lib/credit-cards";
```

to:

```ts
import { createCreditCard, makeCreditCardPayment, updateCreditCard } from "@/lib/credit-cards";
import { assertOwnedAccount } from "@/lib/accounts";
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/actions/credit-card.actions.ts
git commit -m "fix(security): verify account ownership before creating a credit card or making a payment

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Fix `recurring.actions.ts` (create + update)

**Files:**
- Modify: `src/actions/recurring.actions.ts`

- [ ] **Step 1: Fix `createRecurringRuleAction`**

Change:

```ts
  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });
```

to:

```ts
  const account = await assertOwnedAccount(prisma, user.id, parsed.data.accountId);
  if (!account) return { ok: false, error: "Account not found" };
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
  if (parsed.data.subcategoryId && !(await assertOwnedSubcategory(prisma, user.id, parsed.data.subcategoryId))) {
    return { ok: false, error: "Subcategory not found" };
  }
```

- [ ] **Step 2: Fix `updateRecurringRuleAction`**

Change:

```ts
  const account = await prisma.account.findFirst({ where: { id: String(formData.get("accountId")) } });
  const currency = account?.currency ?? "PHP";

  const parsed = parseRecurringForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the recurring rule details" };
```

to:

```ts
  const accountId = String(formData.get("accountId"));
  const account = await assertOwnedAccount(prisma, session.user.id, accountId);
  if (!account) return { ok: false, error: "Account not found" };
  const currency = account.currency;

  const parsed = parseRecurringForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the recurring rule details" };
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
  if (parsed.data.subcategoryId && !(await assertOwnedSubcategory(prisma, session.user.id, parsed.data.subcategoryId))) {
    return { ok: false, error: "Subcategory not found" };
  }
```

- [ ] **Step 3: Add the imports**

Change:

```ts
import {
  confirmRecurringOccurrence,
  createRecurringRule,
  skipRecurringOccurrence,
  updateRecurringRule,
} from "@/lib/recurring";
```

to:

```ts
import {
  confirmRecurringOccurrence,
  createRecurringRule,
  skipRecurringOccurrence,
  updateRecurringRule,
} from "@/lib/recurring";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertOwnedCategory, assertOwnedSubcategory } from "@/lib/categories";
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/actions/recurring.actions.ts
git commit -m "fix(security): verify account/category ownership before creating or editing a recurring rule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Fix `recurring-payable.actions.ts` (create + update)

**Files:**
- Modify: `src/actions/recurring-payable.actions.ts`

- [ ] **Step 1: Fix `createRecurringPayableAction`**

Change:

```ts
  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });
```

to:

```ts
  const account = await assertOwnedAccount(prisma, session.user.id, parsed.data.accountId);
  if (!account) return { ok: false, error: "Account not found" };
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
```

- [ ] **Step 2: Fix `updateRecurringPayableAction`**

Change:

```ts
  const account = await prisma.account.findFirst({ where: { id: String(formData.get("accountId")) } });
  const currency = account?.currency ?? "PHP";

  const parsed = parseRecurringPayableForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the recurring bill details" };
```

to:

```ts
  const accountId = String(formData.get("accountId"));
  const account = await assertOwnedAccount(prisma, session.user.id, accountId);
  if (!account) return { ok: false, error: "Account not found" };
  const currency = account.currency;

  const parsed = parseRecurringPayableForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the recurring bill details" };
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
```

- [ ] **Step 3: Add the imports**

Change:

```ts
import {
  confirmRecurringPayableOccurrence,
  createRecurringPayable,
  skipRecurringPayableOccurrence,
  updateRecurringPayable,
} from "@/lib/recurring-payables";
```

to:

```ts
import {
  confirmRecurringPayableOccurrence,
  createRecurringPayable,
  skipRecurringPayableOccurrence,
  updateRecurringPayable,
} from "@/lib/recurring-payables";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertOwnedCategory } from "@/lib/categories";
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/actions/recurring-payable.actions.ts
git commit -m "fix(security): verify account/category ownership before creating or editing a recurring bill

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Fix `installment-purchase.actions.ts` (create + pay-term)

**Files:**
- Modify: `src/actions/installment-purchase.actions.ts`

- [ ] **Step 1: Fix `createInstallmentPurchaseAction`**

Change:

```ts
  const account = await prisma.account.findUniqueOrThrow({ where: { id: parsed.data.accountId } });
```

to:

```ts
  const account = await assertOwnedAccount(prisma, session.user.id, parsed.data.accountId);
  if (!account) return { ok: false, error: "Account not found" };
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
```

- [ ] **Step 2: Fix `payInstallmentTermAction`**

Change:

```ts
  const accountId = String(formData.get("accountId"));
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
```

to:

```ts
  const accountId = String(formData.get("accountId"));
  const account = await assertOwnedAccount(prisma, user.id, accountId);
  if (!account) return { ok: false, error: "Account not found" };
```

- [ ] **Step 3: Add the imports**

Change:

```ts
import {
  archiveInstallmentPurchase,
  createInstallmentPurchase,
  payInstallmentTerm,
} from "@/lib/installment-purchases";
```

to:

```ts
import {
  archiveInstallmentPurchase,
  createInstallmentPurchase,
  payInstallmentTerm,
} from "@/lib/installment-purchases";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertOwnedCategory } from "@/lib/categories";
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/actions/installment-purchase.actions.ts
git commit -m "fix(security): verify account/category ownership before creating an installment purchase or paying a term

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Fix `loan.actions.ts` (payment)

**Files:**
- Modify: `src/actions/loan.actions.ts`

- [ ] **Step 1: Fix `makeLoanPaymentAction`**

Change:

```ts
  const accountId = String(formData.get("accountId"));
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
```

to:

```ts
  const accountId = String(formData.get("accountId"));
  const account = await assertOwnedAccount(prisma, user.id, accountId);
  if (!account) return { ok: false, error: "Account not found" };
```

- [ ] **Step 2: Add the import**

Find the loan-related import (e.g. `import { ..., makeLoanPayment, ... } from "@/lib/loans";`) and add a new import line right after it:

```ts
import { assertOwnedAccount } from "@/lib/accounts";
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/actions/loan.actions.ts
git commit -m "fix(security): verify account ownership before making a loan payment

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Fix `calendar.actions.ts` (mark reminder paid)

**Files:**
- Modify: `src/actions/calendar.actions.ts`

This one currently has **no** account/category lookup at all before calling `markPaid` — the payment's `accountId`/`categoryId` flow straight from the form into `markPaid` → `createExpenseLikeTransaction`.

- [ ] **Step 1: Add the ownership checks**

Change:

```ts
  const parsed = markReminderPaidSchema.safeParse({
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || null,
  });
  if (!parsed.success) return { ok: false, error: "Please pick an account" };

  const result = await markPaid(prisma, session.user.id, user.cycleStartDay, reminderId, {
    accountId: parsed.data.accountId,
    categoryId: parsed.data.categoryId ?? undefined,
  });
```

to:

```ts
  const parsed = markReminderPaidSchema.safeParse({
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || null,
  });
  if (!parsed.success) return { ok: false, error: "Please pick an account" };

  if (!(await assertOwnedAccount(prisma, session.user.id, parsed.data.accountId))) {
    return { ok: false, error: "Account not found" };
  }
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }

  const result = await markPaid(prisma, session.user.id, user.cycleStartDay, reminderId, {
    accountId: parsed.data.accountId,
    categoryId: parsed.data.categoryId ?? undefined,
  });
```

- [ ] **Step 2: Add the imports**

Add near the top of the file, alongside the other `@/lib/...` imports:

```ts
import { assertOwnedAccount } from "@/lib/accounts";
import { assertOwnedCategory } from "@/lib/categories";
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/actions/calendar.actions.ts
git commit -m "fix(security): verify account/category ownership before marking a reminder paid

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Fix `budget.actions.ts` (create allocation)

**Files:**
- Modify: `src/actions/budget.actions.ts`
- Modify: `src/lib/budget-allocations.ts`

`createAllocation` itself does the unscoped `budgetPeriod.findUniqueOrThrow` — fixed at the lib layer here since (unlike accounts) there's no currency lookup reason for the action to touch `budgetPeriod` directly, and this keeps the check next to the one place it's actually needed.

- [ ] **Step 1: Fix `createAllocation`**

In `src/lib/budget-allocations.ts`, change:

```ts
export async function createAllocation(
  prisma: Pick<PrismaClient, "budgetAllocation" | "budgetPeriod" | "transaction">,
  userId: string,
  input: AllocationInput,
) {
  const period = await prisma.budgetPeriod.findUniqueOrThrow({
    where: { id: input.budgetPeriodId },
  });

  const rolloverAmount = await resolveRolloverCarryIn(prisma, userId, input.categoryId, period.startDate);

  return prisma.budgetAllocation.create({
    data: { userId, ...input, rolloverAmount },
  });
}
```

to:

```ts
export type CreateAllocationResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createAllocation(
  prisma: Pick<PrismaClient, "budgetAllocation" | "budgetPeriod" | "transaction" | "category">,
  userId: string,
  input: AllocationInput,
): Promise<CreateAllocationResult> {
  const period = await prisma.budgetPeriod.findFirst({
    where: { id: input.budgetPeriodId, userId },
  });
  if (!period) return { ok: false, error: "Budget period not found" };

  const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId } });
  if (!category) return { ok: false, error: "Category not found" };

  const rolloverAmount = await resolveRolloverCarryIn(prisma, userId, input.categoryId, period.startDate);

  const allocation = await prisma.budgetAllocation.create({
    data: { userId, ...input, rolloverAmount },
  });
  return { ok: true, id: allocation.id };
}
```

- [ ] **Step 2: Update `createAllocation`'s existing tests for the new return shape**

Run: `grep -n "createAllocation" src/lib/budget-allocations.test.ts` to find its existing test(s). Any assertion that currently does `const allocation = await createAllocation(...); expect(allocation.id)...` needs to change to `const result = await createAllocation(...); expect(result.ok).toBe(true); if (result.ok) expect(result.id)...` (or equivalent) to match the new `{ ok, id | error }` shape. Add one new test case:

```ts
it("rejects when the budget period belongs to another user", async () => {
  const prisma = makeFakePrisma({
    budgetPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
  });
  const result = await createAllocation(prisma, "user-1", SAMPLE_INPUT);
  expect(result).toEqual({ ok: false, error: "Budget period not found" });
});

it("rejects when the category belongs to another user", async () => {
  const prisma = makeFakePrisma({
    category: { findFirst: vi.fn().mockResolvedValue(null) },
  });
  const result = await createAllocation(prisma, "user-1", SAMPLE_INPUT);
  expect(result).toEqual({ ok: false, error: "Category not found" });
});
```

(Adjust `makeFakePrisma`/`SAMPLE_INPUT` names to whatever this test file's existing fixture is actually called — check the file first.)

- [ ] **Step 3: Update `createAllocationAction`'s call site**

In `src/actions/budget.actions.ts`, change:

```ts
  await createAllocation(prisma, user.id, {
    budgetPeriodId: parsed.data.budgetPeriodId,
    categoryId: parsed.data.categoryId,
    plannedAmount: toMinorUnits(parsed.data.plannedAmount, user.currency),
    rolloverMode: parsed.data.rolloverMode,
  });

  revalidatePath("/budget");
  return { ok: true };
```

to:

```ts
  const result = await createAllocation(prisma, user.id, {
    budgetPeriodId: parsed.data.budgetPeriodId,
    categoryId: parsed.data.categoryId,
    plannedAmount: toMinorUnits(parsed.data.plannedAmount, user.currency),
    rolloverMode: parsed.data.rolloverMode,
  });
  if (!result.ok) return result;

  revalidatePath("/budget");
  return { ok: true };
```

(If the actual current code shape differs slightly — e.g. doesn't already `await` inline like this — apply the same idea: check `result.ok` and propagate the error before revalidating.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/budget-allocations.ts src/lib/budget-allocations.test.ts src/actions/budget.actions.ts
git commit -m "fix(security): verify budget-period/category ownership before creating an allocation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Fix `category.actions.ts` (create subcategory)

**Files:**
- Modify: `src/lib/categories.ts`
- Modify: `src/lib/categories.test.ts`

Fixed at the lib layer (matching Task 10's reasoning) since `createSubcategory` is the one place the parent `categoryId` is trusted.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/categories.test.ts`:

```ts
describe("createSubcategory — ownership", () => {
  it("rejects when the parent category belongs to another user", async () => {
    const prisma = {
      category: { findFirst: vi.fn().mockResolvedValue(null) },
      subcategory: { create: vi.fn() },
    } as any;
    const result = await createSubcategory(prisma, "user-1", { name: "Coffee", categoryId: "cat-owned-by-someone-else" });
    expect(result).toEqual({ ok: false, error: "Category not found" });
    expect(prisma.subcategory.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/categories.test.ts`
Expected: FAIL — `createSubcategory` currently always creates, never returns an error shape

- [ ] **Step 3: Implement**

Change:

```ts
export async function createSubcategory(
  prisma: Pick<PrismaClient, "subcategory">,
  userId: string,
  input: SubcategoryInput,
) {
  return prisma.subcategory.create({ data: { userId, ...input } });
}
```

to:

```ts
export async function createSubcategory(
  prisma: Pick<PrismaClient, "subcategory" | "category">,
  userId: string,
  input: SubcategoryInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await assertOwnedCategory(prisma, userId, input.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
  const subcategory = await prisma.subcategory.create({ data: { userId, ...input } });
  return { ok: true, id: subcategory.id };
}
```

- [ ] **Step 4: Update the existing happy-path test and the action call site**

In `src/lib/categories.test.ts`, any existing `createSubcategory` happy-path test needs its fake `prisma.category.findFirst` to resolve to a truthy row (e.g. `{ id: "cat-1" }`) so the ownership check passes, and its assertion on the return value updated to the new `{ ok: true, id }` shape.

In `src/actions/category.actions.ts`, change:

```ts
  await createSubcategory(prisma, session.user.id, parsed.data);
  revalidatePath("/settings");
  return { ok: true };
```

to:

```ts
  const result = await createSubcategory(prisma, session.user.id, parsed.data);
  if (!result.ok) return result;
  revalidatePath("/settings");
  return { ok: true };
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/categories.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/categories.ts src/lib/categories.test.ts src/actions/category.actions.ts
git commit -m "fix(security): verify parent category ownership before creating a subcategory

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Fix `shopping-catalog.ts` (create/update catalog item, record price)

**Files:**
- Modify: `src/lib/shopping-catalog.ts`
- Modify: `src/lib/shopping-catalog.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/shopping-catalog.test.ts`:

```ts
describe("createCatalogItem — ownership", () => {
  it("rejects when categoryId belongs to another user", async () => {
    const prisma = {
      shoppingCatalogItem: { create: vi.fn() },
      alias: { create: vi.fn() },
      category: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;
    const result = await createCatalogItem(prisma, "user-1", {
      canonicalName: "Milk",
      brand: null,
      size: null,
      unit: null,
      categoryId: "cat-owned-by-someone-else",
      defaultQuantity: 1,
      preferredStoreId: null,
      aliases: [],
    });
    expect(result).toEqual({ ok: false, error: "Category not found" });
    expect(prisma.shoppingCatalogItem.create).not.toHaveBeenCalled();
  });
});

describe("recordPrice — ownership", () => {
  it("rejects when catalogItemId belongs to another user", async () => {
    const prisma = {
      shoppingCatalogItem: { findFirst: vi.fn().mockResolvedValue(null) },
      shoppingPriceHistory: { create: vi.fn() },
    } as any;
    const result = await recordPrice(prisma, "user-1", "item-owned-by-someone-else", {
      storeId: null,
      unitPrice: 5000,
      source: "MANUAL",
    });
    expect(result).toEqual({ ok: false, error: "Catalog item not found" });
    expect(prisma.shoppingPriceHistory.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/shopping-catalog.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Change:

```ts
export async function createCatalogItem(
  prisma: CatalogPrisma,
  userId: string,
  input: {
    canonicalName: string;
    brand: string | null;
    size: string | null;
    unit: string | null;
    categoryId: string | null;
    defaultQuantity: number;
    preferredStoreId: string | null;
    aliases: string[];
  },
) {
  const { aliases, ...itemInput } = input;
  const item = await prisma.shoppingCatalogItem.create({ data: { userId, ...itemInput } });
  for (const alias of aliases) {
    const normalized = alias.trim().toLowerCase();
    if (!normalized) continue;
    await prisma.alias.create({
      data: { userId, kind: "shopping_item", alias: normalized, targetId: item.id },
    });
  }
  return item;
}
```

to:

```ts
export async function createCatalogItem(
  prisma: CatalogPrisma & Pick<PrismaClient, "category">,
  userId: string,
  input: {
    canonicalName: string;
    brand: string | null;
    size: string | null;
    unit: string | null;
    categoryId: string | null;
    defaultQuantity: number;
    preferredStoreId: string | null;
    aliases: string[];
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (input.categoryId && !(await assertOwnedCategory(prisma, userId, input.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
  const { aliases, ...itemInput } = input;
  const item = await prisma.shoppingCatalogItem.create({ data: { userId, ...itemInput } });
  for (const alias of aliases) {
    const normalized = alias.trim().toLowerCase();
    if (!normalized) continue;
    await prisma.alias.create({
      data: { userId, kind: "shopping_item", alias: normalized, targetId: item.id },
    });
  }
  return { ok: true, id: item.id };
}
```

Add the import at the top of the file:

```ts
import { assertOwnedCategory } from "@/lib/categories";
```

Change `updateCatalogItem` from:

```ts
export async function updateCatalogItem(
  prisma: Pick<PrismaClient, "shoppingCatalogItem">,
  userId: string,
  catalogItemId: string,
  input: Partial<{
    canonicalName: string;
    brand: string | null;
    size: string | null;
    unit: string | null;
    categoryId: string | null;
    defaultQuantity: number;
    preferredStoreId: string | null;
    isFavorite: boolean;
  }>,
): Promise<ShoppingMutationResult> {
  if (!(await assertOwnedCatalogItem(prisma, userId, catalogItemId))) {
    return { ok: false, error: "Catalog item not found" };
  }
  const item = await prisma.shoppingCatalogItem.update({ where: { id: catalogItemId }, data: input });
  return { ok: true, id: item.id };
}
```

to:

```ts
export async function updateCatalogItem(
  prisma: Pick<PrismaClient, "shoppingCatalogItem" | "category">,
  userId: string,
  catalogItemId: string,
  input: Partial<{
    canonicalName: string;
    brand: string | null;
    size: string | null;
    unit: string | null;
    categoryId: string | null;
    defaultQuantity: number;
    preferredStoreId: string | null;
    isFavorite: boolean;
  }>,
): Promise<ShoppingMutationResult> {
  if (!(await assertOwnedCatalogItem(prisma, userId, catalogItemId))) {
    return { ok: false, error: "Catalog item not found" };
  }
  if (input.categoryId && !(await assertOwnedCategory(prisma, userId, input.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
  const item = await prisma.shoppingCatalogItem.update({ where: { id: catalogItemId }, data: input });
  return { ok: true, id: item.id };
}
```

Change `recordPrice` from:

```ts
export async function recordPrice(
  prisma: Pick<PrismaClient, "shoppingPriceHistory">,
  userId: string,
  catalogItemId: string,
  input: { storeId: string | null; unitPrice: number; source: string },
) {
  return prisma.shoppingPriceHistory.create({ data: { userId, catalogItemId, ...input } });
}
```

to:

```ts
export async function recordPrice(
  prisma: Pick<PrismaClient, "shoppingPriceHistory" | "shoppingCatalogItem">,
  userId: string,
  catalogItemId: string,
  input: { storeId: string | null; unitPrice: number; source: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await assertOwnedCatalogItem(prisma, userId, catalogItemId))) {
    return { ok: false, error: "Catalog item not found" };
  }
  const price = await prisma.shoppingPriceHistory.create({ data: { userId, catalogItemId, ...input } });
  return { ok: true, id: price.id };
}
```

- [ ] **Step 4: Update the existing tests and call sites for the new return shapes**

`createCatalogItem`'s and `recordPrice`'s existing happy-path tests need updating to check `.ok`/`.id` instead of the raw row, and their fake `prisma.category`/`prisma.shoppingCatalogItem.findFirst` need a truthy value so the new ownership checks pass. In `src/actions/shopping-catalog.actions.ts`, update `createCatalogItemAction` and the record-price action to check `result.ok` and propagate `result.error` the same way Task 10/11 did (find the exact current call shape and apply the same `if (!result.ok) return result;` pattern before their `revalidatePath` calls).

- [ ] **Step 5: Run to verify everything passes**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/shopping-catalog.ts src/lib/shopping-catalog.test.ts src/actions/shopping-catalog.actions.ts
git commit -m "fix(security): verify category/catalog-item ownership in shopping catalog writes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Fix `shopping-list.ts` (create list, add/update item)

**Files:**
- Modify: `src/lib/shopping-list.ts`
- Modify: `src/lib/shopping-list.test.ts`
- Modify: `src/actions/shopping-list.actions.ts`

`addItemAction` and `updateItemAction` both funnel through the same `parseItemForm` helper in the actions file — fixing the check there covers both in one place.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/shopping-list.test.ts`:

```ts
describe("createList — ownership", () => {
  it("rejects when budgetCategoryId belongs to another user", async () => {
    const prisma = {
      shoppingList: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      category: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;
    const result = await createList(prisma, "user-1", {
      name: "Weekly groceries",
      plannedDate: null,
      budgetCategoryId: "cat-owned-by-someone-else",
    });
    expect(result).toEqual({ ok: false, error: "Category not found" });
    expect(prisma.shoppingList.create).not.toHaveBeenCalled();
  });
});

describe("addItem — ownership", () => {
  it("rejects when categoryId belongs to another user", async () => {
    const prisma = {
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1" }) },
      shoppingListItem: { create: vi.fn() },
      category: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;
    const result = await addItem(prisma, "user-1", "list-1", {
      catalogItemId: null,
      freeTextName: "Bananas",
      quantity: 1,
      unit: null,
      estimatedUnitPrice: null,
      preferredStoreId: null,
      categoryId: "cat-owned-by-someone-else",
      priority: "NORMAL",
      notes: null,
    });
    expect(result).toEqual({ ok: false, error: "Category not found" });
    expect(prisma.shoppingListItem.create).not.toHaveBeenCalled();
  });

  it("rejects when catalogItemId belongs to another user", async () => {
    const prisma = {
      shoppingList: { findFirst: vi.fn().mockResolvedValue({ id: "list-1" }) },
      shoppingListItem: { create: vi.fn() },
      shoppingCatalogItem: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;
    const result = await addItem(prisma, "user-1", "list-1", {
      catalogItemId: "item-owned-by-someone-else",
      freeTextName: null,
      quantity: 1,
      unit: null,
      estimatedUnitPrice: null,
      preferredStoreId: null,
      categoryId: null,
      priority: "NORMAL",
      notes: null,
    });
    expect(result).toEqual({ ok: false, error: "Catalog item not found" });
    expect(prisma.shoppingListItem.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/shopping-list.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

In `src/lib/shopping-list.ts`, add the imports:

```ts
import { assertOwnedCategory } from "@/lib/categories";
import { assertOwnedCatalogItem } from "@/lib/shopping-catalog";
```

Change `createList` from:

```ts
export async function createList(
  prisma: Pick<PrismaClient, "shoppingList">,
  userId: string,
  input: { name: string; plannedDate: Date | null; budgetCategoryId: string | null },
) {
  const existingCurrent = await prisma.shoppingList.findFirst({ where: { userId, isCurrent: true } });
  return prisma.shoppingList.create({
    data: { userId, ...input, isCurrent: existingCurrent === null },
  });
}
```

to:

```ts
export async function createList(
  prisma: Pick<PrismaClient, "shoppingList" | "category">,
  userId: string,
  input: { name: string; plannedDate: Date | null; budgetCategoryId: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (input.budgetCategoryId && !(await assertOwnedCategory(prisma, userId, input.budgetCategoryId))) {
    return { ok: false, error: "Category not found" };
  }
  const existingCurrent = await prisma.shoppingList.findFirst({ where: { userId, isCurrent: true } });
  const list = await prisma.shoppingList.create({
    data: { userId, ...input, isCurrent: existingCurrent === null },
  });
  return { ok: true, id: list.id };
}
```

Change `addItem` from:

```ts
export async function addItem(
  prisma: ListPrisma,
  userId: string,
  listId: string,
  input: {
    catalogItemId: string | null;
    freeTextName: string | null;
    quantity: number;
    unit: string | null;
    estimatedUnitPrice: number | null;
    preferredStoreId: string | null;
    categoryId: string | null;
    priority: string;
    notes: string | null;
  },
): Promise<ShoppingMutationResult> {
  if (!(await assertOwnedList(prisma, userId, listId))) {
    return { ok: false, error: "List not found" };
  }
  const item = await prisma.shoppingListItem.create({ data: { userId, listId, ...input } });
  return { ok: true, id: item.id };
}
```

to:

```ts
export async function addItem(
  prisma: ListPrisma & Pick<PrismaClient, "category" | "shoppingCatalogItem">,
  userId: string,
  listId: string,
  input: {
    catalogItemId: string | null;
    freeTextName: string | null;
    quantity: number;
    unit: string | null;
    estimatedUnitPrice: number | null;
    preferredStoreId: string | null;
    categoryId: string | null;
    priority: string;
    notes: string | null;
  },
): Promise<ShoppingMutationResult> {
  if (!(await assertOwnedList(prisma, userId, listId))) {
    return { ok: false, error: "List not found" };
  }
  if (input.categoryId && !(await assertOwnedCategory(prisma, userId, input.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
  if (input.catalogItemId && !(await assertOwnedCatalogItem(prisma, userId, input.catalogItemId))) {
    return { ok: false, error: "Catalog item not found" };
  }
  const item = await prisma.shoppingListItem.create({ data: { userId, listId, ...input } });
  return { ok: true, id: item.id };
}
```

Apply the identical two checks (categoryId, catalogItemId) to `updateItem`, right after its existing `assertOwnedItem` check and before the `prisma.shoppingListItem.update(...)` call — same pattern as `addItem` above, widening `updateItem`'s prisma param the same way.

- [ ] **Step 4: Update existing tests and the actions-layer call sites**

Update `createList`/`addItem`/`updateItem`'s existing happy-path tests for the new return shape and the fake `category`/`shoppingCatalogItem` fixtures needed. In `src/actions/shopping-list.actions.ts`, update `createListAction`, `addItemAction`, and `updateItemAction` to check `result.ok` and propagate the error, matching the pattern from Task 10/11 (find their current `await createList(...)`/`await addItem(...)`/`await updateItem(...)` calls and wrap the same way).

- [ ] **Step 5: Run to verify everything passes**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/shopping-list.ts src/lib/shopping-list.test.ts src/actions/shopping-list.actions.ts
git commit -m "fix(security): verify category/catalog-item ownership in shopping list writes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: Fix `receipts.ts` (add/update line) and `receipt.actions.ts` (confirm)

**Files:**
- Modify: `src/lib/receipts.ts`
- Modify: `src/lib/receipts.test.ts`
- Modify: `src/actions/receipt.actions.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/receipts.test.ts` (inside or near the existing `addLine`/`updateLine` describe blocks):

```ts
it("addLine rejects when categoryId belongs to another user", async () => {
  const prisma = makeFakePrisma({
    receipt: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }), update: vi.fn() },
    category: { findFirst: vi.fn().mockResolvedValue(null) },
  });
  const result = await addLine(prisma, "user-1", "receipt-1", {
    catalogItemId: null,
    rawText: null,
    name: "Milk",
    quantity: 1,
    unitPrice: 15000,
    lineTotal: 15000,
    categoryId: "cat-owned-by-someone-else",
    excluded: false,
  });
  expect(result).toEqual({ ok: false, error: "Category not found" });
  expect(prisma.receiptLine.create).not.toHaveBeenCalled();
});

it("addLine rejects when an explicit catalogItemId belongs to another user", async () => {
  const prisma = makeFakePrisma({
    receipt: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue({ id: "receipt-1", userId: "user-1" }), update: vi.fn() },
    shoppingCatalogItem: { findFirst: vi.fn().mockResolvedValue(null) },
  });
  const result = await addLine(prisma, "user-1", "receipt-1", {
    catalogItemId: "item-owned-by-someone-else",
    rawText: null,
    name: "Milk",
    quantity: 1,
    unitPrice: 15000,
    lineTotal: 15000,
    categoryId: null,
    excluded: false,
  });
  expect(result).toEqual({ ok: false, error: "Catalog item not found" });
  expect(prisma.receiptLine.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

In `src/lib/receipts.ts`, add the import:

```ts
import { assertOwnedCategory } from "@/lib/categories";
import { assertOwnedCatalogItem } from "@/lib/shopping-catalog";
```

In `addLine`, right after the existing ownership check (`if (!(await assertOwnedReceipt(...)))`) and before the catalog-item alias-resolution block, add:

```ts
  if (input.categoryId && !(await assertOwnedCategory(prisma, userId, input.categoryId))) {
    return { ok: false, error: "Category not found" };
  }
  if (input.catalogItemId && !(await assertOwnedCatalogItem(prisma, userId, input.catalogItemId))) {
    return { ok: false, error: "Catalog item not found" };
  }
```

Widen `addLine`'s prisma parameter type to also include `"category" | "shoppingCatalogItem"`.

Apply the identical two checks to `updateLine`, right after its `assertOwnedLine` check, widening its prisma parameter the same way.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/receipts.test.ts`
Expected: PASS

- [ ] **Step 5: Fix `confirmReceiptAction`'s unchecked `accountId`**

This one flows straight from the form into `confirmReceipt` → `createExpenseLikeTransaction`, with no ownership check anywhere in between. In `src/actions/receipt.actions.ts`, change:

```ts
  const parsed = confirmReceiptSchema.safeParse({
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || null,
    date: formData.get("date"),
  });
  if (!parsed.success) return { ok: false, error: "Please check the account/category/date" };

  const result = await confirmReceipt(prisma, session.user.id, user.cycleStartDay, receiptId, {
```

to:

```ts
  const parsed = confirmReceiptSchema.safeParse({
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") || null,
    date: formData.get("date"),
  });
  if (!parsed.success) return { ok: false, error: "Please check the account/category/date" };

  if (!(await assertOwnedAccount(prisma, session.user.id, parsed.data.accountId))) {
    return { ok: false, error: "Account not found" };
  }
  if (parsed.data.categoryId && !(await assertOwnedCategory(prisma, session.user.id, parsed.data.categoryId))) {
    return { ok: false, error: "Category not found" };
  }

  const result = await confirmReceipt(prisma, session.user.id, user.cycleStartDay, receiptId, {
```

Add the imports:

```ts
import { assertOwnedAccount } from "@/lib/accounts";
import { assertOwnedCategory } from "@/lib/categories";
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/receipts.ts src/lib/receipts.test.ts src/actions/receipt.actions.ts
git commit -m "fix(security): verify account/category/catalog-item ownership in receipt writes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 15: Fix `year-plan.ts` (savings-goal reference, cross-plan phase reference)

**Files:**
- Modify: `src/lib/year-plan.ts`
- Modify: `src/lib/year-plan.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/year-plan.test.ts`:

```ts
describe("createYearPlan — ownership", () => {
  it("rejects when vacationReserveGoalId belongs to another user", async () => {
    const prisma = {
      yearPlan: { create: vi.fn() },
      savingsGoal: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any;
    const result = await createYearPlan(prisma, "user-1", {
      name: "2027 Plan",
      startDate: new Date(2027, 0, 1),
      endDate: new Date(2027, 11, 31),
      minCashBuffer: 0,
      vacationReserveGoalId: "goal-owned-by-someone-else",
    });
    expect(result).toEqual({ ok: false, error: "Savings goal not found" });
    expect(prisma.yearPlan.create).not.toHaveBeenCalled();
  });
});

describe("addIncomeForecast — ownership", () => {
  it("rejects when phaseId belongs to a different plan", async () => {
    const prisma = {
      yearPlan: { findFirst: vi.fn().mockResolvedValue({ id: "plan-1", userId: "user-1" }) },
      yearPlanPhase: { findFirst: vi.fn().mockResolvedValue(null) },
      incomeForecast: { create: vi.fn() },
    } as any;
    const result = await addIncomeForecast(prisma, "user-1", "plan-1", {
      phaseId: "phase-from-a-different-plan",
      source: "Salary",
      expectedDate: new Date(2027, 5, 1),
      expectedAmount: 50000,
      cutoffLabel: "June cutoff",
      status: "EXPECTED",
      notes: null,
    });
    expect(result).toEqual({ ok: false, error: "Phase not found" });
    expect(prisma.incomeForecast.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/year-plan.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Change `createYearPlan` from:

```ts
export async function createYearPlan(
  prisma: Pick<PrismaClient, "yearPlan">,
  userId: string,
  input: {
    name: string;
    startDate: Date;
    endDate: Date;
    minCashBuffer: number;
    vacationReserveGoalId: string | null;
  },
) {
  return prisma.yearPlan.create({ data: { userId, ...input } });
}
```

to:

```ts
export async function createYearPlan(
  prisma: Pick<PrismaClient, "yearPlan" | "savingsGoal">,
  userId: string,
  input: {
    name: string;
    startDate: Date;
    endDate: Date;
    minCashBuffer: number;
    vacationReserveGoalId: string | null;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (input.vacationReserveGoalId) {
    const goal = await prisma.savingsGoal.findFirst({ where: { id: input.vacationReserveGoalId, userId } });
    if (!goal) return { ok: false, error: "Savings goal not found" };
  }
  const plan = await prisma.yearPlan.create({ data: { userId, ...input } });
  return { ok: true, id: plan.id };
}
```

Apply the identical `vacationReserveGoalId` check to `updateYearPlan`, right after its existing `assertOwnedPlan` check and before `prisma.yearPlan.update(...)`, widening its prisma parameter to also include `"savingsGoal"`.

In `addIncomeForecast`, right after its existing `assertOwnedPlan` check, add:

```ts
  if (input.phaseId) {
    const phase = await prisma.yearPlanPhase.findFirst({ where: { id: input.phaseId, userId, yearPlanId } });
    if (!phase) return { ok: false, error: "Phase not found" };
  }
```

Widen `addIncomeForecast`'s prisma parameter to also include `"yearPlanPhase"`.

- [ ] **Step 4: Update existing tests and call sites for the new `createYearPlan`/`updateYearPlan` return shapes**

Update their happy-path tests to check `.ok`/`.id` and to supply a truthy `savingsGoal.findFirst` result whenever `vacationReserveGoalId` is non-null. In `src/actions/year-plan.actions.ts`, update `createYearPlanAction` to check `result.ok` before its `revalidatePath` call (mirroring `updateYearPlanAction`, which already handles a `{ ok, error }` result today).

- [ ] **Step 5: Run to verify everything passes**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/year-plan.ts src/lib/year-plan.test.ts src/actions/year-plan.actions.ts
git commit -m "fix(security): verify savings-goal ownership and same-plan phase reference in Year Plan writes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 16: Full verification sweep

**Files:** none — verification only.

- [ ] **Step 1: Full Vitest suite**

Run: `npx vitest run`
Expected: every test file passes

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `npx eslint src e2e`
Expected: no new errors (the 4 pre-existing unrelated warnings are fine)

- [ ] **Step 4: Full Playwright e2e suite**

Run: `npx playwright test`
Expected: all 4 tests pass — confirms the ownership checks don't break the demo user's own legitimate flows (which only ever reference their own accounts/categories)

- [ ] **Step 5: Production build**

Run: `npx next build`
Expected: succeeds, all 23 routes registered

- [ ] **Step 6: Reset the demo account**

Run: `npm run db:seed-demo`
Expected: succeeds

- [ ] **Step 7: Manual verification of the original vulnerability**

Using the Browser pane against the local dev server: log in as the demo user, open browser dev tools' console, and attempt to call `createTransactionAction` (or simpler: attempt the transaction form with a manually-edited `accountId` in the DOM, if feasible) referencing an account id that isn't one of the demo user's own three seeded accounts (e.g. a made-up cuid-shaped string). Expected: the form submission returns "Account not found" instead of silently succeeding.

- [ ] **Step 8: No commit for this task — verification only.**
