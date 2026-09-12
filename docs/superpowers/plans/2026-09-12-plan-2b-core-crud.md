# Plan 2B: Core CRUD Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real, usable pages for Accounts, Categories (with Subcategories), and Transactions — create/edit/archive/delete, search/filters on the transaction list, and a global "Add Transaction" entry point from the top nav. This is the first plan where there's something to click around in the browser for the financial data built in Plan 2A.

**Architecture:** Same layering as Plan 2A and the existing auth/onboarding code: dependency-injected domain functions in `src/lib/` (unit tested against a mocked Prisma client) → thin `"use server"` actions in `src/actions/` (auth-gated, zod-validated, call the domain functions, `revalidatePath` on success) → pages/components that call those actions. Every domain function takes `userId` explicitly and scopes every query/mutation by it — ownership is enforced at this layer, not just trusted from the session.

**Scope boundaries (deliberate, to keep this plan shippable):**
- Editing a transaction is limited to description/notes/category/subcategory — **not** amount, type, or accounts. Changing those on a transfer would desync its two linked rows; for now, fix a mistake by deleting and recreating. Revisit if this proves annoying in practice.
- Deleting a transfer transaction deletes **both** linked rows together.
- No multi-currency conversion — if a transfer's source and destination accounts have different `currency` values, the form rejects it with a clear message (matches the design spec's "out of scope" list).
- No table-library dependency — the transaction list is a single responsive component (stacked rows that read like cards on narrow screens), not a separate desktop-table/mobile-card pair.

**Tech Stack:** Same as Plan 2A, plus shadcn's `dialog`, `select`, `textarea`, `alert-dialog`, and `sonner` (toast) components.

**Read first:** `docs/superpowers/specs/2026-09-12-budget-tracker-design.md` and `docs/superpowers/plans/2026-09-12-plan-2a-financial-foundation.md`. This plan builds directly on Plan 2A's domain services (`src/lib/cycle.ts`, `transaction-rules.ts`, `budget-period.ts`, `transfers.ts`, `account-balance.ts`) — don't re-derive that logic here.

**A note on generated shadcn component APIs:** this project's shadcn setup uses `@base-ui/react` under the hood (see Plan 1 Task 3), not Radix. The component *usage* shown below (`DialogTrigger`/`DialogContent`/`SelectItem`/etc.) follows shadcn's standard documented API, which the registry normalizes across primitive libraries — but if a generated component's actual export names differ once added in Task 5, adapt the later tasks' JSX to match what was actually generated rather than fighting it.

---

### Task 1: Validation schemas for accounts, categories, subcategories, and transactions

**Files:**
- Create: `src/lib/validations/account.ts`, `src/lib/validations/category.ts`, `src/lib/validations/transaction.ts`
- Test: `src/lib/validations/account.test.ts`, `src/lib/validations/category.test.ts`, `src/lib/validations/transaction.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/validations/account.test.ts
import { describe, expect, it } from "vitest";
import { accountSchema } from "@/lib/validations/account";

describe("accountSchema", () => {
  it("accepts a valid account", () => {
    const result = accountSchema.safeParse({
      name: "Everyday Checking",
      accountType: "CHECKING",
      openingBalance: 1000,
      currency: "PHP",
      includeInLiquidFunds: true,
      isPrimaryFundingAccount: false,
      color: "blue",
      icon: "landmark",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = accountSchema.safeParse({
      name: "",
      accountType: "CHECKING",
      openingBalance: 0,
      currency: "PHP",
      includeInLiquidFunds: true,
      isPrimaryFundingAccount: false,
      color: "blue",
      icon: "landmark",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid accountType", () => {
    const result = accountSchema.safeParse({
      name: "Checking",
      accountType: "NOT_A_TYPE",
      openingBalance: 0,
      currency: "PHP",
      includeInLiquidFunds: true,
      isPrimaryFundingAccount: false,
      color: "blue",
      icon: "landmark",
    });
    expect(result.success).toBe(false);
  });
});
```

```typescript
// src/lib/validations/category.test.ts
import { describe, expect, it } from "vitest";
import { categorySchema, subcategorySchema } from "@/lib/validations/category";

describe("categorySchema", () => {
  it("accepts a valid category", () => {
    const result = categorySchema.safeParse({
      name: "Groceries",
      type: "EXPENSE",
      color: "coral",
      icon: "shopping-cart",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid type", () => {
    const result = categorySchema.safeParse({
      name: "Groceries",
      type: "NOT_A_TYPE",
      color: "coral",
      icon: "shopping-cart",
    });
    expect(result.success).toBe(false);
  });
});

describe("subcategorySchema", () => {
  it("accepts a valid subcategory", () => {
    const result = subcategorySchema.safeParse({ name: "Produce", categoryId: "cat-1" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = subcategorySchema.safeParse({ name: "", categoryId: "cat-1" });
    expect(result.success).toBe(false);
  });
});
```

```typescript
// src/lib/validations/transaction.test.ts
import { describe, expect, it } from "vitest";
import { transactionSchema, transferSchema } from "@/lib/validations/transaction";

describe("transactionSchema", () => {
  it("accepts a valid expense", () => {
    const result = transactionSchema.safeParse({
      type: "EXPENSE",
      amount: 500,
      date: new Date(),
      accountId: "acc-1",
      description: "Groceries",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative amount", () => {
    expect(
      transactionSchema.safeParse({
        type: "EXPENSE",
        amount: 0,
        date: new Date(),
        accountId: "acc-1",
        description: "Invalid",
      }).success,
    ).toBe(false);
    expect(
      transactionSchema.safeParse({
        type: "EXPENSE",
        amount: -5,
        date: new Date(),
        accountId: "acc-1",
        description: "Invalid",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty description", () => {
    const result = transactionSchema.safeParse({
      type: "EXPENSE",
      amount: 500,
      date: new Date(),
      accountId: "acc-1",
      description: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("transferSchema", () => {
  it("accepts a valid transfer", () => {
    const result = transferSchema.safeParse({
      amount: 500,
      date: new Date(),
      sourceAccountId: "acc-1",
      destinationAccountId: "acc-2",
      description: "Move to savings",
    });
    expect(result.success).toBe(true);
  });

  it("rejects the same account as source and destination", () => {
    const result = transferSchema.safeParse({
      amount: 500,
      date: new Date(),
      sourceAccountId: "acc-1",
      destinationAccountId: "acc-1",
      description: "Invalid",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/validations/account.test.ts src/lib/validations/category.test.ts src/lib/validations/transaction.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write the schemas**

```typescript
// src/lib/validations/account.ts
import { z } from "zod";
import { ACCOUNT_TYPES } from "@/lib/constants/financial";

