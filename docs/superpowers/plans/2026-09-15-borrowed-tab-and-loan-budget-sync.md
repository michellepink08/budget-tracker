# "Borrowed" Tab + Loan/Bills Budget Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Loans get a category (a subcategory under a shared "Loan" category), their remaining balance is
derived from linked transactions instead of manually mutated, loans and category-linked bills auto-populate
Budget allocations every cutoff, and creating a loan is reachable as a "Borrowed" tab right in the main Add
dialog.

**Architecture:** `Loan` gains `categoryId`/`subcategoryId` (same pair `BudgetAllocation` already uses).
`computeLoanRemainingBalance` replaces the stored, mutated `remainingBalance` field (renamed
`openingBalance`) with a derived value, mirroring how `computeAccountBalance` already works.
`materializeRecurringAllocations` reuses the existing `createAllocation` (silently skipping conflicts) and
is called from `resolveBudgetPeriodForDate` right after a **new** period is created — the one place this
can run exactly once per cutoff. A new "Borrowed" tab in the existing `TransactionForm` submits through
`createLoanAction`, unchanged.

**Tech Stack:** Next.js App Router, Prisma/Neon Postgres, Vitest, react-hook-form.

---

### Task 1: Schema — `Loan.categoryId`/`subcategoryId`, rename `remainingBalance` → `openingBalance`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Edit the `Loan` model**

```prisma
model Loan {
  id               String    @id @default(cuid())
  userId           String
  name             String
  principal        Int
  interestRate     Float
  monthlyPayment   Int
  openingBalance   Int
  categoryId       String?
  subcategoryId    String?
  startDate        DateTime
  endDate          DateTime?
  dueDay           Int?
  archivedAt       DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  user        User         @relation(fields: [userId], references: [id])
  category    Category?    @relation(fields: [categoryId], references: [id])
  subcategory Subcategory? @relation(fields: [subcategoryId], references: [id])
}
```

- [ ] **Step 2: Add the back-relations on `Category` and `Subcategory`**

In the `Category` model, add `loans Loan[]` alongside its existing relations:

```prisma
model Category {
  id         String    @id @default(cuid())
  userId     String
  name       String
  type       String
  color      String
  icon       String
  sortOrder  Int       @default(0)
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  user                 User                  @relation(fields: [userId], references: [id])
  subcategories        Subcategory[]
  allocations          BudgetAllocation[]
  transactions         Transaction[]
  recurringRules       RecurringRule[]
  payables             Payable[]
  recurringPayables    RecurringPayable[]
  installmentPurchases InstallmentPurchase[]
  shoppingCatalogItems ShoppingCatalogItem[]
  shoppingLists        ShoppingList[]
  shoppingListItems    ShoppingListItem[]
  receiptLines         ReceiptLine[]
  loans                Loan[]
}
```

In the `Subcategory` model, add `loans Loan[]` alongside the `budgetAllocations` relation added earlier
today:

```prisma
model Subcategory {
  id         String    @id @default(cuid())
  userId     String
  categoryId String
  name       String
  sortOrder  Int       @default(0)
  archivedAt DateTime?

  user              User               @relation(fields: [userId], references: [id])
  category           Category           @relation(fields: [categoryId], references: [id])
  transactions       Transaction[]
  recurringRules     RecurringRule[]
  budgetAllocations  BudgetAllocation[]
  loans              Loan[]
}
```

