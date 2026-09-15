# Lending Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track money and items Michelle lends to other people — a new `Lending` model, a `/lending` page,
a "Loaned" tab in the main Add dialog, and an outstanding-balance figure for cash lends that's derived from
linked transactions (never manually mutated), exactly like `Loan` already works.

**Architecture:** A new `Lending` model mirrors `Loan`'s shape (own subcategory under a shared "Lending"
category, resolved the same way). Lending cash creates one real outflow transaction (a new `LENDING`
transaction type); a repayment is just a normal `INCOME` transaction categorized to that same subcategory —
`computeLendingOutstanding` sums only the positive (repayment) transactions against `lending.amount`, since
the original outflow already *is* that opening amount. Item lends never touch a transaction at all — a
plain `returned` boolean covers their whole lifecycle.

**Tech Stack:** Next.js App Router, Prisma/Neon Postgres, Vitest, react-hook-form, Zod discriminated unions.

---

### Task 1: Schema — `Lending` model + `LENDING` transaction type

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `Lending` model**

```prisma
model Lending {
  id              String    @id @default(cuid())
  userId          String
  borrowerName    String
  kind            String // "CASH" | "ITEM"
  amount          Int? // minor units — CASH only
  itemDescription String? // ITEM only
  itemValue       Int? // minor units — ITEM only, informational only
  accountId       String? // CASH only — which account the money left
  categoryId      String?
  subcategoryId   String?
  date            DateTime
  returned        Boolean   @default(false) // ITEM only
  archivedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user        User         @relation(fields: [userId], references: [id])
  account     Account?     @relation(fields: [accountId], references: [id])
  category    Category?    @relation(fields: [categoryId], references: [id])
  subcategory Subcategory? @relation(fields: [subcategoryId], references: [id])
}
```

- [ ] **Step 2: Add back-relations**

In `User`, add `lendings Lending[]` alongside `loans Loan[]`. In `Account`, add `lendings Lending[]`
alongside its existing relations. In `Category`, add `lendings Lending[]` alongside `loans Loan[]` (added
earlier today). In `Subcategory`, add `lendings Lending[]` alongside `loans Loan[]`.

- [ ] **Step 3: Regenerate the client and push the schema**

```bash
npx prisma generate
npx prisma db push
```

Expected: both succeed cleanly (this is a purely additive change — a new table, no renames — so no raw-SQL
fallback should be needed; use the raw-SQL adapter pattern from earlier today only if `db push` proposes
anything destructive).

- [ ] **Step 4: Restart the local dev server**

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(lending): add Lending model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `LENDING` as a signable, outflow transaction type

**Files:**
- Modify: `src/lib/transaction-rules.ts`
- Modify: `src/lib/transaction-rules.test.ts`

- [ ] **Step 1: Add a failing test**

In `src/lib/transaction-rules.test.ts`, add (find the existing `signedAmountForType` describe block and add
inside it):

```typescript
  it("returns a negative amount for LENDING (an outflow — money leaving to lend to someone)", () => {
    expect(signedAmountForType("LENDING", 50000)).toBe(-50000);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/transaction-rules.test.ts`
Expected: FAIL — TypeScript/runtime error, `"LENDING"` isn't a recognized `SignableTransactionType`

- [ ] **Step 3: Update `src/lib/transaction-rules.ts`**

Replace:

```typescript
export type SignableTransactionType =
  | "EXPENSE"
  | "INCOME"
  | "REFUND"
  | "SAVINGS"
  | "LOAN_PAYMENT"
  | "CREDIT_CARD_PAYMENT"
  | "TRANSFER_FEE";

const INFLOW_TYPES = new Set<SignableTransactionType>(["INCOME", "REFUND"]);
const OUTFLOW_TYPES = new Set<SignableTransactionType>([
  "EXPENSE",
  "SAVINGS",
  "LOAN_PAYMENT",
  "CREDIT_CARD_PAYMENT",
  "TRANSFER_FEE",
]);
```

with:

```typescript
export type SignableTransactionType =
  | "EXPENSE"
  | "INCOME"
  | "REFUND"
  | "SAVINGS"
  | "LOAN_PAYMENT"
  | "CREDIT_CARD_PAYMENT"
  | "TRANSFER_FEE"
  | "LENDING";

const INFLOW_TYPES = new Set<SignableTransactionType>(["INCOME", "REFUND"]);
const OUTFLOW_TYPES = new Set<SignableTransactionType>([
  "EXPENSE",
  "SAVINGS",
  "LOAN_PAYMENT",
  "CREDIT_CARD_PAYMENT",
  "TRANSFER_FEE",
  "LENDING",
]);
```

- [ ] **Step 4: Add `LENDING` to the canonical `TRANSACTION_TYPES` list**

In `src/lib/constants/financial.ts`, replace:

```typescript
export const TRANSACTION_TYPES = [
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "REFUND",
  "SAVINGS",
  "LOAN_PAYMENT",
  "CREDIT_CARD_PAYMENT",
  "BALANCE_ADJUSTMENT",
  "TRANSFER_FEE",
] as const;
```

with:

```typescript
export const TRANSACTION_TYPES = [
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "REFUND",
  "SAVINGS",
  "LOAN_PAYMENT",
  "CREDIT_CARD_PAYMENT",
  "BALANCE_ADJUSTMENT",
  "TRANSFER_FEE",
  "LENDING",
] as const;
```