export const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  accountType: z.enum(ACCOUNT_TYPES),
  openingBalance: z.number(), // major units — converted to minor units by the caller
  currency: z.string().min(1),
  includeInLiquidFunds: z.boolean(),
  isPrimaryFundingAccount: z.boolean(),
  color: z.string().min(1),
  icon: z.string().min(1),
});
```

```typescript
// src/lib/validations/category.ts
import { z } from "zod";
import { CATEGORY_TYPES } from "@/lib/constants/financial";

export const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(CATEGORY_TYPES),
  color: z.string().min(1),
  icon: z.string().min(1),
});

export const subcategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  categoryId: z.string().min(1),
});
```

```typescript
// src/lib/validations/transaction.ts
import { z } from "zod";

// TRANSFER isn't here — it's created via transferSchema/createTransfer
// (Plan 2A), not the regular transaction form.
const NON_TRANSFER_TYPES = [
  "EXPENSE",
  "INCOME",
  "REFUND",
  "SAVINGS",
  "LOAN_PAYMENT",
  "CREDIT_CARD_PAYMENT",
  "TRANSFER_FEE",
] as const;

export const transactionSchema = z.object({
  type: z.enum(NON_TRANSFER_TYPES),
  amount: z.number().positive("Amount must be greater than zero"), // major units
  date: z.date(),
  accountId: z.string().min(1),
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  description: z.string().min(1, "Description is required"),
  notes: z.string().optional(),
});

export const transferSchema = z
  .object({
    amount: z.number().positive("Amount must be greater than zero"), // major units
    date: z.date(),
    sourceAccountId: z.string().min(1),
    destinationAccountId: z.string().min(1),
    description: z.string().min(1, "Description is required"),
  })
  .refine((data) => data.sourceAccountId !== data.destinationAccountId, {
    message: "Source and destination accounts must be different",
    path: ["destinationAccountId"],
  });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/validations/account.test.ts src/lib/validations/category.test.ts src/lib/validations/transaction.test.ts
```

Expected: PASS (12 tests total).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add account, category, and transaction validation schemas"
```

---

### Task 2: Account domain functions (with tests)

**Files:**
- Create: `src/lib/accounts.ts`
- Test: `src/lib/accounts.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/accounts.test.ts
import { describe, expect, it, vi } from "vitest";
import { archiveAccount, createAccount, listAccounts, updateAccount } from "@/lib/accounts";

const SAMPLE_INPUT = {
  name: "Everyday Checking",
  accountType: "CHECKING",
  openingBalance: 100000,
  currency: "PHP",
  includeInLiquidFunds: true,
  isPrimaryFundingAccount: false,
  color: "blue",
  icon: "landmark",
};

describe("createAccount", () => {
  it("creates an account scoped to the given user", async () => {
    const create = vi.fn().mockResolvedValue({ id: "acc-1" });
    const prisma = { account: { create } } as any;

    await createAccount(prisma, "user-1", SAMPLE_INPUT);

    expect(create).toHaveBeenCalledWith({ data: { userId: "user-1", ...SAMPLE_INPUT } });
  });
});

describe("updateAccount", () => {
  it("updates only when the account belongs to the user", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { account: { updateMany } } as any;

    const result = await updateAccount(prisma, "user-1", "acc-1", { name: "New Name" });

    expect(result).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" },
      data: { name: "New Name" },
    });
  });

  it("reports not found when no row matched (wrong user or missing account)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { account: { updateMany } } as any;

    const result = await updateAccount(prisma, "user-1", "acc-1", { name: "New Name" });

    expect(result).toEqual({ ok: false, error: "Account not found" });
  });
});

describe("archiveAccount", () => {
  it("sets archivedAt only for the owning user's account", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { account: { updateMany } } as any;

    const result = await archiveAccount(prisma, "user-1", "acc-1");

    expect(result).toEqual({ ok: true });
    const args = updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "acc-1", userId: "user-1" });
    expect(args.data.archivedAt).toBeInstanceOf(Date);
  });
});

describe("listAccounts", () => {
  it("scopes to the user and excludes archived accounts by default", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { account: { findMany } } as any;

    await listAccounts(prisma, "user-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
  });

  it("includes archived accounts when asked", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { account: { findMany } } as any;

    await listAccounts(prisma, "user-1", { includeArchived: true });

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "asc" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/accounts.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/accounts'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/accounts.ts
import type { PrismaClient } from "@prisma/client";

export type AccountInput = {
  name: string;
  accountType: string;
  openingBalance: number; // minor units
  currency: string;
  includeInLiquidFunds: boolean;
  isPrimaryFundingAccount: boolean;
  color: string;
  icon: string;
};

export type AccountMutationResult = { ok: true } | { ok: false; error: string };

export async function createAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  input: AccountInput,
) {
  return prisma.account.create({ data: { userId, ...input } });
}

export async function updateAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  accountId: string,
  input: Partial<AccountInput>,
): Promise<AccountMutationResult> {
  const result = await prisma.account.updateMany({
    where: { id: accountId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Account not found" };
  }
  return { ok: true };
}

export async function archiveAccount(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  accountId: string,
): Promise<AccountMutationResult> {
  const result = await prisma.account.updateMany({
    where: { id: accountId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Account not found" };
  }
  return { ok: true };
}

export async function listAccounts(
  prisma: Pick<PrismaClient, "account">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.account.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "asc" },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/accounts.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add account domain functions (create/update/archive/list)"
```

---

### Task 3: Category and subcategory domain functions (with tests)