- [ ] **Step 3: Apply via raw SQL (a column rename needs this — `prisma db push` would otherwise propose
  dropping and re-adding the column, losing every existing loan's balance)**

```bash
cat > scripts/_tmp-migrate-loan-columns.mjs << 'EOF'
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
await prisma.$executeRawUnsafe('ALTER TABLE "Loan" RENAME COLUMN "remainingBalance" TO "openingBalance"');
await prisma.$executeRawUnsafe('ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "categoryId" TEXT');
await prisma.$executeRawUnsafe('ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT');
console.log("Loan columns migrated.");
await prisma.$disconnect();
EOF
node scripts/_tmp-migrate-loan-columns.mjs
rm scripts/_tmp-migrate-loan-columns.mjs
npx prisma generate
```

- [ ] **Step 4: Confirm the schema and database now agree**

```bash
npx prisma db push
```

Expected: "Your database is now in sync with your Prisma schema." (no proposed changes — if it proposes
anything, the raw SQL step didn't fully match the schema edit; fix before continuing).

- [ ] **Step 5: Restart the local dev server** (Prisma client is cached in memory)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(loan): add categoryId/subcategoryId, rename remainingBalance to openingBalance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `resolveOrCreateLoanSubcategory` + `computeLoanRemainingBalance` + derived `makeLoanPayment`

**Files:**
- Modify: `src/lib/loans.ts`
- Modify: `src/lib/loans.test.ts`

- [ ] **Step 1: Replace the whole test file**

```typescript
import { describe, expect, it, vi } from "vitest";
import {
  archiveLoan,
  computeLoanRemainingBalance,
  createLoan,
  listLoans,
  makeLoanPayment,
  resolveOrCreateLoanSubcategory,
  updateLoan,
} from "@/lib/loans";

const SAMPLE_LOAN = {
  id: "loan-1",
  userId: "user-1",
  name: "Car loan",
  principal: 50000000,
  interestRate: 5.5,
  monthlyPayment: 1500000,
  openingBalance: 3000000,
  categoryId: "cat-loan",
  subcategoryId: "sub-1",
  startDate: new Date(2025, 0, 1),
  archivedAt: null,
};

function makeFakePrisma(loan: unknown = SAMPLE_LOAN) {
  return {
    loan: {
      create: vi.fn().mockResolvedValue({ id: "loan-new" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn().mockResolvedValue(loan),
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
      findFirst: vi.fn().mockResolvedValue({ id: "cat-loan", name: "Loan" }),
      create: vi.fn().mockResolvedValue({ id: "cat-loan-new", name: "Loan" }),
    },
    subcategory: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "sub-new" }),
    },
  } as any;
}

describe("createLoan", () => {
  it("creates a loan scoped to the given user", async () => {
    const prisma = makeFakePrisma();
    const input = {
      name: "Car loan",
      principal: 50000000,
      interestRate: 5.5,
      monthlyPayment: 1500000,
      openingBalance: 3000000,
      categoryId: "cat-loan",
      subcategoryId: "sub-1",
      startDate: new Date(2025, 0, 1),
    };

    await createLoan(prisma, "user-1", input);

    expect(prisma.loan.create).toHaveBeenCalledWith({ data: { userId: "user-1", ...input } });
  });
});

describe("updateLoan", () => {
  it("updates only when the loan belongs to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await updateLoan(prisma, "user-1", "loan-1", { monthlyPayment: 1600000 });

    expect(result).toEqual({ ok: true });
    expect(prisma.loan.updateMany).toHaveBeenCalledWith({
      where: { id: "loan-1", userId: "user-1" },
      data: { monthlyPayment: 1600000 },
    });
  });

  it("reports not found when no row matched", async () => {
    const prisma = makeFakePrisma();
    prisma.loan.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateLoan(prisma, "user-1", "loan-1", { monthlyPayment: 1600000 });

    expect(result).toEqual({ ok: false, error: "Loan not found" });
  });
});

describe("archiveLoan", () => {
  it("sets archivedAt for a loan belonging to the user", async () => {
    const prisma = makeFakePrisma();

    const result = await archiveLoan(prisma, "user-1", "loan-1");

    expect(result).toEqual({ ok: true });
    const args = prisma.loan.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "loan-1", userId: "user-1" });
    expect(args.data.archivedAt).toBeInstanceOf(Date);
  });
});

describe("listLoans", () => {
  it("scopes to the user, excludes archived loans by default, and includes the subcategory name", async () => {
    const prisma = makeFakePrisma();

    await listLoans(prisma, "user-1");

    expect(prisma.loan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null },
      include: { subcategory: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("includes archived loans when asked", async () => {
    const prisma = makeFakePrisma();

    await listLoans(prisma, "user-1", { includeArchived: true });

    expect(prisma.loan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { subcategory: true },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("makeLoanPayment", () => {
  it("creates a LOAN_PAYMENT transaction carrying the loan's own subcategory, and never mutates a balance", async () => {
    const prisma = makeFakePrisma();

    const result = await makeLoanPayment(prisma, "user-1", 25, "loan-1", {
      accountId: "acc-1",
      amount: 1500000,
      date: new Date(2026, 8, 12),
    });

    expect(result).toEqual({ ok: true });
    const txnArgs = prisma.transaction.create.mock.calls[0][0].data;
    expect(txnArgs.type).toBe("LOAN_PAYMENT");
    expect(txnArgs.amount).toBe(-1500000);
    expect(txnArgs.accountId).toBe("acc-1");
    expect(txnArgs.categoryId).toBe("cat-loan");
    expect(txnArgs.subcategoryId).toBe("sub-1");
    expect(prisma.loan.updateMany).not.toHaveBeenCalled();
  });

  it("reports not found for a loan the user doesn't own", async () => {
    const prisma = makeFakePrisma(null);

    const result = await makeLoanPayment(prisma, "user-1", 25, "loan-1", {
      accountId: "acc-1",
      amount: 1500000,
      date: new Date(2026, 8, 12),
    });

    expect(result).toEqual({ ok: false, error: "Loan not found" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });
});

describe("computeLoanRemainingBalance", () => {
  it("returns the opening balance as-is when the loan has no subcategory linked yet", async () => {
    const prisma = { transaction: { findMany: vi.fn() } } as any;

    const remaining = await computeLoanRemainingBalance(prisma, { openingBalance: 3000000, subcategoryId: null });

    expect(remaining).toBe(3000000);
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it("subtracts every transaction linked to the loan's subcategory from the opening balance", async () => {
    const prisma = {
      transaction: { findMany: vi.fn().mockResolvedValue([{ amount: -500000 }, { amount: -300000 }]) },
    } as any;

    const remaining = await computeLoanRemainingBalance(prisma, { openingBalance: 3000000, subcategoryId: "sub-1" });

    expect(remaining).toBe(2200000);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({ where: { subcategoryId: "sub-1" } });
  });

  it("clamps at zero instead of going negative", async () => {
    const prisma = {
      transaction: { findMany: vi.fn().mockResolvedValue([{ amount: -5000000 }]) },
    } as any;

    const remaining = await computeLoanRemainingBalance(prisma, { openingBalance: 3000000, subcategoryId: "sub-1" });

    expect(remaining).toBe(0);
  });
});

describe("resolveOrCreateLoanSubcategory", () => {
  it("creates the shared 'Loan' category the first time, then a subcategory under it", async () => {
    const prisma = makeFakePrisma();
    prisma.category.findFirst.mockResolvedValue(null);

    const result = await resolveOrCreateLoanSubcategory(prisma, "user-1", "Shopee Pay Later");

    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "Loan", type: "DEBT_PAYMENT", color: "coral", icon: "tag" },
    });
    expect(prisma.subcategory.create).toHaveBeenCalledWith({
      data: { userId: "user-1", categoryId: "cat-loan-new", name: "Shopee Pay Later" },
    });
    expect(result).toEqual({ categoryId: "cat-loan-new", subcategoryId: "sub-new" });
  });

  it("reuses an existing 'Loan' category instead of creating a second one", async () => {
    const prisma = makeFakePrisma();

    await resolveOrCreateLoanSubcategory(prisma, "user-1", "GCredit");

    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("matches an existing subcategory by name, case-insensitively, instead of creating a duplicate", async () => {
    const prisma = makeFakePrisma();
    prisma.subcategory.findMany.mockResolvedValue([{ id: "sub-existing", name: "gcredit" }]);

    const result = await resolveOrCreateLoanSubcategory(prisma, "user-1", "GCredit");

    expect(prisma.subcategory.create).not.toHaveBeenCalled();
    expect(result).toEqual({ categoryId: "cat-loan", subcategoryId: "sub-existing" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/loans.test.ts`
Expected: FAIL — `computeLoanRemainingBalance`/`resolveOrCreateLoanSubcategory` don't exist yet, and
`makeLoanPayment`'s current implementation still mutates `remainingBalance`.

- [ ] **Step 3: Replace `src/lib/loans.ts`**

```typescript
import type { PrismaClient } from "@prisma/client";
import { createExpenseLikeTransaction } from "@/lib/transactions";

export type LoanInput = {
  name: string;
  principal: number; // minor units
  interestRate: number; // annual %, display-only
  monthlyPayment: number; // minor units
  openingBalance: number; // minor units — what was owed when this loan started being tracked here
  categoryId?: string | null;
  subcategoryId?: string | null;
  startDate: Date;
  endDate?: Date | null; // when set, the term (in months) is derived, not stored
  dueDay?: number | null; // day of month (1-31) — projects a monthly calendar entry when set
};

export type LoanMutationResult = { ok: true } | { ok: false; error: string };

export async function createLoan(
  prisma: Pick<PrismaClient, "loan">,
  userId: string,
  input: LoanInput,
) {
  return prisma.loan.create({ data: { userId, ...input } });
}

export async function updateLoan(
  prisma: Pick<PrismaClient, "loan">,
  userId: string,
  loanId: string,
  input: Partial<LoanInput>,
): Promise<LoanMutationResult> {
  const result = await prisma.loan.updateMany({
    where: { id: loanId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Loan not found" };
  }
  return { ok: true };
}

export async function archiveLoan(
  prisma: Pick<PrismaClient, "loan">,
  userId: string,
  loanId: string,
): Promise<LoanMutationResult> {
  const result = await prisma.loan.updateMany({
    where: { id: loanId, userId },
    data: { archivedAt: new Date() },
  });
  if (result.count === 0) {
    return { ok: false, error: "Loan not found" };
  }
  return { ok: true };
}

export async function listLoans(
  prisma: Pick<PrismaClient, "loan">,
  userId: string,
  options: { includeArchived?: boolean } = {},
) {
  return prisma.loan.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    include: { subcategory: true },
    orderBy: { createdAt: "asc" },
  });
}

export type LoanPaymentInput = { accountId: string; amount: number; date: Date };

// Never mutates any stored balance — see computeLoanRemainingBalance below.
// The payment transaction carries the loan's own categoryId/subcategoryId
// so it's counted the next time that balance is derived, and so it also
// shows up correctly categorized on the Budget/Ledger pages.
export async function makeLoanPayment(
  prisma: Pick<PrismaClient, "loan" | "transaction" | "budgetPeriod">,
  userId: string,
  cycleStartDay: number,
  loanId: string,
  input: LoanPaymentInput,
): Promise<LoanMutationResult> {
  const loan = await prisma.loan.findFirst({ where: { id: loanId, userId } });
  if (!loan) {
    return { ok: false, error: "Loan not found" };
  }

  await createExpenseLikeTransaction(prisma, userId, cycleStartDay, {
    type: "LOAN_PAYMENT",
    amount: input.amount,
    date: input.date,
    accountId: input.accountId,
    categoryId: loan.categoryId ?? undefined,
    subcategoryId: loan.subcategoryId ?? undefined,
    description: `Loan payment: ${loan.name}`,
  });

  return { ok: true };
}

// Derived, not stored — mirrors computeAccountBalance. A loan with no
// subcategory linked yet (only possible for loans created before this
// feature shipped) falls back to its opening balance as-is, since there's
// nothing to derive from.
export async function computeLoanRemainingBalance(
  prisma: Pick<PrismaClient, "transaction">,
  loan: { openingBalance: number; subcategoryId: string | null },
): Promise<number> {
  if (!loan.subcategoryId) return loan.openingBalance;

  const transactions = await prisma.transaction.findMany({ where: { subcategoryId: loan.subcategoryId } });
  const totalPaid = transactions.reduce((sum, txn) => sum + txn.amount, 0); // negative for outflow
  return Math.max(0, loan.openingBalance + totalPaid);
}

export type ResolveOrCreateLoanSubcategoryResult = { categoryId: string; subcategoryId: string };

// The building block for the "Borrowed" tab and the Loans page's own
// category field: types a loan's name (e.g. "Shopee Pay Later") and
// resolves it against a shared "Loan" category's existing subcategories
// (case-insensitive exact match), creating either the category or the
// subcategory (or both) the first time. No alias-learning — a loan is
// typed once, unlike Quick Capture's repeated free text.
export async function resolveOrCreateLoanSubcategory(
  prisma: Pick<PrismaClient, "category" | "subcategory">,
  userId: string,
  rawName: string,
): Promise<ResolveOrCreateLoanSubcategoryResult> {
  const trimmed = rawName.trim();

  let loanCategory = await prisma.category.findFirst({ where: { userId, name: "Loan" } });
  if (!loanCategory) {
    loanCategory = await prisma.category.create({
      data: { userId, name: "Loan", type: "DEBT_PAYMENT", color: "coral", icon: "tag" },
    });
  }

  const subcategories = await prisma.subcategory.findMany({ where: { userId, categoryId: loanCategory.id } });
  const match = subcategories.find(
    (s: { id: string; name: string }) => s.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return { categoryId: loanCategory.id, subcategoryId: match.id };

  const created = await prisma.subcategory.create({
    data: { userId, categoryId: loanCategory.id, name: trimmed },
  });
  return { categoryId: loanCategory.id, subcategoryId: created.id };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/loans.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/loans.ts src/lib/loans.test.ts
git commit -m "feat(loan): derive remaining balance from transactions, add resolveOrCreateLoanSubcategory

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `loanSchema` — rename field, add the free-text category field

**Files:**
- Modify: `src/lib/validations/loan.ts`
- Modify: `src/lib/validations/loan.test.ts`

- [ ] **Step 1: Update the test file**

Find-and-replace every `remainingBalance` with `openingBalance` in `src/lib/validations/loan.test.ts` (9
occurrences — every test case's input object). Then add one new test at the end of the `describe` block:

```typescript
  it("accepts an optional loanCategory string", () => {
    const result = loanSchema.safeParse({
      name: "Car loan",
      principal: 500000,
      interestRate: 5.5,
      monthlyPayment: 15000,
      openingBalance: 300000,
      startDate: new Date(),
      loanCategory: "Car Loan",
    });
    expect(result.success).toBe(true);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/validations/loan.test.ts`
Expected: FAIL — `openingBalance` isn't a recognized field on the current schema (still expects
`remainingBalance`)

- [ ] **Step 3: Update `src/lib/validations/loan.ts`**

```typescript
import { z } from "zod";

export const loanSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    principal: z.number().positive("Principal must be greater than zero"), // major units
    interestRate: z.number().min(0, "Interest rate can't be negative"),
    monthlyPayment: z.number().positive("Monthly payment must be greater than zero"), // major units
    openingBalance: z.number().min(0, "Opening balance can't be negative"), // major units
    startDate: z.date(),
    endDate: z.date().optional(),
    dueDay: z.number().int().min(1).max(31).optional(),
    loanCategory: z.string().optional(),
  })
  .refine((data) => !data.endDate || data.endDate > data.startDate, {
    message: "End date must be after the start date",
    path: ["endDate"],
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/validations/loan.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/loan.ts src/lib/validations/loan.test.ts
git commit -m "feat(loan): rename remainingBalance to openingBalance in loanSchema, add loanCategory

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `materializeRecurringAllocations`

**Files:**
- Create: `src/lib/recurring-allocations.ts`
- Test: `src/lib/recurring-allocations.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { materializeRecurringAllocations } from "@/lib/recurring-allocations";

vi.mock("@/lib/budget-allocations", () => ({
  createAllocation: vi.fn().mockResolvedValue({ ok: true, id: "alloc-new" }),
}));

import { createAllocation } from "@/lib/budget-allocations";

function makeFakePrisma(loans: unknown[] = [], recurringPayables: unknown[] = []) {
  return {
    loan: { findMany: vi.fn().mockResolvedValue(loans) },
    recurringPayable: { findMany: vi.fn().mockResolvedValue(recurringPayables) },
  } as any;
}

describe("materializeRecurringAllocations", () => {
  it("only queries active, category-linked loans and recurring payables", async () => {
    const prisma = makeFakePrisma();

    await materializeRecurringAllocations(prisma, "user-1", "period-1");

    expect(prisma.loan.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null, categoryId: { not: null }, subcategoryId: { not: null } },
    });
    expect(prisma.recurringPayable.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", active: true, categoryId: { not: null } },
    });
  });

  it("creates a subcategory-level allocation for every active loan with a category", async () => {
    const prisma = makeFakePrisma([
      { id: "loan-1", categoryId: "cat-loan", subcategoryId: "sub-1", monthlyPayment: 1500000 },
    ]);

    await materializeRecurringAllocations(prisma, "user-1", "period-1");

    expect(createAllocation).toHaveBeenCalledWith(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-loan",
      subcategoryId: "sub-1",
      plannedAmount: 1500000,
      rolloverMode: "NONE",
      showDailyAllowance: false,
    });
  });

  it("creates a whole-category allocation for every active category-linked recurring payable", async () => {
    const prisma = makeFakePrisma([], [{ id: "rp-1", categoryId: "cat-rent", amount: 1500000 }]);

    await materializeRecurringAllocations(prisma, "user-1", "period-1");

    expect(createAllocation).toHaveBeenCalledWith(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-rent",
      subcategoryId: null,
      plannedAmount: 1500000,
      rolloverMode: "NONE",
      showDailyAllowance: false,
    });
  });

  it("continues past a conflicting allocation instead of throwing", async () => {
    (createAllocation as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, error: "conflict" });
    const prisma = makeFakePrisma(
      [{ id: "loan-1", categoryId: "cat-loan", subcategoryId: "sub-1", monthlyPayment: 1500000 }],
      [{ id: "rp-1", categoryId: "cat-rent", amount: 1500000 }],
    );

    await expect(materializeRecurringAllocations(prisma, "user-1", "period-1")).resolves.not.toThrow();
    expect(createAllocation).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/recurring-allocations.test.ts`
Expected: FAIL — `Cannot find module '@/lib/recurring-allocations'`

- [ ] **Step 3: Write the implementation**

```typescript
import type { PrismaClient } from "@prisma/client";
import { createAllocation } from "@/lib/budget-allocations";

// Called once, right when a brand-new BudgetPeriod is created (see
// resolveBudgetPeriodForDate) — creates a BudgetAllocation for every
// active loan and every active, category-linked recurring bill, so the
// Budget page always shows the full picture of what's owed each cutoff
// without needing to add these by hand. Conflicts (the either/or rule
// already enforced by createAllocation) are expected and simply skipped —
// nothing here is user-initiated, so nothing here should ever surface an
// error.
export async function materializeRecurringAllocations(
  prisma: Pick<
    PrismaClient,
    "loan" | "recurringPayable" | "budgetAllocation" | "budgetPeriod" | "category" | "subcategory" | "transaction"
  >,
  userId: string,
  budgetPeriodId: string,
): Promise<void> {
  const [loans, recurringPayables] = await Promise.all([
    prisma.loan.findMany({
      where: { userId, archivedAt: null, categoryId: { not: null }, subcategoryId: { not: null } },
    }),
    prisma.recurringPayable.findMany({ where: { userId, active: true, categoryId: { not: null } } }),
  ]);

  for (const loan of loans as { categoryId: string; subcategoryId: string; monthlyPayment: number }[]) {
    await createAllocation(prisma, userId, {
      budgetPeriodId,
      categoryId: loan.categoryId,
      subcategoryId: loan.subcategoryId,
      plannedAmount: loan.monthlyPayment,
      rolloverMode: "NONE",
      showDailyAllowance: false,
    });
  }

  for (const payable of recurringPayables as { categoryId: string; amount: number }[]) {
    await createAllocation(prisma, userId, {
      budgetPeriodId,
      categoryId: payable.categoryId,
      subcategoryId: null,
      plannedAmount: payable.amount,
      rolloverMode: "NONE",
      showDailyAllowance: false,
    });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/recurring-allocations.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurring-allocations.ts src/lib/recurring-allocations.test.ts
git commit -m "feat(budget): add materializeRecurringAllocations for loans/bills

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire `materializeRecurringAllocations` into `resolveBudgetPeriodForDate`

**Files:**
- Modify: `src/lib/budget-period.ts`
- Modify: `src/lib/budget-period.test.ts`

- [ ] **Step 1: Update the test file**

```typescript
import { describe, expect, it, vi } from "vitest";
import { assertOwnedBudgetPeriod, resolveBudgetPeriodForDate } from "@/lib/budget-period";

vi.mock("@/lib/recurring-allocations", () => ({
  materializeRecurringAllocations: vi.fn().mockResolvedValue(undefined),
}));

import { materializeRecurringAllocations } from "@/lib/recurring-allocations";

function makeFakePrisma(existing: unknown = null) {
  return {
    budgetPeriod: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: "period-new" }),
    },
  } as any;
}

describe("resolveBudgetPeriodForDate", () => {
  it("returns the existing period for that cycle if one already exists", async () => {
    const existing = { id: "period-1" };
    const prisma = makeFakePrisma(existing);

    const result = await resolveBudgetPeriodForDate(prisma, "user-1", new Date(2026, 8, 15), 11);

    expect(result).toBe(existing);
    expect(prisma.budgetPeriod.create).not.toHaveBeenCalled();
    expect(materializeRecurringAllocations).not.toHaveBeenCalled();
  });

  it("creates a new period matching the cycle when none exists, and materializes recurring allocations for it", async () => {
    const prisma = makeFakePrisma(null);

    const result = await resolveBudgetPeriodForDate(prisma, "user-1", new Date(2026, 8, 15), 11);

    expect(result).toEqual({ id: "period-new" });
    expect(prisma.budgetPeriod.create).toHaveBeenCalledTimes(1);
    const args = prisma.budgetPeriod.create.mock.calls[0][0];
    expect(args.data.userId).toBe("user-1");
    expect(args.data.startDate).toEqual(new Date(2026, 8, 11));
    expect(args.data.endDate).toEqual(new Date(2026, 9, 10));
    expect(args.data.status).toBe("ACTIVE");
    expect(materializeRecurringAllocations).toHaveBeenCalledWith(prisma, "user-1", "period-new");
  });
});

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

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/budget-period.test.ts`
Expected: FAIL — `materializeRecurringAllocations` is never called by the current implementation

- [ ] **Step 3: Update `src/lib/budget-period.ts`**

```typescript
import type { PrismaClient } from "@prisma/client";
import { formatCycleRange, getCycleForDate } from "@/lib/cycle";
import { materializeRecurringAllocations } from "@/lib/recurring-allocations";

// Finds the BudgetPeriod for the cycle containing `date`, creating one if
// it doesn't exist yet. Manual override (letting a user reassign a
// transaction to a different period than its date would auto-suggest) is
// not this function's concern — callers can pass an explicit
// budgetPeriodId directly instead of calling this resolver.
export async function resolveBudgetPeriodForDate(
  prisma: Pick<
    PrismaClient,
    "budgetPeriod" | "loan" | "recurringPayable" | "budgetAllocation" | "category" | "subcategory" | "transaction"
  >,
  userId: string,
  date: Date,
  cycleStartDay: number,
) {
  const { start, end } = getCycleForDate(cycleStartDay, date);

  const existing = await prisma.budgetPeriod.findUnique({
    where: { userId_startDate: { userId, startDate: start } },
  });
  if (existing) {
    return existing;
  }

  const period = await prisma.budgetPeriod.create({
    data: {
      userId,
      name: formatCycleRange({ start, end }),
      startDate: start,
      endDate: end,
      status: "ACTIVE",
    },
  });

  await materializeRecurringAllocations(prisma, userId, period.id);

  return period;
}

export async function assertOwnedBudgetPeriod(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  budgetPeriodId: string,
): Promise<boolean> {
  const period = await prisma.budgetPeriod.findFirst({ where: { id: budgetPeriodId, userId } });
  return period !== null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/budget-period.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Type-check and run the full suite**

Run:
```bash
npx tsc --noEmit
npx vitest run
```

Expected: `tsc` clean. If any *other* test now fails because it exercises `resolveBudgetPeriodForDate`'s
new-period branch without mocking `loan`/`recurringPayable`/etc. on its fake prisma object, add the missing
mocks to that fake prisma object the same way Task 2's `makeFakePrisma` does (empty-array `findMany` mocks
are enough — the point is just not to throw, not to exercise real logic in that unrelated test).

- [ ] **Step 6: Commit**

```bash
git add src/lib/budget-period.ts src/lib/budget-period.test.ts
git commit -m "feat(budget): materialize recurring allocations when a new cutoff starts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(If Step 5 required fixes to other test files, include those in this same commit.)

---

### Task 6: `loan.actions.ts` — wire `resolveOrCreateLoanSubcategory`, rename field

**Files:**
- Modify: `src/actions/loan.actions.ts`

- [ ] **Step 1: Replace the whole file**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loanSchema } from "@/lib/validations/loan";
import { archiveLoan, createLoan, makeLoanPayment, resolveOrCreateLoanSubcategory, updateLoan } from "@/lib/loans";
import { toMinorUnits } from "@/lib/money";
import { assertOwnedAccount } from "@/lib/accounts";
import { assertNotDemo, assertUnderDemoCap } from "@/lib/demo-guard";

export type LoanActionResult = { ok: true } | { ok: false; error: string };

const LOAN_CURRENCY = "PHP"; // loans aren't linked to an Account, so there's no per-loan currency yet

function parseLoanForm(formData: FormData) {
  const rawEndDate = formData.get("endDate");
  const rawDueDay = formData.get("dueDay");
  return loanSchema.safeParse({
    name: formData.get("name"),
    principal: Number(formData.get("principal")),
    interestRate: Number(formData.get("interestRate")),
    monthlyPayment: Number(formData.get("monthlyPayment")),
    openingBalance: Number(formData.get("openingBalance")),
    startDate: new Date(String(formData.get("startDate"))),
    endDate: rawEndDate ? new Date(String(rawEndDate)) : undefined,
    dueDay: rawDueDay ? Number(rawDueDay) : undefined,
    loanCategory: formData.get("loanCategory") || undefined,
  });
}

export async function createLoanAction(formData: FormData): Promise<LoanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseLoanForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the loan details" };

  const capResult = await assertUnderDemoCap(
    prisma,
    session.user.id,
    () => prisma.loan.count({ where: { userId: session.user.id } }),
    100,
  );
  if (capResult) return capResult;

  let categoryId: string | undefined;
  let subcategoryId: string | undefined;
  if (parsed.data.loanCategory?.trim()) {
    const resolved = await resolveOrCreateLoanSubcategory(prisma, session.user.id, parsed.data.loanCategory);
    categoryId = resolved.categoryId;
    subcategoryId = resolved.subcategoryId;
  }

  await createLoan(prisma, session.user.id, {
    name: parsed.data.name,
    principal: toMinorUnits(parsed.data.principal, LOAN_CURRENCY),
    interestRate: parsed.data.interestRate,
    monthlyPayment: toMinorUnits(parsed.data.monthlyPayment, LOAN_CURRENCY),
    openingBalance: toMinorUnits(parsed.data.openingBalance, LOAN_CURRENCY),
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    dueDay: parsed.data.dueDay,
    categoryId,
    subcategoryId,
  });

  revalidatePath("/loans-cards");
  revalidatePath("/transactions");
  revalidatePath("/budget");
  return { ok: true };
}

export async function updateLoanAction(loanId: string, formData: FormData): Promise<LoanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = parseLoanForm(formData);
  if (!parsed.success) return { ok: false, error: "Please check the loan details" };

  let categoryId: string | undefined;
  let subcategoryId: string | undefined;
  if (parsed.data.loanCategory?.trim()) {
    const resolved = await resolveOrCreateLoanSubcategory(prisma, session.user.id, parsed.data.loanCategory);
    categoryId = resolved.categoryId;
    subcategoryId = resolved.subcategoryId;
  }

  const result = await updateLoan(prisma, session.user.id, loanId, {
    name: parsed.data.name,
    principal: toMinorUnits(parsed.data.principal, LOAN_CURRENCY),
    interestRate: parsed.data.interestRate,
    monthlyPayment: toMinorUnits(parsed.data.monthlyPayment, LOAN_CURRENCY),
    openingBalance: toMinorUnits(parsed.data.openingBalance, LOAN_CURRENCY),
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    dueDay: parsed.data.dueDay,
    ...(categoryId ? { categoryId, subcategoryId } : {}),
  });

  if (result.ok) {
    revalidatePath("/loans-cards");
    revalidatePath("/budget");
  }
  return result;
}

export async function archiveLoanAction(loanId: string): Promise<LoanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const demoResult = await assertNotDemo(prisma, session.user.id);
  if (demoResult) return demoResult;

  const result = await archiveLoan(prisma, session.user.id, loanId);
  if (result.ok) revalidatePath("/loans-cards");
  return result;
}

export async function makeLoanPaymentAction(
  loanId: string,
  formData: FormData,
): Promise<LoanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const accountId = String(formData.get("accountId"));
  const account = await assertOwnedAccount(prisma, user.id, accountId);
  if (!account) return { ok: false, error: "Account not found" };
  const amount = toMinorUnits(Number(formData.get("amount")), account.currency);
  const date = new Date(String(formData.get("date")));

  const result = await makeLoanPayment(prisma, user.id, user.cycleStartDay, loanId, {
    accountId,
    amount,
    date,
  });

  if (result.ok) {
    revalidatePath("/loans-cards");
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
git add src/actions/loan.actions.ts
git commit -m "feat(loan): resolve the loan category on create/update

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `LoanFormDialog` — rename field, add the always-visible category input

**Files:**
- Modify: `src/components/loans-cards/loan-form-dialog.tsx`

- [ ] **Step 1: Update the types and defaults**

Replace every `remainingBalance` in this file with `openingBalance` (in `FormValues`, `ExistingLoan`, both
`defaultValues` branches, and the `formData.set` call), and add `loanCategory` to both:

```typescript
type FormValues = {
  name: string;
  principal: number;
  interestRate: number;
  monthlyPayment: number;
  openingBalance: number;
  startDate: string;
  endDate: string;
  dueDay: string;
  loanCategory: string;
};

type ExistingLoan = {
  id: string;
  name: string;
  principal: number;
  interestRate: number;
  monthlyPayment: number;
  openingBalance: number;
  startDate: Date;
  endDate: Date | null;
  dueDay: number | null;
  loanCategoryName: string | null;
};
```

In the `useForm` call, add `loanCategory: existing?.loanCategoryName ?? ""` to both branches of
`defaultValues` (alongside the renamed `openingBalance` field).

- [ ] **Step 2: Send the field in `onSubmit`**

Add, alongside the other `formData.set(...)` calls:

```typescript
    formData.set("loanCategory", values.loanCategory);
```

- [ ] **Step 3: Rename the "Remaining balance" field's `id`/`htmlFor`/`register` and add the category input**

Replace:

```tsx
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="remainingBalance">Remaining balance</Label>
            <Input
              id="remainingBalance"
              type="number"
              step="0.01"
              {...register("remainingBalance", { valueAsNumber: true })}
            />
          </div>
```

with:

```tsx
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="openingBalance">
              {existing ? "Current remaining balance" : "Remaining balance"}
            </Label>
            <Input
              id="openingBalance"
              type="number"
              step="0.01"
              {...register("openingBalance", { valueAsNumber: true })}
            />
            {existing && (
              <p className="text-xs text-muted-foreground">
                Only used as a starting point — once this loan has a category, its balance updates itself
                from payments categorized to it, same as an account.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loanCategory">Category</Label>
            <Input
              id="loanCategory"
              placeholder="e.g. Shopee Pay Later"
              {...register("loanCategory")}
            />
            <p className="text-xs text-muted-foreground">
              Matches or creates a subcategory under a shared &quot;Loan&quot; category — this is what lets
              a payment automatically update this loan&apos;s balance and show up on the Budget page.
            </p>
          </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain in `loan-list.tsx`, `loans-cards/page.tsx`, `loan-summary-table.tsx`, `ledger/page.tsx`
(fixed in the next two tasks) — none in this file itself.

- [ ] **Step 5: Commit**

```bash
git add src/components/loans-cards/loan-form-dialog.tsx
git commit -m "feat(loan): rename remaining-balance field, add the category input

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Switch every loan-balance display to `computeLoanRemainingBalance`

**Files:**
- Modify: `src/components/loans-cards/loan-list.tsx`
- Modify: `src/app/(app)/loans-cards/page.tsx`
- Modify: `src/components/ledger/loan-summary-table.tsx`
- Modify: `src/app/(app)/ledger/page.tsx`

- [ ] **Step 1: `loan-list.tsx` — add `loanCategoryName`, needed by `LoanFormDialog`'s edit mode (Task 7)**

Add `loanCategoryName: string | null;` to the `LoanRow` type:

```typescript
type LoanRow = {
  id: string;
  name: string;
  principal: number;
  interestRate: number;
  monthlyPayment: number;
  remainingBalance: number;
  loanCategoryName: string | null;
  startDate: Date;
  endDate: Date | null;
  dueDay: number | null;
};
```

Then pass it through to `LoanFormDialog`'s `existing` prop — replace:

```tsx
            <LoanFormDialog existing={loan} />
```

with:

```tsx
            <LoanFormDialog
              existing={{
                id: loan.id,
                name: loan.name,
                principal: loan.principal,
                interestRate: loan.interestRate,
                monthlyPayment: loan.monthlyPayment,
                openingBalance: loan.remainingBalance,
                startDate: loan.startDate,
                endDate: loan.endDate,
                dueDay: loan.dueDay,
                loanCategoryName: loan.loanCategoryName,
              }}
            />
```

(`ExistingLoan` in `loan-form-dialog.tsx`, from Task 7, expects `openingBalance` — `loan.remainingBalance`
here is the already-*derived* current balance, which is exactly the right starting point to show/edit:
editing a loan no longer resets its history, it just moves the baseline the derivation starts from.)

- [ ] **Step 2: `loans-cards/page.tsx` — compute the balance and category name before passing loans down**

Add the import:

```typescript
import { computeLoanRemainingBalance } from "@/lib/loans";
```

Replace:

```typescript
  const [accounts, categories, loans, creditCards, installmentPurchases, dueInstallmentPayments] =
    await Promise.all([
      listAccounts(prisma, userId),
      listCategories(prisma, userId),
      listLoans(prisma, userId),
      listCreditCards(prisma, userId),
      listInstallmentPurchases(prisma, userId),
      listDueInstallmentPayments(prisma, userId, now),
    ]);
```

with:

```typescript
  const [accounts, categories, rawLoans, creditCards, installmentPurchases, dueInstallmentPayments] =
    await Promise.all([
      listAccounts(prisma, userId),
      listCategories(prisma, userId),
      listLoans(prisma, userId),
      listCreditCards(prisma, userId),
      listInstallmentPurchases(prisma, userId),
      listDueInstallmentPayments(prisma, userId, now),
    ]);

  const loans = await Promise.all(
    rawLoans.map(async (loan) => ({
      ...loan,
      remainingBalance: await computeLoanRemainingBalance(prisma, loan),
      loanCategoryName: loan.subcategory?.name ?? null,
    })),
  );
```

`listLoans` (Task 2) now `include`s `subcategory`, so each `loan` already carries `loan.subcategory?.name`
— no extra query needed here.

- [ ] **Step 3: `loan-summary-table.tsx` — same non-change (display-only, unaffected)**

No change needed — like `loan-list.tsx`, it only displays whatever `remainingBalance` it's given.

- [ ] **Step 4: `ledger/page.tsx` — compute the balance before passing loans down**

Find where `loans` is fetched for the `LOANS` tab:

```typescript
  const isLoansTab = activeTab === "LOANS";
  const loans = isLoansTab ? await listLoans(prisma, user.id) : [];
```

Replace with:

```typescript
  const isLoansTab = activeTab === "LOANS";
  const rawLoans = isLoansTab ? await listLoans(prisma, user.id) : [];
  const loans = await Promise.all(
    rawLoans.map(async (loan) => ({
      ...loan,
      remainingBalance: await computeLoanRemainingBalance(prisma, loan),
    })),
  );
```

Add the import:

```typescript
import { computeLoanRemainingBalance, listLoans } from "@/lib/loans";
```

(replaces the existing `import { listLoans } from "@/lib/loans";` line)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors anywhere

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/loans-cards/page.tsx" "src/app/(app)/ledger/page.tsx"
git commit -m "feat(loan): compute remaining balance for display instead of reading a stored field

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: "Borrowed" tab in the main Add dialog

**Files:**
- Modify: `src/components/transactions/transaction-form.tsx`
- Modify: `src/components/transactions/add-transaction-button.tsx`

- [ ] **Step 1: Add the loan-creation mode to `TransactionForm`**

Replace the whole file:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTransactionAction, createTransferAction } from "@/actions/transaction.actions";
import { createLoanAction } from "@/actions/loan.actions";
import { humanizeEnum } from "@/lib/enum-labels";
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

type Mode = "TRANSACTION" | "TRANSFER" | "BORROWED";

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
  const [mode, setMode] = useState<Mode>("TRANSACTION");
  const [type, setType] = useState<(typeof REGULAR_TYPES)[number]>("EXPENSE");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    const result =
      mode === "TRANSFER"
        ? await createTransferAction(formData)
        : mode === "BORROWED"
          ? await createLoanAction(formData)
          : await createTransactionAction(formData);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(mode === "TRANSFER" ? "Transfer recorded" : mode === "BORROWED" ? "Loan added" : "Transaction added");
    // `result` here is a union of LoanActionResult | TransactionActionResult
    // — LoanActionResult's ok branch has no `warning` field at all, so
    // `"warning" in result` (not just checking `mode`) is what actually
    // narrows the type enough for TypeScript to allow reading it.
    if (mode === "TRANSACTION" && "warning" in result && result.warning) toast.warning(result.warning);
    router.refresh();
    onSaved?.();
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("TRANSACTION")}
          className={`rounded-md border px-3 py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:active:scale-100 ${mode === "TRANSACTION" ? "bg-secondary" : "hover:bg-muted"}`}
        >
          Transaction
        </button>
        <button
          type="button"
          onClick={() => setMode("TRANSFER")}
          className={`rounded-md border px-3 py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:active:scale-100 ${mode === "TRANSFER" ? "bg-secondary" : "hover:bg-muted"}`}
        >
          Transfer
        </button>
        <button
          type="button"
          onClick={() => setMode("BORROWED")}
          className={`rounded-md border px-3 py-1 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 motion-reduce:active:scale-100 ${mode === "BORROWED" ? "bg-secondary" : "hover:bg-muted"}`}
        >
          Borrowed
        </button>
      </div>

      {mode === "TRANSACTION" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
          >
            {REGULAR_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanizeEnum(t)}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "BORROWED" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="principal">Original principal</Label>
            <Input id="principal" name="principal" type="number" step="0.01" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="openingBalance">Remaining balance</Label>
            <Input id="openingBalance" name="openingBalance" type="number" step="0.01" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monthlyPayment">Monthly payment</Label>
            <Input id="monthlyPayment" name="monthlyPayment" type="number" step="0.01" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interestRate">Interest rate (% / year)</Label>
            <Input id="interestRate" name="interestRate" type="number" step="0.01" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loanCategory">Category</Label>
            <Input id="loanCategory" name="loanCategory" placeholder="e.g. Shopee Pay Later" />
            <p className="text-xs text-muted-foreground">
              Matches or creates a subcategory under a shared &quot;Loan&quot; category.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          </div>

          {mode === "TRANSFER" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sourceAccountId">From account</Label>
                <select
                  id="sourceAccountId"
                  name="sourceAccountId"
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="destinationAccountId">To account</Label>
                <select
                  id="destinationAccountId"
                  name="destinationAccountId"
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
                <Label htmlFor="accountId">Account</Label>
                <select
                  id="accountId"
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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoryName">Category (optional)</Label>
                <Input
                  id="categoryName"
                  name="categoryName"
                  list="category-suggestions"
                  placeholder="Type any word — new ones are created automatically"
                  autoComplete="off"
                />
                <datalist id="category-suggestions">
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  Matches an existing category by name, or creates a new one — typing the same word again always
                  lands on the same category.
                </p>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              name="description"
              placeholder={mode === "TRANSFER" ? "Leave blank to use \"Transfer\"" : "Leave blank to use the transaction type"}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" />
          </div>
        </>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting
          ? "Saving..."
          : mode === "TRANSFER"
            ? "Record transfer"
            : mode === "BORROWED"
              ? "Add loan"
              : "Add transaction"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — `AddTransactionButton` passes the same `accounts`/`categories` props it already did,
unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/transactions/transaction-form.tsx
git commit -m "feat(loan): add a Borrowed tab to the main Add dialog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: One-time backfill into the current cutoff

**Files:**
- Create (temporary, deleted after running): `scripts/_tmp-backfill-loan-budget-sync.mjs`

This step only makes sense to run against the real account (`michellepgar@gmail.com`), after every earlier
task has shipped and the schema change is live. It's a plain `.mjs` script (can't import this project's
TypeScript modules directly without a transpiler), so it re-implements the same either/or check
`createAllocation` already enforces, directly in JS, against just that one user's one active period — run
it manually once, not as part of automated tests.

- [ ] **Step 1: Write and run the script**

```bash
cat > scripts/_tmp-backfill-loan-budget-sync.mjs << 'EOF'
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MY_EMAIL = "michellepgar@gmail.com";
const user = await prisma.user.findUnique({ where: { email: MY_EMAIL } });
if (!user) {
  console.error(`No user found for ${MY_EMAIL}.`);
  process.exit(1);
}

// The currently-active BudgetPeriod: the one whose range contains today.
const now = new Date();
const activePeriod = await prisma.budgetPeriod.findFirst({
  where: { userId: user.id, startDate: { lte: now }, endDate: { gte: now } },
  orderBy: { startDate: "desc" },
});
if (!activePeriod) {
  console.error("No active budget period found for this user — nothing to backfill.");
  process.exit(1);
}
console.log(`Backfilling into period: ${activePeriod.name} (${activePeriod.id})`);

async function tryCreateAllocation({ categoryId, subcategoryId, plannedAmount, label }) {
  const wholeCategoryRow = await prisma.budgetAllocation.findFirst({
    where: { budgetPeriodId: activePeriod.id, categoryId, subcategoryId: null },
  });
  if (wholeCategoryRow) {
    console.log(`  skip (whole-category allocation already exists): ${label}`);
    return;
  }
  if (subcategoryId === null) {
    const anyRow = await prisma.budgetAllocation.findFirst({
      where: { budgetPeriodId: activePeriod.id, categoryId },
    });
    if (anyRow) {
      console.log(`  skip (category already has a budget this cutoff): ${label}`);
      return;
    }
  } else {
    const dup = await prisma.budgetAllocation.findFirst({
      where: { budgetPeriodId: activePeriod.id, categoryId, subcategoryId },
    });
    if (dup) {
      console.log(`  skip (already allocated): ${label}`);
      return;
    }
  }
  await prisma.budgetAllocation.create({
    data: {
      userId: user.id,
      budgetPeriodId: activePeriod.id,
      categoryId,
      subcategoryId,
      plannedAmount,
      rolloverMode: "NONE",
      rolloverAmount: 0,
      showDailyAllowance: false,
    },
  });
  console.log(`  created: ${label} — ${(plannedAmount / 100).toFixed(2)}`);
}

const loans = await prisma.loan.findMany({
  where: { userId: user.id, archivedAt: null, categoryId: { not: null }, subcategoryId: { not: null } },
});
console.log(`Found ${loans.length} categorized active loan(s).`);
for (const loan of loans) {
  await tryCreateAllocation({
    categoryId: loan.categoryId,
    subcategoryId: loan.subcategoryId,
    plannedAmount: loan.monthlyPayment,
    label: `Loan: ${loan.name}`,
  });
}

const recurringPayables = await prisma.recurringPayable.findMany({
  where: { userId: user.id, active: true, categoryId: { not: null } },
});
console.log(`Found ${recurringPayables.length} categorized active recurring payable(s).`);
for (const payable of recurringPayables) {
  await tryCreateAllocation({
    categoryId: payable.categoryId,
    subcategoryId: null,
    plannedAmount: payable.amount,
    label: `Bill: ${payable.name}`,
  });
}

console.log("Backfill complete.");
await prisma.$disconnect();
EOF
node scripts/_tmp-backfill-loan-budget-sync.mjs
```

Expected: for each active, categorized loan/bill, either "created: ..." or a "skip (...)" line explaining
why (already covered some other way). Nothing here should error — if it does, stop and investigate before
continuing (don't re-run repeatedly while debugging; each successful run is meant to happen exactly once).

- [ ] **Step 2: Remove the script**

```bash
rm scripts/_tmp-backfill-loan-budget-sync.mjs
```

- [ ] **Step 3: Verify on the Budget page**

Confirm (via the Browser pane, logged in as the real account) that the Budget page's current cutoff now
shows an allocation for each loan/bill the script reported as "created".

---

### Task 11: Full verification pass

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (previous total plus this feature's new/changed tests)

- [ ] **Step 3: Lint changed files**

Run:
```bash
npx eslint src/lib/loans.ts src/lib/validations/loan.ts src/lib/recurring-allocations.ts src/lib/budget-period.ts src/actions/loan.actions.ts src/components/loans-cards/loan-form-dialog.tsx "src/app/(app)/loans-cards/page.tsx" "src/app/(app)/ledger/page.tsx" src/components/transactions/transaction-form.tsx
```
Expected: no errors

- [ ] **Step 4: Manually verify against the demo account, then reset it**

Using the Browser pane:
1. From the main Add dialog (the sidebar "Add" button), switch to the **Borrowed** tab, add a new loan with
   a category (e.g. "Test Loan"), confirm it appears on the Loans & Cards page with that category.
2. Confirm the Budget page's current cutoff now shows an allocation for that loan's monthly payment (this
   only auto-appears for periods created *after* this ships — on the demo account, add a transaction dated
   next cutoff, or otherwise trigger a fresh period, to see it; the *current* cutoff was already handled by
   Task 10 for the real account specifically).
3. Add a Loan Payment transaction through the plain **Transaction** tab (not "Make payment"), categorized
   to that same loan's subcategory. Confirm the Loans & Cards page's remaining balance for that loan drops
   by the payment amount.
4. Edit that same transaction's amount. Confirm the loan's remaining balance updates to match — proving
   it's derived, not stuck at whatever it was when first saved.
5. Delete that transaction. Confirm the loan's remaining balance goes back up accordingly.
6. Reset demo data: `npm run db:seed-demo`

- [ ] **Step 5: Run the Task 10 backfill against the real account**

Only after Steps 1-4 pass cleanly — this is the one step in this whole plan that touches production data
directly rather than the demo account. Follow Task 10 exactly.