`LENDING` is deliberately **not** added to `NON_TRANSFER_TYPES` in `src/lib/validations/transaction.ts` or
the regular Transaction tab's type dropdown — like `BALANCE_ADJUSTMENT`, it's only ever created through its
own dedicated flow (the "Loaned" tab, Task 9), where the borrower context actually exists.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/transaction-rules.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/transaction-rules.ts src/lib/transaction-rules.test.ts src/lib/constants/financial.ts
git commit -m "feat(lending): add LENDING as an outflow transaction type

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `src/lib/lending.ts`

**Files:**
- Create: `src/lib/lending.ts`
- Test: `src/lib/lending.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import {
  archiveLending,
  computeLendingOutstanding,
  createLending,
  listLendings,
  markLendingReturned,
  recordLendingRepayment,
  resolveOrCreateLendingSubcategory,
  updateLending,
} from "@/lib/lending";

function makeFakePrisma() {
  return {
    lending: {
      create: vi.fn().mockResolvedValue({ id: "lending-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue({
        id: "lending-1",
        userId: "user-1",
        borrowerName: "Bob",
        categoryId: "cat-lending",
        subcategoryId: "sub-bob",
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue({ id: "period-1" }),
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn().mockResolvedValue({ id: "txn-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    category: {
      findFirst: vi.fn().mockResolvedValue({ id: "cat-lending", name: "Lending" }),
      create: vi.fn().mockResolvedValue({ id: "cat-lending-new", name: "Lending" }),
    },
    subcategory: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "sub-new" }),
    },
  } as any;
}

describe("createLending", () => {
  it("creates a CASH lending row and its linked outflow transaction", async () => {
    const prisma = makeFakePrisma();

    const result = await createLending(prisma, "user-1", 25, {
      borrowerName: "Bob",
      kind: "CASH",
      amount: 50000,
      accountId: "acc-1",
      date: new Date(2026, 8, 12),
      categoryId: "cat-lending",
      subcategoryId: "sub-bob",
    });

    expect(result.id).toBe("lending-new");
    expect(prisma.lending.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        borrowerName: "Bob",
        kind: "CASH",
        amount: 50000,
        accountId: "acc-1",
        date: new Date(2026, 8, 12),
        categoryId: "cat-lending",
        subcategoryId: "sub-bob",
      },
    });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("LENDING");
    expect(txnArgs.amount).toBe(-50000);
    expect(txnArgs.accountId).toBe("acc-1");
    expect(txnArgs.categoryId).toBe("cat-lending");
    expect(txnArgs.subcategoryId).toBe("sub-bob");
  });

  it("creates an ITEM lending row without any transaction", async () => {
    const prisma = makeFakePrisma();

    await createLending(prisma, "user-1", 25, {
      borrowerName: "Ana",
      kind: "ITEM",
      itemDescription: "Blender",
      date: new Date(2026, 8, 12),
      categoryId: "cat-lending",
      subcategoryId: "sub-ana",
    });

    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});

describe("updateLending", () => {
  it("updates only when the lending row belongs to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updateLending(prisma, "user-1", "lending-1", { borrowerName: "Robert" });

    expect(result).toEqual({ ok: true });
    expect(prisma.lending.updateMany).toHaveBeenCalledWith({
      where: { id: "lending-1", userId: "user-1" },
      data: { borrowerName: "Robert" },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.lending.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateLending(prisma, "user-1", "lending-1", { borrowerName: "Robert" });

    expect(result).toEqual({ ok: false, error: "Lending not found" });
  });
});

describe("archiveLending", () => {
  it("sets archivedAt for a lending row belonging to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await archiveLending(prisma, "user-1", "lending-1");

    expect(result).toEqual({ ok: true });
    const args = prisma.lending.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "lending-1", userId: "user-1" });
    expect(args.data.archivedAt).toBeInstanceOf(Date);
  });
});

describe("listLendings", () => {
  it("scopes to the user and excludes archived rows by default", async () => {
    const prisma = makeFakePrisma();

    await listLendings(prisma, "user-1");

    expect(prisma.lending.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("markLendingReturned", () => {
  it("sets returned: true for a lending row belonging to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await markLendingReturned(prisma, "user-1", "lending-1");

    expect(result).toEqual({ ok: true });
    expect(prisma.lending.updateMany).toHaveBeenCalledWith({
      where: { id: "lending-1", userId: "user-1" },
      data: { returned: true },
    });
  });
});

describe("recordLendingRepayment", () => {
  it("creates an INCOME transaction carrying the lending row's own category/subcategory", async () => {
    const prisma = makeFakePrisma();

    const result = await recordLendingRepayment(prisma, "user-1", 25, "lending-1", {
      accountId: "acc-1",
      amount: 20000,
      date: new Date(2026, 8, 20),
    });

    expect(result).toEqual({ ok: true });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("INCOME");
    expect(txnArgs.amount).toBe(20000);
    expect(txnArgs.categoryId).toBe("cat-lending");
    expect(txnArgs.subcategoryId).toBe("sub-bob");
  });

  it("reports not found for a lending row the user doesn't own", async () => {
    const prisma = makeFakePrisma();
    prisma.lending.findFirst.mockResolvedValue(null);

    const result = await recordLendingRepayment(prisma, "user-1", 25, "lending-1", {
      accountId: "acc-1",
      amount: 20000,
      date: new Date(2026, 8, 20),
    });

    expect(result).toEqual({ ok: false, error: "Lending not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});

describe("computeLendingOutstanding", () => {
  it("returns null for an ITEM lend — nothing to derive", async () => {
    const prisma = { transaction: { findMany: vi.fn() } } as any;

    const outstanding = await computeLendingOutstanding(prisma, {
      kind: "ITEM",
      amount: null,
      subcategoryId: "sub-bob",
    });

    expect(outstanding).toBeNull();
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it("subtracts only the positive (repayment) transactions from the original amount", async () => {
    const prisma = {
      transaction: {
        findMany: vi.fn().mockResolvedValue([
          { amount: -50000 }, // the original lending-out transaction itself — must be excluded
          { amount: 20000 }, // a repayment
        ]),
      },
    } as any;

    const outstanding = await computeLendingOutstanding(prisma, {
      kind: "CASH",
      amount: 50000,
      subcategoryId: "sub-bob",
    });

    expect(outstanding).toBe(30000);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({ where: { subcategoryId: "sub-bob" } });
  });

  it("clamps at zero instead of going negative", async () => {
    const prisma = {
      transaction: { findMany: vi.fn().mockResolvedValue([{ amount: 90000 }]) },
    } as any;

    const outstanding = await computeLendingOutstanding(prisma, {
      kind: "CASH",
      amount: 50000,
      subcategoryId: "sub-bob",
    });

    expect(outstanding).toBe(0);
  });
});

describe("resolveOrCreateLendingSubcategory", () => {
  it("creates the shared 'Lending' category the first time, then a subcategory under it", async () => {
    const prisma = makeFakePrisma();
    prisma.category.findFirst.mockResolvedValue(null);

    const result = await resolveOrCreateLendingSubcategory(prisma, "user-1", "Bob");

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "Lending", type: "INCOME", color: "coral", icon: "tag" },
    });
    expect(prisma.subcategory.create).toHaveBeenCalledWith({
      data: { userId: "user-1", categoryId: "cat-lending-new", name: "Bob" },
    });
    expect(result).toEqual({ categoryId: "cat-lending-new", subcategoryId: "sub-new" });
  });

  it("matches an existing subcategory by name, case-insensitively, instead of creating a duplicate", async () => {
    const prisma = makeFakePrisma();
    prisma.subcategory.findMany.mockResolvedValue([{ id: "sub-existing", name: "bob" }]);

    const result = await resolveOrCreateLendingSubcategory(prisma, "user-1", "Bob");

    expect(prisma.subcategory.create).not.toHaveBeenCalled();
    expect(result).toEqual({ categoryId: "cat-lending", subcategoryId: "sub-existing" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/lending.test.ts`