**Files:**
- Create: `src/lib/categories.ts`
- Test: `src/lib/categories.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/categories.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  archiveCategory,
  archiveSubcategory,
  createCategory,
  createSubcategory,
  listCategories,
  updateCategory,
} from "@/lib/categories";

describe("createCategory", () => {
  it("creates a category scoped to the given user", async () => {
    const create = vi.fn().mockResolvedValue({ id: "cat-1" });
    const prisma = { category: { create } } as any;

    const input = { name: "Groceries", type: "EXPENSE", color: "coral", icon: "shopping-cart" };
    await createCategory(prisma, "user-1", input);

    expect(create).toHaveBeenCalledWith({ data: { userId: "user-1", ...input } });
  });
});

describe("updateCategory", () => {
  it("updates only when the category belongs to the user", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { category: { updateMany } } as any;

    const result = await updateCategory(prisma, "user-1", "cat-1", { name: "New Name" });

    expect(result).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "cat-1", userId: "user-1" },
      data: { name: "New Name" },
    });
  });
});

describe("archiveCategory", () => {
  it("reports not found for a category the user doesn't own", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { category: { updateMany } } as any;

    const result = await archiveCategory(prisma, "user-1", "cat-1");

    expect(result).toEqual({ ok: false, error: "Category not found" });
  });
});

describe("listCategories", () => {
  it("scopes to the user, excludes archived by default, and includes subcategories", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { category: { findMany } } as any;

    await listCategories(prisma, "user-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      include: { subcategories: { where: { archivedAt: null } } },
      orderBy: { sortOrder: "asc" },
    });
  });
});

describe("createSubcategory", () => {
  it("creates a subcategory scoped to the given user", async () => {
    const create = vi.fn().mockResolvedValue({ id: "sub-1" });
    const prisma = { subcategory: { create } } as any;

    await createSubcategory(prisma, "user-1", { name: "Produce", categoryId: "cat-1" });

    expect(create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "Produce", categoryId: "cat-1" },
    });
  });
});

describe("archiveSubcategory", () => {
  it("reports not found for a subcategory the user doesn't own", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { subcategory: { updateMany } } as any;

    const result = await archiveSubcategory(prisma, "user-1", "sub-1");

    expect(result).toEqual({ ok: false, error: "Subcategory not found" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/categories.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/categories'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/categories.ts
import type { PrismaClient } from "@prisma/client";

export type CategoryInput = { name: string; type: string; color: string; icon: string };
export type SubcategoryInput = { name: string; categoryId: string };
export type CategoryMutationResult = { ok: true } | { ok: false; error: string };

export async function createCategory(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  input: CategoryInput,
) {
  return prisma.category.create({ data: { userId, ...input } });
}

export async function updateCategory(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  categoryId: string,
  input: Partial<CategoryInput>,
): Promise<CategoryMutationResult> {
  const result = await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Category not found" };
  }
  return { ok: true };
}

export async function archiveCategory(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  categoryId: string,
): Promise<CategoryMutationResult> {
  const result = await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Category not found" };
  }
  return { ok: true };
}

export async function listCategories(
  prisma: Pick<PrismaClient, "category">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.category.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    include: { subcategories: { where: { archivedAt: null } } },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createSubcategory(
  prisma: Pick<PrismaClient, "subcategory">,
  userId: string,
  input: SubcategoryInput,
) {
  return prisma.subcategory.create({ data: { userId, ...input } });
}

export async function archiveSubcategory(
  prisma: Pick<PrismaClient, "subcategory">,
  userId: string,
  subcategoryId: string,
): Promise<CategoryMutationResult> {
  const result = await prisma.subcategory.updateMany({
    where: { id: subcategoryId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Subcategory not found" };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/categories.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add category and subcategory domain functions"
```

---

### Task 4: Transaction domain functions (with tests)