Expected: FAIL — `Cannot find module '@/lib/lending'`

- [ ] **Step 3: Write the implementation**

```typescript
import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type LendingInput = {
  borrowerName: string;
  kind: "CASH" | "ITEM";
  amount?: number; // minor units — CASH only
  itemDescription?: string; // ITEM only
  itemValue?: number; // minor units — ITEM only
  accountId?: string; // CASH only
  categoryId?: string | null;
  subcategoryId?: string | null;
  date: Date;
};

export type LendingMutationResult = { ok: true } | { ok: false; error: string };

// Creating a CASH lend is itself a real event — money leaves an account
// right now — so this creates the linked outflow transaction in the same
// call, the same way `makeLoanPayment` bundles a transaction with a
// mutation. Unlike a Loan (which just records a pre-existing debt),
// there's no "just tell the app about it" case for cash.
export async function createLending(
  prisma: Pick<PrismaClient, "lending" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  input: LendingInput,
) {
  const lending = await prisma.lending.create({ data: { userId, ...input } });

  if (input.kind === "CASH" && input.accountId && input.amount) {
    await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
      type: "LENDING",
      amount: input.amount,
      date: input.date,
      accountId: input.accountId,
      categoryId: input.categoryId ?? undefined,
      subcategoryId: input.subcategoryId ?? undefined,
      description: `Lent to ${input.borrowerName}`,
    });
  }

  return lending;
}

export async function updateLending(
  prisma: Pick<PrismaClient, "lending">,
  userId: string,
  lendingId: string,
  input: Partial<LendingInput>,
): Promise<LendingMutationResult> {
  const result = await prisma.lending.updateMany({
    where: { id: lendingId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Lending not found" };
  }
  return { ok: true };
}

export async function archiveLending(
  prisma: Pick<PrismaClient, "lending">,
  userId: string,
  lendingId: string,
): Promise<LendingMutationResult> {
  const result = await prisma.lending.updateMany({
    where: { id: lendingId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Lending not found" };
  }
  return { ok: true };
}

export async function listLendings(
  prisma: Pick<PrismaClient, "lending">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.lending.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function markLendingReturned(
  prisma: Pick<PrismaClient, "lending">,
  userId: string,
  lendingId: string,
): Promise<LendingMutationResult> {
  const result = await prisma.lending.updateMany({
    where: { id: lendingId, userId },
    data: { returned: true },
  });
  if (result.count === 0) {
    return { ok: false, error: "Lending not found" };
  }
  return { ok: true };
}

export type LendingRepaymentInput = { accountId: string; amount: number; date: Date };

// However a repayment is entered — this dedicated helper, or a plain
// Income transaction categorized to the same subcategory by hand — it's
// tracked the same way: computeLendingOutstanding just sums whatever
// positive transactions exist for that subcategory. This function is a
// convenience, not the only path, mirroring makeLoanPayment.
export async function recordLendingRepayment(
  prisma: Pick<PrismaClient, "lending" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  lendingId: string,
  input: LendingRepaymentInput,
): Promise<LendingMutationResult> {
  const lending = await prisma.lending.findFirst({ where: { id: lendingId, userId } });
  if (!lending) {
    return { ok: false, error: "Lending not found" };
  }

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "INCOME",
    amount: input.amount,
    date: input.date,
    accountId: input.accountId,
    categoryId: lending.categoryId ?? undefined,
    subcategoryId: lending.subcategoryId ?? undefined,
    description: `Repayment from ${lending.borrowerName}`,
  });

  return { ok: true };
}

// Derived, not stored. Only CASH lends have anything to derive — ITEM
// lends use `returned` instead. The original outflow transaction (created
// by createLending) already IS `lending.amount`, so only the *positive*
// transactions against this subcategory (repayments) are summed here —
// including the outflow itself would double-count it against the amount
// it already represents.
export async function computeLendingOutstanding(
  prisma: Pick<PrismaClient, "transaction">,
  lending: { kind: string; amount: number | null; subcategoryId: string | null },
): Promise<number | null> {
  if (lending.kind !== "CASH" || lending.amount === null) return null;
  if (!lending.subcategoryId) return lending.amount;

  const transactions = await prisma.transaction.findMany({ where: { subcategoryId: lending.subcategoryId } });
  const totalRepaid = transactions
    .filter((txn: { amount: number }) => txn.amount > 0)
    .reduce((sum: number, txn: { amount: number }) => sum + txn.amount, 0);
  return Math.max(0, lending.amount - totalRepaid);
}

export type ResolveOrCreateLendingSubcategoryResult = { categoryId: string; subcategoryId: string };

// The building block for the "Loaned" tab and the Lending page's own
// form: types a borrower's name and resolves it against a shared
// "Lending" category's existing subcategories (case-insensitive exact
// match), creating either the category or the subcategory (or both) the
// first time. Mirrors resolveOrCreateLoanSubcategory exactly.
export async function resolveOrCreateLendingSubcategory(
  prisma: Pick<PrismaClient, "category" | "subcategory">,
  userId: string,
  borrowerName: string,
): Promise<ResolveOrCreateLendingSubcategoryResult> {
  const trimmed = borrowerName.trim();

  let lendingCategory = await prisma.category.findFirst({ where: { userId, name: "Lending" } });
  if (!lendingCategory) {
    lendingCategory = await prisma.category.create({
      data: { userId, name: "Lending", type: "INCOME", color: "coral", icon: "tag" },
    });
  }

  const subcategories = await prisma.subcategory.findMany({ where: { userId, categoryId: lendingCategory.id } });
  const match = subcategories.find(
    (s: { id: string; name: string }) => s.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return { categoryId: lendingCategory.id, subcategoryId: match.id };

  const created = await prisma.subcategory.create({
    data: { userId, categoryId: lendingCategory.id, name: trimmed },
  });
  return { categoryId: lendingCategory.id, subcategoryId: created.id };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/lending.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/lending.ts src/lib/lending.test.ts
git commit -m "feat(lending): add lending.ts (create/update/archive/list, repayment, derived outstanding)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `lendingSchema`

**Files:**
- Create: `src/lib/validations/lending.ts`
- Test: `src/lib/validations/lending.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { lendingSchema } from "@/lib/validations/lending";