**Files:**
- Create: `src/lib/transactions.ts`
- Test: `src/lib/transactions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/transactions.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  createExpenseLikeTransaction,
  createTransferTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from "@/lib/transactions";

function makeFakePrisma() {
  return {
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-1" }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe("createExpenseLikeTransaction", () => {
  it("signs the amount by type and resolves the budget period", async () => {
    const prisma = makeFakePrisma();

    await createExpenseLikeTransaction(prisma, "user-1", 11, {
      type: "EXPENSE",
      amount: 500, // minor units, positive magnitude from the form
      date: new Date(2026, 8, 15),
      accountId: "acc-1",
      description: "Groceries",
    });

    expect(prisma.budgetPeriod.findUnique).toHaveBeenCalled();
    const args = prisma.transaction.create.mock.calls[0][0].data;
    expect(args.userId).toBe("user-1");
    expect(args.type).toBe("EXPENSE");
    expect(args.amount).toBe(-500);
    expect(args.budgetPeriodId).toBe("period-1");
  });

  it("keeps an explicit manual budgetPeriodId instead of auto-resolving", async () => {
    const prisma = makeFakePrisma();

    await createExpenseLikeTransaction(prisma, "user-1", 11, {
      type: "INCOME",
      amount: 5000,
      date: new Date(2026, 8, 15),
      accountId: "acc-1",
      description: "Salary",
      budgetPeriodId: "period-manual",
    });

    expect(prisma.budgetPeriod.findUnique).not.toHaveBeenCalled();
    const args = prisma.transaction.create.mock.calls[0][0].data;
    expect(args.budgetPeriodId).toBe("period-manual");
    expect(args.amount).toBe(5000);
  });
});

describe("createTransferTransaction", () => {
  it("resolves the budget period and delegates to createTransfer", async () => {
    const prisma = makeFakePrisma();

    const result = await createTransferTransaction(prisma, "user-1", 11, {
      amount: 2000,
      date: new Date(2026, 8, 15),
      sourceAccountId: "acc-1",
      destinationAccountId: "acc-2",
      description: "Move funds",
    });

    expect(result.outgoingTransactionId).toBeDefined();
    expect(prisma.budgetPeriod.findUnique).toHaveBeenCalled();
  });
});

describe("updateTransaction", () => {
  it("only updates description/notes/category/subcategory, scoped to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updateTransaction(prisma, "user-1", "txn-1", {
      description: "Updated",
      notes: "note",
      categoryId: "cat-2",
      subcategoryId: null,
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: "txn-1", userId: "user-1" },
      data: { description: "Updated", notes: "note", categoryId: "cat-2", subcategoryId: null },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.transaction.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateTransaction(prisma, "user-1", "txn-1", { description: "x" });

    expect(result).toEqual({ ok: false, error: "Transaction not found" });
  });
});

describe("deleteTransaction", () => {
  it("deletes a single (non-transfer) row scoped to the user", async () => {
    const prisma = makeFakePrisma();
    prisma.transaction.findFirst.mockResolvedValue({
      id: "txn-1",
      userId: "user-1",
      linkedTransactionId: null,
    });

    const result = await deleteTransaction(prisma, "user-1", "txn-1");

    expect(result).toEqual({ ok: true });
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["txn-1"] }, userId: "user-1" },
    });
  });

  it("deletes both linked rows for a transfer", async () => {
    const prisma = makeFakePrisma();
    prisma.transaction.findFirst.mockResolvedValue({
      id: "txn-1",
      userId: "user-1",
      linkedTransactionId: "txn-2",
    });

    const result = await deleteTransaction(prisma, "user-1", "txn-1");

    expect(result).toEqual({ ok: true });
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

describe("listTransactions", () => {
  it("always scopes to the user and applies given filters", async () => {
    const prisma = makeFakePrisma();

    await listTransactions(prisma, "user-1", {
      accountId: "acc-1",
      categoryId: "cat-1",
      type: "EXPENSE",
      search: "grocer",
      dateFrom: new Date(2026, 8, 1),
      dateTo: new Date(2026, 8, 30),
    });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        accountId: "acc-1",
        categoryId: "cat-1",
        type: "EXPENSE",
        description: { contains: "grocer" },
        date: { gte: new Date(2026, 8, 1), lte: new Date(2026, 8, 30) },
      },
      orderBy: { date: "desc" },
    });
  });

  it("scopes to just the user when no filters are given", async () => {
    const prisma = makeFakePrisma();

    await listTransactions(prisma, "user-1", {});

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { date: "desc" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/transactions.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/transactions'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/transactions.ts
import type { PrismaClient } from "@prisma/client";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { createTransfer, type TransferResult } from "@/lib/transfers";
import { signedAmountForType, type SignableTransactionType } from "@/lib/transaction-rules";

export type TransactionMutationResult = { ok: true } | { ok: false; error: string };

export type ExpenseLikeInput = {
  type: SignableTransactionType;
  amount: number; // minor units, non-negative magnitude
  date: Date;
  accountId: string;
  categoryId?: string;
  subcategoryId?: string;
  description: string;
  notes?: string;
  budgetPeriodId?: string; // manual override — skips auto-resolution
};

async function resolvePeriodId(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  date: Date,
  cycleStartDay: number,
  manualBudgetPeriodId: string | undefined,
): Promise<string> {
  if (manualBudgetPeriodId) {
    return manualBudgetPeriodId;
  }
  const period = await resolveBudgetPeriodForDate(prisma, userId, date, cycleStartDay);
  return period.id;
}

export async function createExpenseLikeTransaction(
  prisma: Pick<PrismaClient, "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  input: ExpenseLikeInput,
) {
  const budgetPeriodId = await resolvePeriodId(
    prisma,
    userId,
    input.date,
    cycleStartDay,
    input.budgetPeriodId,
  );

  return prisma.transaction.create({
    data: {
      userId,
      date: input.date,
      type: input.type,
      amount: signedAmountForType(input.type, input.amount),
      accountId: input.accountId,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      budgetPeriodId,
      description: input.description,
      notes: input.notes,
    },
  });
}

export type TransferInput = {
  amount: number; // minor units, non-negative magnitude
  date: Date;
  sourceAccountId: string;
  destinationAccountId: string;
  description: string;
  budgetPeriodId?: string;
};

export async function createTransferTransaction(
  prisma: Pick<PrismaClient, "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  input: TransferInput,
): Promise<TransferResult> {
  const budgetPeriodId = await resolvePeriodId(
    prisma,
    userId,
    input.date,
    cycleStartDay,
    input.budgetPeriodId,
  );

  return createTransfer(prisma, {
    userId,
    date: input.date,
    amount: input.amount,
    sourceAccountId: input.sourceAccountId,
    destinationAccountId: input.destinationAccountId,
    description: input.description,
    budgetPeriodId,
  });
}

export type TransactionEditableInput = {
  description?: string;
  notes?: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
};

export async function updateTransaction(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  transactionId: string,
  input: TransactionEditableInput,
): Promise<TransactionMutationResult> {
  const result = await prisma.transaction.updateMany({
    where: { id: transactionId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Transaction not found" };
  }
  return { ok: true };
}

export async function deleteTransaction(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  transactionId: string,
): Promise<TransactionMutationResult> {
  const existing = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  });
  if (!existing) {
    return { ok: false, error: "Transaction not found" };
  }

  const idsToDelete = existing.linkedTransactionId
    ? [existing.id, existing.linkedTransactionId]
    : [existing.id];

  await prisma.transaction.deleteMany({
    where: { id: { in: idsToDelete }, userId },
  });

  return { ok: true };
}

export type TransactionFilters = {
  accountId?: string;
  categoryId?: string;
  type?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export async function listTransactions(
  prisma: Pick<PrismaClient, "transaction">,
  userId: string,
  filters: TransactionFilters,
) {
  const where: Record<string, unknown> = { userId };

  if (filters.accountId) where.accountId = filters.accountId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.type) where.type = filters.type;
  if (filters.search) where.description = { contains: filters.search };
  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  return prisma.transaction.findMany({ where, orderBy: { date: "desc" } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/transactions.test.ts
```

Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add transaction domain functions (create/update/delete/list)"
```

---

### Task 5: Add shadcn components and wire up toasts

**Files:**
- Create: `src/components/ui/dialog.tsx`, `select.tsx`, `textarea.tsx`, `alert-dialog.tsx`, `sonner.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add the components**

```bash
npx shadcn@latest add dialog select textarea alert-dialog sonner -y
```

- [ ] **Step 2: Mount the toaster in the root layout**

In `src/app/layout.tsx`, add the import:

```typescript
import { Toaster } from "@/components/ui/sonner";
```

Render it once, inside `<body>`, alongside `SessionProvider`:

```tsx
<body className="min-h-full flex flex-col">
  <SessionProvider>{children}</SessionProvider>
  <Toaster />
</body>
```

- [ ] **Step 3: Verify the project still builds**

```bash
npx tsc --noEmit
```

Expected: no errors. If any generated component's export names differ from
the standard shadcn API assumed in later tasks (check the file shadcn just
created if something doesn't compile there), adjust the JSX in that later
task to match rather than changing the generated component.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add dialog, select, textarea, alert-dialog, and toast components"
```

---

### Task 6: Account server actions

**Files:**
- Create: `src/actions/account.actions.ts`

- [ ] **Step 1: Write the actions**

```typescript
// src/actions/account.actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accountSchema } from "@/lib/validations/account";
import { archiveAccount, createAccount, updateAccount } from "@/lib/accounts";
import { toMinorUnits } from "@/lib/money";

export type AccountActionResult = { ok: true } | { ok: false; error: string };

function parseAccountForm(formData: FormData) {
  return accountSchema.safeParse({
    name: formData.get("name"),
    accountType: formData.get("accountType"),
    openingBalance: Number(formData.get("openingBalance")),
    currency: formData.get("currency"),
    includeInLiquidFunds: formData.get("includeInLiquidFunds") === "true",
    isPrimaryFundingAccount: formData.get("isPrimaryFundingAccount") === "true",
    color: formData.get("color"),
    icon: formData.get("icon"),
  });
}

export async function createAccountAction(formData: FormData): Promise<AccountActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseAccountForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the account details" };

  await createAccount(prisma, session.user.id, {
    ...parsed.data,
    openingBalance: toMinorUnits(parsed.data.openingBalance, parsed.data.currency),
  });

  revalidatePath("/accounts");
  return { ok: true };
}

export async function updateAccountAction(
  accountId: string,
  formData: FormData,
): Promise<AccountActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseAccountForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the account details" };

  const result = await updateAccount(prisma, session.user.id, accountId, {
    ...parsed.data,
    openingBalance: toMinorUnits(parsed.data.openingBalance, parsed.data.currency),
  });

  if (result.ok) revalidatePath("/accounts");
  return result;
}

export async function archiveAccountAction(accountId: string): Promise<AccountActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await archiveAccount(prisma, session.user.id, accountId);
  if (result.ok) revalidatePath("/accounts");
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
git commit -m "feat: add account server actions"
```

---

### Task 7: Accounts page

**Files:**
- Create: `src/app/(app)/accounts/page.tsx`, `src/components/accounts/account-form-dialog.tsx`, `src/components/accounts/account-list.tsx`

- [ ] **Step 1: Write the form dialog (create + edit in one component)**

```tsx
// src/components/accounts/account-form-dialog.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { accountSchema } from "@/lib/validations/account";
import { createAccountAction, updateAccountAction } from "@/actions/account.actions";
import { ACCOUNT_TYPES } from "@/lib/constants/financial";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toMajorUnits } from "@/lib/money";

type AccountFormValues = z.infer<typeof accountSchema>;

type ExistingAccount = {
  id: string;
  name: string;
  accountType: string;
  openingBalance: number;
  currency: string;
  includeInLiquidFunds: boolean;
  isPrimaryFundingAccount: boolean;
  color: string;
  icon: string;
};

export function AccountFormDialog({ existing }: { existing?: ExistingAccount }) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: existing
      ? {
          name: existing.name,
          accountType: existing.accountType as AccountFormValues["accountType"],
          openingBalance: toMajorUnits(existing.openingBalance, existing.currency),
          currency: existing.currency,
          includeInLiquidFunds: existing.includeInLiquidFunds,
          isPrimaryFundingAccount: existing.isPrimaryFundingAccount,
          color: existing.color,
          icon: existing.icon,
        }
      : {
          name: "",
          accountType: "CHECKING",
          openingBalance: 0,
          currency: "PHP",
          includeInLiquidFunds: true,
          isPrimaryFundingAccount: false,
          color: "blue",
          icon: "landmark",
        },
  });

  const accountType = watch("accountType");

  async function onSubmit(values: AccountFormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("accountType", values.accountType);
    formData.set("openingBalance", String(values.openingBalance));
    formData.set("currency", values.currency);
    formData.set("includeInLiquidFunds", String(values.includeInLiquidFunds));
    formData.set("isPrimaryFundingAccount", String(values.isPrimaryFundingAccount));
    formData.set("color", values.color);
    formData.set("icon", values.icon);

    const result = existing
      ? await updateAccountAction(existing.id, formData)
      : await createAccountAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Account updated" : "Account created");
    setOpen(false);
    if (!existing) reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={existing ? "outline" : "default"}>
          {existing ? "Edit" : "Add account"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit account" : "Add account"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountType">Type</Label>
            <Select value={accountType} onValueChange={(v) => setValue("accountType", v as AccountFormValues["accountType"])}>
              <SelectTrigger id="accountType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="openingBalance">Opening balance</Label>
            <Input
              id="openingBalance"
              type="number"
              step="0.01"
              {...register("openingBalance", { valueAsNumber: true })}
            />
            {errors.openingBalance && (
              <p className="text-sm text-destructive">{errors.openingBalance.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("currency")}
            >
              <option value="PHP">PHP</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("includeInLiquidFunds")} />
            Count toward liquid funds
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("isPrimaryFundingAccount")} />
            Primary funding account
          </label>

          <input type="hidden" {...register("color")} />
          <input type="hidden" {...register("icon")} />

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

- [ ] **Step 2: Write the account list (with archive)**

```tsx
// src/components/accounts/account-list.tsx
import { formatMoney } from "@/lib/money";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { archiveAccountAction } from "@/actions/account.actions";
import { Button } from "@/components/ui/button";

type AccountRow = {
  id: string;
  name: string;
  accountType: string;
  openingBalance: number;
  currency: string;
  includeInLiquidFunds: boolean;
  isPrimaryFundingAccount: boolean;
  color: string;
  icon: string;
  balance: number;
};

export function AccountList({ accounts }: { accounts: AccountRow[] }) {
  if (accounts.length === 0) {
    return (
      <p className="text-muted-foreground">
        No accounts yet. Add one to start tracking balances.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {accounts.map((account) => (
        <div
          key={account.id}
          className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium">
              {account.name}
              {account.isPrimaryFundingAccount && (
                <span className="ml-2 text-xs text-muted-foreground">(primary funding)</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {account.accountType} · {formatMoney(account.balance, account.currency)}
            </p>
          </div>
          <div className="flex gap-2">
            <AccountFormDialog existing={account} />
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
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

```tsx
// src/app/(app)/accounts/page.tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { computeAccountBalance } from "@/lib/account-balance";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { AccountList } from "@/components/accounts/account-list";

export default async function AccountsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const accounts = await listAccounts(prisma, userId);
  const withBalances = await Promise.all(
    accounts.map(async (account) => ({
      ...account,
      balance: await computeAccountBalance(prisma, account.id),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <AccountFormDialog />
      </div>
      <AccountList accounts={withBalances} />
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any mismatch between the generated `dialog`/`select`
component APIs and the JSX above before moving on (see Task 5's note).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add accounts page (list, add, edit, archive)"
```

---

### Task 8: Category server actions

**Files:**
- Create: `src/actions/category.actions.ts`

- [ ] **Step 1: Write the actions**

```typescript
// src/actions/category.actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { categorySchema, subcategorySchema } from "@/lib/validations/category";
import {
  archiveCategory,
  archiveSubcategory,
  createCategory,
  createSubcategory,
  updateCategory,
} from "@/lib/categories";

export type CategoryActionResult = { ok: true } | { ok: false; error: string };

export async function createCategoryAction(formData: FormData): Promise<CategoryActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color"),
    icon: formData.get("icon"),
  });
  if (!parsed.success) return { ok: false, error: "Please check the category details" };

  await createCategory(prisma, session.user.id, parsed.data);
  revalidatePath("/categories");
  return { ok: true };
}

export async function updateCategoryAction(
  categoryId: string,
  formData: FormData,
): Promise<CategoryActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color"),
    icon: formData.get("icon"),
  });
  if (!parsed.success) return { ok: false, error: "Please check the category details" };

  const result = await updateCategory(prisma, session.user.id, categoryId, parsed.data);
  if (result.ok) revalidatePath("/categories");
  return result;
}

export async function archiveCategoryAction(categoryId: string): Promise<CategoryActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await archiveCategory(prisma, session.user.id, categoryId);
  if (result.ok) revalidatePath("/categories");
  return result;
}