describe("lendingSchema", () => {
  it("accepts a valid CASH lend", () => {
    const result = lendingSchema.safeParse({
      kind: "CASH",
      borrowerName: "Bob",
      amount: 500,
      accountId: "acc-1",
      date: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a CASH lend with a zero or negative amount", () => {
    expect(
      lendingSchema.safeParse({
        kind: "CASH",
        borrowerName: "Bob",
        amount: 0,
        accountId: "acc-1",
        date: new Date(),
      }).success,
    ).toBe(false);
  });

  it("rejects a CASH lend missing an account", () => {
    const result = lendingSchema.safeParse({
      kind: "CASH",
      borrowerName: "Bob",
      amount: 500,
      accountId: "",
      date: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid ITEM lend, with an optional itemValue", () => {
    const result = lendingSchema.safeParse({
      kind: "ITEM",
      borrowerName: "Ana",
      itemDescription: "Blender",
      date: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("accepts an ITEM lend with an itemValue provided", () => {
    const result = lendingSchema.safeParse({
      kind: "ITEM",
      borrowerName: "Ana",
      itemDescription: "Blender",
      itemValue: 2000,
      date: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an ITEM lend missing a description", () => {
    const result = lendingSchema.safeParse({
      kind: "ITEM",
      borrowerName: "Ana",
      itemDescription: "",
      date: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a lend with no borrower name", () => {
    const result = lendingSchema.safeParse({
      kind: "CASH",
      borrowerName: "",
      amount: 500,
      accountId: "acc-1",
      date: new Date(),
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/validations/lending.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validations/lending'`

- [ ] **Step 3: Write the implementation**

```typescript
import { z } from "zod";

export const lendingSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("CASH"),
    borrowerName: z.string().min(1, "Borrower name is required"),
    amount: z.number().positive("Amount must be greater than zero"), // major units
    accountId: z.string().min(1, "Account is required"),
    date: z.date(),
  }),
  z.object({
    kind: z.literal("ITEM"),
    borrowerName: z.string().min(1, "Borrower name is required"),
    itemDescription: z.string().min(1, "Item description is required"),
    itemValue: z.number().min(0).optional(), // major units
    date: z.date(),
  }),
]);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/validations/lending.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/lending.ts src/lib/validations/lending.test.ts
git commit -m "feat(lending): add lendingSchema

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `src/actions/lending.actions.ts`

**Files:**
- Create: `src/actions/lending.actions.ts`

No test file — matches this codebase's convention (established throughout today's work) of thin,
untested action wrappers; the logic under test lives in `lending.test.ts`.

- [ ] **Step 1: Write the file**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { lendingSchema } from "@/lib/validations/lending";
import {
  archiveLending,
  createLending,
  markLendingReturned,
  recordLendingRepayment,
  resolveOrCreateLendingSubcategory,
  updateLending,
} from "@/lib/lending";
import { toMinorUnits } from "@/lib/money";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertUnderDemoCap } from "@/lib/demo-guard";

export type LendingActionResult = { ok: true } | { ok: false; error: string };

const LENDING_CURRENCY = "PHP"; // item lends aren't linked to an Account, so there's no per-item currency

function parseLendingForm(formData: FormData) {
  const kind = formData.get("kind");
  if (kind === "ITEM") {
    const rawItemValue = formData.get("itemValue");
    return lendingSchema.safeParse({
      kind: "ITEM",
      borrowerName: formData.get("borrowerName"),
      itemDescription: formData.get("itemDescription"),
      itemValue: rawItemValue ? Number(rawItemValue) : undefined,
      date: new Date(String(formData.get("date"))),
    });
  }
  return lendingSchema.safeParse({
    kind: "CASH",
    borrowerName: formData.get("borrowerName"),
    amount: Number(formData.get("amount")),
    accountId: formData.get("accountId"),
    date: new Date(String(formData.get("date"))),
  });
}

export async function createLendingAction(formData: FormData): Promise<LendingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = parseLendingForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the lending details" };

  const capResult = await assertUnderDemoCap(
    prisma,
    user.id,
    () => prisma.lending.count({ where: { userId: user.id } }),
    100,
  );
  if (capResult) return capResult;

  const { categoryId, subcategoryId } = await resolveOrCreateLendingSubcategory(
    prisma,
    user.id,
    parsed.data.borrowerName,
  );

  if (parsed.data.kind === "CASH") {
    const account = await assertOwnedAccount(prisma, user.id, parsed.data.accountId);
    if (!account) return { ok: false, error: "Account not found" };

    await createLending(prisma, user.id, user.cycleStartDay, {
      borrowerName: parsed.data.borrowerName,
      kind: "CASH",
      amount: toMinorUnits(parsed.data.amount, account.currency),
      accountId: parsed.data.accountId,
      date: parsed.data.date,
      categoryId,
      subcategoryId,
    });
  } else {
    await createLending(prisma, user.id, user.cycleStartDay, {
      borrowerName: parsed.data.borrowerName,
      kind: "ITEM",
      itemDescription: parsed.data.itemDescription,
      itemValue:
        parsed.data.itemValue !== undefined ? toMinorUnits(parsed.data.itemValue, LENDING_CURRENCY) : undefined,
      date: parsed.data.date,
      categoryId,
      subcategoryId,
    });
  }

  revalidatePath("/lending");
  revalidatePath("/transactions");
  revalidatePath("/budget");
  return { ok: true };
}

export async function updateLendingAction(lendingId: string, formData: FormData): Promise<LendingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseLendingForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the lending details" };

  const result =
    parsed.data.kind === "CASH"
      ? await updateLending(prisma, session.user.id, lendingId, {
          borrowerName: parsed.data.borrowerName,
          amount: toMinorUnits(parsed.data.amount, LENDING_CURRENCY),
          accountId: parsed.data.accountId,
          date: parsed.data.date,
        })
      : await updateLending(prisma, session.user.id, lendingId, {
          borrowerName: parsed.data.borrowerName,
          itemDescription: parsed.data.itemDescription,
          itemValue:
            parsed.data.itemValue !== undefined ? toMinorUnits(parsed.data.itemValue, LENDING_CURRENCY) : undefined,
          date: parsed.data.date,
        });

  if (result.ok) {
    revalidatePath("/lending");
  }
  return result;
}

export async function archiveLendingAction(lendingId: string): Promise<LendingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await archiveLending(prisma, session.user.id, lendingId);
  if (result.ok) revalidatePath("/lending");
  return result;
}

export async function markLendingReturnedAction(lendingId: string): Promise<LendingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const result = await markLendingReturned(prisma, session.user.id, lendingId);
  if (result.ok) revalidatePath("/lending");
  return result;
}

export async function recordLendingRepaymentAction(
  lendingId: string,
  formData: FormData,
): Promise<LendingActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const accountId = String(formData.get("accountId"));
  const account = await assertOwnedAccount(prisma, user.id, accountId);
  if (!account) return { ok: false, error: "Account not found" };
  const amount = toMinorUnits(Number(formData.get("amount")), account.currency);
  const date = new Date(String(formData.get("date")));

  const result = await recordLendingRepayment(prisma, user.id, user.cycleStartDay, lendingId, {
    accountId,
    amount,
    date,
  });

  if (result.ok) {
    revalidatePath("/lending");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    revalidatePath("/budget");
  }
  return result;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/actions/lending.actions.ts
git commit -m "feat(lending): add lending.actions.ts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Lending page components

**Files:**
- Create: `src/components/lending/lending-form-dialog.tsx`
- Create: `src/components/lending/record-repayment-dialog.tsx`
- Create: `src/components/lending/mark-returned-button.tsx`
- Create: `src/components/lending/archive-lending-button.tsx`
- Create: `src/components/lending/lending-list.tsx`

- [ ] **Step 1: `lending-form-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createLendingAction, updateLendingAction } from "@/actions/lending.actions";
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

type FormValues = {
  kind: "CASH" | "ITEM";
  borrowerName: string;
  amount: number;
  accountId: string;
  itemDescription: string;
  itemValue: number;
  date: string;
};

type ExistingLending = {
  id: string;
  borrowerName: string;
  kind: string;
  amount: number | null;
  accountId: string | null;
  itemDescription: string | null;
  itemValue: number | null;
  date: Date;
};

export function LendingFormDialog({
  accounts,
  existing,
}: {
  accounts: AccountOption[];
  existing?: ExistingLending;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"CASH" | "ITEM">((existing?.kind as "CASH" | "ITEM") ?? "CASH");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          kind: existing.kind as "CASH" | "ITEM",
          borrowerName: existing.borrowerName,
          amount: existing.amount ? toMajorUnits(existing.amount, "PHP") : 0,
          accountId: existing.accountId ?? accounts[0]?.id ?? "",
          itemDescription: existing.itemDescription ?? "",
          itemValue: existing.itemValue ? toMajorUnits(existing.itemValue, "PHP") : 0,
          date: existing.date.toISOString().slice(0, 10),
        }
      : {
          kind: "CASH",
          borrowerName: "",
          amount: 0,
          accountId: accounts[0]?.id ?? "",
          itemDescription: "",
          itemValue: 0,
          date: new Date().toISOString().slice(0, 10),
        },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("borrowerName", values.borrowerName);
    formData.set("date", values.date);
    if (kind === "CASH") {
      formData.set("amount", String(values.amount));
      formData.set("accountId", values.accountId);
    } else {
      formData.set("itemDescription", values.itemDescription);
      formData.set("itemValue", String(values.itemValue));
    }

    const result = existing
      ? await updateLendingAction(existing.id, formData)
      : await createLendingAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Lending updated" : "Lending added");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} />}>
        {existing ? "Edit" : "Add lending"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit lending" : "Add lending"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {!existing && (
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => setKind("CASH")}
                className={`rounded-md border px-3 py-1 ${kind === "CASH" ? "bg-secondary" : "hover:bg-muted"}`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setKind("ITEM")}
                className={`rounded-md border px-3 py-1 ${kind === "ITEM" ? "bg-secondary" : "hover:bg-muted"}`}
              >
                Item
              </button>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="borrowerName">Borrower</Label>
            <Input id="borrowerName" placeholder="e.g. Bob" {...register("borrowerName")} />
          </div>

          {kind === "CASH" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" type="number" step="0.01" {...register("amount", { valueAsNumber: true })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="accountId">From account</Label>
                <select
                  id="accountId"
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  {...register("accountId")}
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
                <Label htmlFor="itemDescription">Item</Label>
                <Input id="itemDescription" placeholder="e.g. Blender" {...register("itemDescription")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="itemValue">Estimated value (optional)</Label>
                <Input
                  id="itemValue"
                  type="number"
                  step="0.01"
                  {...register("itemValue", { valueAsNumber: true })}
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...register("date")} />
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

- [ ] **Step 2: `record-repayment-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { recordLendingRepaymentAction } from "@/actions/lending.actions";
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

type FormValues = { accountId: string; amount: number; date: string };

export function RecordRepaymentDialog({
  lendingId,
  accounts,
}: {
  lendingId: string;
  accounts: AccountOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { accountId: accounts[0]?.id ?? "", amount: 0, date: new Date().toISOString().slice(0, 10) },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("accountId", values.accountId);
    formData.set("amount", String(values.amount));
    formData.set("date", values.date);

    const result = await recordLendingRepaymentAction(lendingId, formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Repayment recorded");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Record repayment</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a repayment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accountId">Into account</Label>
            <select
              id="accountId"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
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
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" type="number" step="0.01" {...register("amount", { valueAsNumber: true })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...register("date")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: `mark-returned-button.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { markLendingReturnedAction } from "@/actions/lending.actions";
import { Button } from "@/components/ui/button";

export function MarkReturnedButton({ lendingId }: { lendingId: string }) {
  const router = useRouter();

  async function handleClick() {
    const result = await markLendingReturnedAction(lendingId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked as returned");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick}>
      Mark as returned
    </Button>
  );
}
```

- [ ] **Step 4: `archive-lending-button.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { archiveLendingAction } from "@/actions/lending.actions";
import { Button } from "@/components/ui/button";

export function ArchiveLendingButton({ lendingId }: { lendingId: string }) {
  const router = useRouter();

  async function handleClick() {
    const result = await archiveLendingAction(lendingId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Lending archived");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" onClick={handleClick}>
      Archive
    </Button>
  );
}
```

- [ ] **Step 5: `lending-list.tsx`**

```tsx
import { formatMoney } from "@/lib/money";
import { LendingFormDialog } from "@/components/lending/lending-form-dialog";
import { RecordRepaymentDialog } from "@/components/lending/record-repayment-dialog";
import { MarkReturnedButton } from "@/components/lending/mark-returned-button";
import { ArchiveLendingButton } from "@/components/lending/archive-lending-button";
import { Card } from "@/components/ui/card";

const LENDING_CURRENCY = "PHP";

type LendingRow = {
  id: string;
  borrowerName: string;
  kind: string;
  amount: number | null;
  outstanding: number | null;
  itemDescription: string | null;
  itemValue: number | null;
  returned: boolean;
  accountId: string | null;
  date: Date;
};

export function LendingList({
  lendings,
  accounts,
}: {
  lendings: LendingRow[];
  accounts: { id: string; name: string; currency: string }[];
}) {
  if (lendings.length === 0) {
    return <p className="text-muted-foreground">No lending recorded yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {lendings.map((lending) => (
        <Card key={lending.id} className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium">{lending.borrowerName}</p>
            {lending.kind === "CASH" ? (
              <p className="text-sm text-muted-foreground">
                {formatMoney(lending.outstanding ?? 0, LENDING_CURRENCY)} outstanding of{" "}
                {formatMoney(lending.amount ?? 0, LENDING_CURRENCY)} · lent {lending.date.toLocaleDateString()}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {lending.itemDescription}
                {lending.itemValue ? ` (~${formatMoney(lending.itemValue, LENDING_CURRENCY)})` : ""} ·{" "}
                {lending.returned ? "Returned" : "Not returned"} · lent {lending.date.toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {lending.kind === "CASH" && <RecordRepaymentDialog lendingId={lending.id} accounts={accounts} />}
            {lending.kind === "ITEM" && !lending.returned && <MarkReturnedButton lendingId={lending.id} />}
            <LendingFormDialog
              accounts={accounts}
              existing={{
                id: lending.id,
                borrowerName: lending.borrowerName,
                kind: lending.kind,
                amount: lending.amount,
                accountId: lending.accountId,
                itemDescription: lending.itemDescription,
                itemValue: lending.itemValue,
                date: lending.date,
              }}
            />
            <ArchiveLendingButton lendingId={lending.id} />
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in these 5 new files (the page that will pass `outstanding` doesn't exist yet — Task 7)

- [ ] **Step 7: Commit**

```bash
git add src/components/lending
git commit -m "feat(lending): add Lending page components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `/lending` page

**Files:**
- Create: `src/app/(app)/lending/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/lib/accounts";
import { computeLendingOutstanding, listLendings } from "@/lib/lending";
import { LendingFormDialog } from "@/components/lending/lending-form-dialog";
import { LendingList } from "@/components/lending/lending-list";

export default async function LendingPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [accounts, rawLendings] = await Promise.all([listAccounts(prisma, userId), listLendings(prisma, userId)]);

  const lendings = await Promise.all(
    rawLendings.map(async (lending) => ({
      ...lending,
      outstanding: await computeLendingOutstanding(prisma, lending),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Lending</h1>
        <LendingFormDialog accounts={accounts} />
      </div>

      <LendingList lendings={lendings} accounts={accounts} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/lending/page.tsx"
git commit -m "feat(lending): add the /lending page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Nav link

**Files:**
- Modify: `src/components/nav/nav-links.ts`

- [ ] **Step 1: Add the icon import and link**

Replace:

```typescript
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
  Table,
  type LucideIcon,
} from "lucide-react";
```

with:

```typescript
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
  Table,
  HandCoins,
  type LucideIcon,
} from "lucide-react";
```

Then replace:

```typescript
  { href: "/loans-cards", label: "Loans & Cards", icon: CreditCard },
```

with:

```typescript
  { href: "/loans-cards", label: "Loans & Cards", icon: CreditCard },
  { href: "/lending", label: "Lending", icon: HandCoins },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — `HandCoins` is a standard `lucide-react` export.

- [ ] **Step 3: Commit**

```bash
git add src/components/nav/nav-links.ts
git commit -m "feat(lending): add Lending to the sidebar nav

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: "Loaned" tab in the main Add dialog

**Files:**
- Modify: `src/components/transactions/transaction-form.tsx`

- [ ] **Step 1: Accept an `accounts`-only prop shape already present, add the Loaned mode**

Add the import:

```typescript
import { createLendingAction } from "@/actions/lending.actions";
```

Replace:

```typescript
type Mode = "TRANSACTION" | "TRANSFER" | "BORROWED";
```

with:

```typescript
type Mode = "TRANSACTION" | "TRANSFER" | "BORROWED" | "LOANED";
```

- [ ] **Step 2: Add a `LOANED` branch to `handleSubmit`, alongside `BORROWED`'s**

Replace:

```typescript
    if (mode === "BORROWED") {
      const result = await createLoanAction(formData);
      setSubmitting(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Loan added");
      router.refresh();
      onSaved?.();
      return;
    }
```

with:

```typescript
    if (mode === "BORROWED") {
      const result = await createLoanAction(formData);
      setSubmitting(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Loan added");
      router.refresh();
      onSaved?.();
      return;
    }

    if (mode === "LOANED") {
      const result = await createLendingAction(formData);
      setSubmitting(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Lending added");
      router.refresh();
      onSaved?.();
      return;
    }
```

- [ ] **Step 3: Add the tab button**

Replace:

```tsx
        <button
          type="button"
          onClick={() => setMode("BORROWED")}
          className={`rounded-md border px-3 py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:active:scale-100 ${mode === "BORROWED" ? "bg-secondary" : "hover:bg-muted"}`}
        >
          Borrowed
        </button>
      </div>
```

with:

```tsx
        <button
          type="button"
          onClick={() => setMode("BORROWED")}
          className={`rounded-md border px-3 py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:active:scale-100 ${mode === "BORROWED" ? "bg-secondary" : "hover:bg-muted"}`}
        >
          Borrowed
        </button>
        <button
          type="button"
          onClick={() => setMode("LOANED")}
          className={`rounded-md border px-3 py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:active:scale-100 ${mode === "LOANED" ? "bg-secondary" : "hover:bg-muted"}`}
        >
          Loaned
        </button>
      </div>
```

- [ ] **Step 4: Add the Loaned fields, and a local `lendingKind` toggle state**

Right after the `const [type, setType] = ...` line, add:

```typescript
  const [lendingKind, setLendingKind] = useState<"CASH" | "ITEM">("CASH");
```

Then, right after the closing `</>` of the `mode === "BORROWED"` block's JSX (the block that ends just
before `) : (` for the transaction/transfer shared fields), insert a new `mode === "LOANED"` branch. Find:

```tsx
        </>
      ) : (
```

(the one that immediately follows the Borrowed fields, not any other `</>`) and replace it with:

```tsx
        </>
      ) : mode === "LOANED" ? (
        <>
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setLendingKind("CASH")}
              className={`rounded-md border px-3 py-1 ${lendingKind === "CASH" ? "bg-secondary" : "hover:bg-muted"}`}
            >
              Cash
            </button>
            <button
              type="button"
              onClick={() => setLendingKind("ITEM")}
              className={`rounded-md border px-3 py-1 ${lendingKind === "ITEM" ? "bg-secondary" : "hover:bg-muted"}`}
            >
              Item
            </button>
          </div>
          <input type="hidden" name="kind" value={lendingKind} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="borrowerName">Borrower</Label>
            <Input id="borrowerName" name="borrowerName" placeholder="e.g. Bob" required />
          </div>

          {lendingKind === "CASH" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lending-amount">Amount</Label>
                <Input id="lending-amount" name="amount" type="number" step="0.01" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lending-accountId">From account</Label>
                <select
                  id="lending-accountId"
                  name="accountId"
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
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
                <Label htmlFor="itemDescription">Item</Label>
                <Input id="itemDescription" name="itemDescription" placeholder="e.g. Blender" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="itemValue">Estimated value (optional)</Label>
                <Input id="itemValue" name="itemValue" type="number" step="0.01" />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lending-date">Date</Label>
            <Input
              id="lending-date"
              name="date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>
        </>
      ) : (
```

- [ ] **Step 5: Update the submit button label**

Replace:

```tsx
      <Button type="submit" disabled={submitting}>
        {submitting
          ? "Saving..."
          : mode === "TRANSFER"
            ? "Record transfer"
            : mode === "BORROWED"
              ? "Add loan"
              : "Add transaction"}
      </Button>
```

with:

```tsx
      <Button type="submit" disabled={submitting}>
        {submitting
          ? "Saving..."
          : mode === "TRANSFER"
            ? "Record transfer"
            : mode === "BORROWED"
              ? "Add loan"
              : mode === "LOANED"
                ? "Add lending"
                : "Add transaction"}
      </Button>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/transactions/transaction-form.tsx
git commit -m "feat(lending): add a Loaned tab to the main Add dialog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Full verification pass

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (previous total plus this feature's new tests)

- [ ] **Step 3: Lint changed files**

Run:
```bash
npx eslint src/lib/lending.ts src/lib/validations/lending.ts src/lib/transaction-rules.ts src/lib/constants/financial.ts src/actions/lending.actions.ts src/components/lending src/components/nav/nav-links.ts src/components/transactions/transaction-form.tsx "src/app/(app)/lending/page.tsx"
```
Expected: no errors

- [ ] **Step 4: Manually verify against the demo account, then reset it**

Using the Browser pane:
1. From the main Add dialog, switch to the **Loaned** tab, lend ₱500 cash to "Test Borrower" from an
   account — confirm that account's balance drops by ₱500.
2. Go to `/lending`, confirm "Test Borrower" shows ₱500 outstanding of ₱500.
3. Use "Record repayment" for ₱200 — confirm outstanding drops to ₱300 (reload if the figure looks stale,
   same RSC-prefetch quirk seen with loans earlier today).
4. Add an ITEM lend ("Blender," no value) to a different borrower — confirm it shows "Not returned" with no
   dollar figures, and that no account balance changed.
5. Click "Mark as returned" — confirm it flips to "Returned."
6. Reset demo data: `npm run db:seed-demo`