export async function createSubcategoryAction(formData: FormData): Promise<CategoryActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = subcategorySchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
  });
  if (!parsed.success) return { ok: false, error: "Please check the subcategory details" };

  await createSubcategory(prisma, session.user.id, parsed.data);
  revalidatePath("/categories");
  return { ok: true };
}

export async function archiveSubcategoryAction(
  subcategoryId: string,
): Promise<CategoryActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await archiveSubcategory(prisma, session.user.id, subcategoryId);
  if (result.ok) revalidatePath("/categories");
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
git commit -m "feat: add category and subcategory server actions"
```

---

### Task 9: Categories page

**Files:**
- Create: `src/app/(app)/categories/page.tsx`, `src/components/categories/category-form-dialog.tsx`, `src/components/categories/subcategory-form.tsx`, `src/components/categories/category-list.tsx`

- [ ] **Step 1: Write the category form dialog**

```tsx
// src/components/categories/category-form-dialog.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { categorySchema } from "@/lib/validations/category";
import { createCategoryAction, updateCategoryAction } from "@/actions/category.actions";
import { CATEGORY_TYPES } from "@/lib/constants/financial";
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

type CategoryFormValues = z.infer<typeof categorySchema>;

type ExistingCategory = {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
};

export function CategoryFormDialog({ existing }: { existing?: ExistingCategory }) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: existing
      ? { name: existing.name, type: existing.type as CategoryFormValues["type"], color: existing.color, icon: existing.icon }
      : { name: "", type: "EXPENSE", color: "coral", icon: "tag" },
  });

  async function onSubmit(values: CategoryFormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("type", values.type);
    formData.set("color", values.color);
    formData.set("icon", values.icon);

    const result = existing
      ? await updateCategoryAction(existing.id, formData)
      : await createCategoryAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Category updated" : "Category created");
    setOpen(false);
    if (!existing) reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={existing ? "outline" : "default"}>
          {existing ? "Edit" : "Add category"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit category" : "Add category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("type")}
            >
              {CATEGORY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <input type="hidden" {...register("color")} />
          <input type="hidden" {...register("icon")} />

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

- [ ] **Step 2: Write the subcategory add form (inline, not a dialog)**

```tsx
// src/components/categories/subcategory-form.tsx
"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { createSubcategoryAction } from "@/actions/category.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SubcategoryForm({ categoryId }: { categoryId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  async function action(formData: FormData) {
    const result = await createSubcategoryAction(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    formRef.current?.reset();
  }

  return (
    <form ref={formRef} action={action} className="flex gap-2">
      <input type="hidden" name="categoryId" value={categoryId} />
      <Input name="name" placeholder="Add subcategory" className="h-8 text-sm" />
      <Button type="submit" variant="outline" size="sm">
        Add
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Write the category list**

```tsx
// src/components/categories/category-list.tsx
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { SubcategoryForm } from "@/components/categories/subcategory-form";
import { archiveCategoryAction, archiveSubcategoryAction } from "@/actions/category.actions";
import { Button } from "@/components/ui/button";

type SubcategoryRow = { id: string; name: string };
type CategoryRow = {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
  subcategories: SubcategoryRow[];
};

export function CategoryList({ categories }: { categories: CategoryRow[] }) {
  if (categories.length === 0) {
    return (
      <p className="text-muted-foreground">No categories yet. Add one to start categorizing transactions.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {categories.map((category) => (
        <div key={category.id} className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{category.name}</p>
              <p className="text-sm text-muted-foreground">{category.type}</p>
            </div>
            <div className="flex gap-2">
              <CategoryFormDialog existing={category} />
              <form
                action={async () => {
                  "use server";
                  await archiveCategoryAction(category.id);
                }}
              >
                <Button type="submit" variant="ghost">
                  Archive
                </Button>
              </form>
            </div>
          </div>

          {category.subcategories.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 pl-4 text-sm text-muted-foreground">
              {category.subcategories.map((sub) => (
                <li key={sub.id} className="flex items-center justify-between">
                  {sub.name}
                  <form
                    action={async () => {
                      "use server";
                      await archiveSubcategoryAction(sub.id);
                    }}
                  >
                    <Button type="submit" variant="ghost" size="sm">
                      Archive
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3">
            <SubcategoryForm categoryId={category.id} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

```tsx
// src/app/(app)/categories/page.tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listCategories } from "@/lib/categories";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryList } from "@/components/categories/category-list";

export default async function CategoriesPage() {
  const session = await auth();
  const userId = session!.user.id;

  const categories = await listCategories(prisma, userId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Categories</h1>
        <CategoryFormDialog />
      </div>
      <CategoryList categories={categories} />
    </div>
  );
}
```

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add categories page (list, add/edit categories, manage subcategories)"
```

---

### Task 10: Transaction server actions

**Files:**
- Create: `src/actions/transaction.actions.ts`

- [ ] **Step 1: Write the actions**

```typescript
// src/actions/transaction.actions.ts
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

  await createExpenseLikeTransaction(prisma, user.id, user.cycleStartDay, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, account.currency),
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

  await createTransferTransaction(prisma, user.id, user.cycleStartDay, {
    ...parsed.data,
    amount: toMinorUnits(parsed.data.amount, source.currency),
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

  const result = await updateTransaction(prisma, user.id, transactionId, {
    description: String(formData.get("description") ?? ""),
    notes: (formData.get("notes") as string) || undefined,
    categoryId: (formData.get("categoryId") as string) || null,
    subcategoryId: (formData.get("subcategoryId") as string) || null,
  });

  if (result.ok) revalidatePath("/transactions");
  return result;
}

export async function deleteTransactionAction(
  transactionId: string,
): Promise<TransactionActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "You must be logged in" };

  const result = await deleteTransaction(prisma, user.id, transactionId);
  if (result.ok) revalidatePath("/transactions");
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
git commit -m "feat: add transaction and transfer server actions"
```

---

### Task 11: Transaction form (shared by the page and the global modal)

**Files:**
- Create: `src/components/transactions/transaction-form.tsx`

This form is used both embedded in the Transactions page (Task 12) and
inside the global "Add Transaction" modal (Task 13) — built once, used
twice.

- [ ] **Step 1: Write the form**

```tsx
// src/components/transactions/transaction-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTransactionAction, createTransferAction } from "@/actions/transaction.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const REGULAR_TYPES = [
  "EXPENSE",
  "INCOME",
  "REFUND",
  "SAVINGS",
  "LOAN_PAYMENT",
  "CREDIT_CARD_PAYMENT",
  "TRANSFER_FEE",
] as const;

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function TransactionForm({
  accounts,
  categories,
  onSaved,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [isTransfer, setIsTransfer] = useState(false);
  const [type, setType] = useState<(typeof REGULAR_TYPES)[number]>("EXPENSE");
  const [categoryId, setCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedCategory = categories.find((c) => c.id === categoryId);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    const result = isTransfer
      ? await createTransferAction(formData)
      : await createTransactionAction(formData);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(isTransfer ? "Transfer recorded" : "Transaction added");
    router.refresh();
    onSaved?.();
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setIsTransfer(false)}
          className={`rounded-md border px-3 py-1 ${!isTransfer ? "bg-secondary" : ""}`}
        >
          Transaction
        </button>
        <button
          type="button"
          onClick={() => setIsTransfer(true)}
          className={`rounded-md border px-3 py-1 ${isTransfer ? "bg-secondary" : ""}`}
        >
          Transfer
        </button>
      </div>

      {!isTransfer && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {REGULAR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="amount">Amount</Label>
        <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="date">Date</Label>
        <Input id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
      </div>

      {isTransfer ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sourceAccountId">From account</Label>
            <select
              id="sourceAccountId"
              name="sourceAccountId"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="destinationAccountId">To account</Label>
            <select
              id="destinationAccountId"
              name="destinationAccountId"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Account</Label>
            <select
              id="accountId"
              name="accountId"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              required
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
              name="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {selectedCategory && selectedCategory.subcategories.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subcategoryId">Subcategory</Label>
              <select
                id="subcategoryId"
                name="subcategoryId"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">None</option>
                {selectedCategory.subcategories.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" />
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : isTransfer ? "Record transfer" : "Add transaction"}
      </Button>
    </form>
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
git commit -m "feat: add shared transaction/transfer form"
```

---

### Task 12: Transactions page (list, filters, edit, delete)

**Files:**
- Create: `src/app/(app)/transactions/page.tsx`, `src/components/transactions/transaction-list.tsx`, `src/components/transactions/transaction-filters.tsx`, `src/components/transactions/delete-transaction-button.tsx`

- [ ] **Step 1: Write the delete confirmation button**

```tsx
// src/components/transactions/delete-transaction-button.tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteTransactionAction } from "@/actions/transaction.actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeleteTransactionButton({ transactionId }: { transactionId: string }) {
  const router = useRouter();

  async function handleConfirm() {
    const result = await deleteTransactionAction(transactionId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Transaction deleted");
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
          <AlertDialogDescription>
            This can&apos;t be undone. If this is part of a transfer, both linked
            entries will be deleted together.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Write the filters bar (reads/writes URL search params)**

```tsx
// src/components/transactions/transaction-filters.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

type AccountOption = { id: string; name: string };

export function TransactionFilters({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/transactions?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Input
        placeholder="Search description..."
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => updateParam("search", e.target.value)}
        className="max-w-xs"
      />
      <select
        defaultValue={searchParams.get("accountId") ?? ""}
        onChange={(e) => updateParam("accountId", e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
      >
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: Write the transaction list**

```tsx
// src/components/transactions/transaction-list.tsx
import { formatMoney } from "@/lib/money";
import { DeleteTransactionButton } from "@/components/transactions/delete-transaction-button";

type TransactionRow = {
  id: string;
  date: Date;
  type: string;
  amount: number;
  description: string;
  account: { name: string; currency: string };
  category: { name: string } | null;
};

export function TransactionList({ transactions }: { transactions: TransactionRow[] }) {
  if (transactions.length === 0) {
    return (
      <p className="text-muted-foreground">
        No transactions match these filters yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {transactions.map((txn) => (
        <div
          key={txn.id}
          className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium">{txn.description}</p>
            <p className="text-sm text-muted-foreground">
              {txn.date.toLocaleDateString()} · {txn.account.name}
              {txn.category ? ` · ${txn.category.name}` : ""} · {txn.type}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={txn.amount < 0 ? "text-destructive" : "text-emerald-600"}>
              {formatMoney(txn.amount, txn.account.currency)}
            </span>
            <DeleteTransactionButton transactionId={txn.id} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

```tsx
// src/app/(app)/transactions/page.tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { listTransactions } from "@/lib/transactions";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionList } from "@/components/transactions/transaction-list";
import { TransactionForm } from "@/components/transactions/transaction-form";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; search?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;

  const [accounts, categories] = await Promise.all([
    listAccounts(prisma, userId),
    listCategories(prisma, userId),
  ]);

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      ...(params.accountId ? { accountId: params.accountId } : {}),
      ...(params.search ? { description: { contains: params.search } } : {}),
    },
    orderBy: { date: "desc" },
    include: { account: true, category: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Transactions</h1>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Add transaction</h2>
        <TransactionForm accounts={accounts} categories={categories} />
      </div>

      <TransactionFilters accounts={accounts} />
      <TransactionList transactions={transactions} />
    </div>
  );
}
```

Note: this page calls `prisma.transaction.findMany` directly rather than
through `listTransactions` from Plan 2A, because it needs `include`
(account/category names for display) alongside the filters — `listTransactions`
intentionally stays a plain filter-building function without an `include`
option. If more filters are added later (type, date range), extend this
query using the same `TransactionFilters` shape from `src/lib/transactions.ts`
so the filtering logic isn't duplicated by hand here.

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add transactions page (list, filters, add, delete)"
```

---

### Task 13: Global "Add Transaction" modal in the top nav

**Files:**
- Create: `src/components/transactions/add-transaction-button.tsx`
- Modify: `src/components/nav/top-nav.tsx`, `src/app/(app)/layout.tsx`

- [ ] **Step 1: Write the global button + modal**

```tsx
// src/components/transactions/add-transaction-button.tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TransactionForm } from "@/components/transactions/transaction-form";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function AddTransactionButton({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
        </DialogHeader>
        <TransactionForm accounts={accounts} categories={categories} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Fetch the data the button needs, in the app layout, and pass it down to the nav**

`src/app/(app)/layout.tsx` already loads the session and checks onboarding
(Plan 1/onboarding) — add the accounts/categories fetch there and pass it
to `TopNav`:

```tsx
// src/app/(app)/layout.tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { TopNav } from "@/components/nav/top-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardedAt: true },
    });
    if (!user?.onboardedAt) {
      redirect("/onboarding");
    }
  }

  const [accounts, categories] = session?.user
    ? await Promise.all([
        listAccounts(prisma, session.user.id),
        listCategories(prisma, session.user.id),
      ])
    : [[], []];

  return (
    <div className="min-h-screen bg-background">
      <TopNav accounts={accounts} categories={categories} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Render the button from the top nav**

```tsx
// src/components/nav/top-nav.tsx
import Link from "next/link";
import { Wallet } from "lucide-react";
import { SignOutButton } from "@/components/nav/sign-out-button";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { APP_NAME } from "@/lib/config";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
  { href: "/recurring", label: "Recurring" },
  { href: "/settings", label: "Settings" },
];

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function TopNav({
  accounts,
  categories,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <Wallet className="h-5 w-5" />
          {APP_NAME}
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <AddTransactionButton accounts={accounts} categories={categories} />
          <SignOutButton />
        </div>
      </div>
    </header>
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
git commit -m "feat: add global Add Transaction button to the top nav"
```

---

### Task 14: Route loading states

**Files:**
- Create: `src/app/(app)/accounts/loading.tsx`, `src/app/(app)/categories/loading.tsx`, `src/app/(app)/transactions/loading.tsx`

Next.js's App Router shows a route's `loading.tsx` as a Suspense fallback
while that route's server component fetches its data — this is the
"loading state" for each page, with no client-side state to manage.

- [ ] **Step 1: Write the three loading files**

```tsx
// src/app/(app)/accounts/loading.tsx
export default function Loading() {
  return <p className="text-muted-foreground">Loading accounts...</p>;
}
```

```tsx
// src/app/(app)/categories/loading.tsx
export default function Loading() {
  return <p className="text-muted-foreground">Loading categories...</p>;
}
```

```tsx
// src/app/(app)/transactions/loading.tsx
export default function Loading() {
  return <p className="text-muted-foreground">Loading transactions...</p>;
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
git commit -m "feat: add loading states for accounts, categories, and transactions routes"
```

---

### Task 15: Full verification

- [ ] **Step 1: Run the whole test suite**

```bash
npm test
```

Expected: every test passes, including the new validation/domain-function
tests from Tasks 1-4, on top of everything from Plan 1/onboarding/2A.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Walk through the flow in a browser**

1. Log in as the demo user.
2. **Accounts:** confirm the 3 seeded accounts show with correct computed
   balances; add a new account; edit one; archive one and confirm it
   disappears from the list.
3. **Categories:** confirm the 6 seeded categories show; add a category;
   add a subcategory to it; archive a subcategory; archive a category.
4. **Transactions:** confirm the 8 seeded transactions show, newest first;
   search by a description substring and confirm the list filters; filter
   by account; add a new expense; add a transfer between two accounts and
   confirm two rows appear; delete the transfer and confirm both rows
   disappear together; delete a regular transaction with the confirm
   dialog.
5. **Global Add button:** from the Dashboard (or any page), click the top
   nav's "Add" button, add a transaction, confirm it appears when you
   navigate to Transactions.
6. Revisit Accounts and confirm balances reflect everything added/deleted
   during this walkthrough.

- [ ] **Step 4: Commit any fixes found**

```bash
git add -A
git commit -m "fix: address issues found during Plan 2B verification"
```
