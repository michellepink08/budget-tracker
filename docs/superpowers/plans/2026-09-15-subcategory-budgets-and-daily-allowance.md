# Subcategory Budgets + Daily Allowance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `BudgetAllocation` budget either a whole category or one specific subcategory (never both for
the same category/cutoff), and let any allocation be flagged to show a recomputed-daily spending allowance
on the Dashboard.

**Architecture:** Two new columns on `BudgetAllocation` (`subcategoryId`, `showDailyAllowance`); the
either/or rule is enforced in application code (`createAllocation`), not the DB unique constraint, since
Postgres treats multiple NULLs as distinct. `listAllocationsWithActuals` picks `computeCategoryActual` or a
new `computeSubcategoryActual` per row. Daily allowance is a pure function
(`computeDailyAllowances`) over the same allocation rows the Budget page and Dashboard already fetch — no
new per-day bookkeeping.

**Tech Stack:** Next.js App Router server components, Prisma/Neon Postgres, Vitest, react-hook-form.

---

### Task 1: Schema — `subcategoryId` / `showDailyAllowance` on `BudgetAllocation`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Edit `BudgetAllocation`**

```prisma
model BudgetAllocation {
  id             String   @id @default(cuid())
  userId         String
  budgetPeriodId String
  categoryId     String
  subcategoryId  String?
  plannedAmount  Int
  rolloverMode   String
  rolloverAmount Int      @default(0)
  showDailyAllowance Boolean @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user         User         @relation(fields: [userId], references: [id])
  budgetPeriod BudgetPeriod @relation(fields: [budgetPeriodId], references: [id])
  category     Category     @relation(fields: [categoryId], references: [id])
  subcategory  Subcategory? @relation(fields: [subcategoryId], references: [id])

  @@unique([budgetPeriodId, categoryId, subcategoryId])
}
```

- [ ] **Step 2: Add the back-relation on `Subcategory`**

In the `Subcategory` model, add `budgetAllocations BudgetAllocation[]` alongside its existing
`transactions`/`recurringRules` relations:

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
}
```

- [ ] **Step 3: Regenerate the client and push the schema**

```bash
npx prisma generate
npx prisma db push
```

Expected: both succeed. If the schema-engine binary is blocked, fall back to raw SQL (same pattern as the
rollover feature):

```bash
cat > scripts/_tmp-add-subcategory-budget-columns.mjs << 'EOF'
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
await prisma.$executeRawUnsafe('ALTER TABLE "BudgetAllocation" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT');
await prisma.$executeRawUnsafe(
  'ALTER TABLE "BudgetAllocation" ADD COLUMN IF NOT EXISTS "showDailyAllowance" BOOLEAN NOT NULL DEFAULT false',
);
await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "BudgetAllocation_budgetPeriodId_categoryId_key"');
await prisma.$executeRawUnsafe(
  'CREATE UNIQUE INDEX IF NOT EXISTS "BudgetAllocation_budgetPeriodId_categoryId_subcategoryId_key" ON "BudgetAllocation"("budgetPeriodId", "categoryId", "subcategoryId")',
);
console.log("Columns added.");
await prisma.$disconnect();
EOF
node scripts/_tmp-add-subcategory-budget-columns.mjs
rm scripts/_tmp-add-subcategory-budget-columns.mjs
npx prisma generate
```

- [ ] **Step 4: Restart the local dev server** (Prisma client is cached in memory)

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(budget-allocation): add subcategoryId/showDailyAllowance columns

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `computeSubcategoryActual`

**Files:**
- Modify: `src/lib/category-actual.ts`
- Test: `src/lib/category-actual.test.ts` (create — none exists yet for this file)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { computeCategoryActual, computeSubcategoryActual } from "@/lib/category-actual";

describe("computeCategoryActual", () => {
  it("sums transaction amounts and flips sign (net outflow becomes positive)", async () => {
    const findMany = vi.fn().mockResolvedValue([{ amount: -3000 }, { amount: -2000 }]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeCategoryActual(prisma, "period-1", "cat-1");

    expect(actual).toBe(5000);
    expect(findMany).toHaveBeenCalledWith({ where: { budgetPeriodId: "period-1", categoryId: "cat-1" } });
  });
});

describe("computeSubcategoryActual", () => {
  it("sums transaction amounts scoped by subcategoryId, not categoryId", async () => {
    const findMany = vi.fn().mockResolvedValue([{ amount: -1500 }]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeSubcategoryActual(prisma, "period-1", "sub-1");

    expect(actual).toBe(1500);
    expect(findMany).toHaveBeenCalledWith({ where: { budgetPeriodId: "period-1", subcategoryId: "sub-1" } });
  });

  it("returns 0 (not -0) when there are no matching transactions", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeSubcategoryActual(prisma, "period-1", "sub-1");

    expect(Object.is(actual, 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/category-actual.test.ts`
Expected: FAIL — `computeSubcategoryActual is not a function` (the two `computeCategoryActual` assertions pass
already since that function exists)

- [ ] **Step 3: Add the implementation**

Append to `src/lib/category-actual.ts`:

```typescript
/**
 * Same as computeCategoryActual, but scoped to one subcategory instead of
 * a whole category — a transaction's own subcategoryId already implies
 * its category, so no separate categoryId filter is needed here.
 */
export async function computeSubcategoryActual(
  prisma: Pick<PrismaClient, "transaction">,
  budgetPeriodId: string,
  subcategoryId: string,
): Promise<number> {
  const transactions = await prisma.transaction.findMany({
    where: { budgetPeriodId, subcategoryId },
  });
  const net = transactions.reduce((sum, txn) => sum + txn.amount, 0);
  return net === 0 ? 0 : -net;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/category-actual.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/category-actual.ts src/lib/category-actual.test.ts
git commit -m "feat(budget): add computeSubcategoryActual

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Extend `resolveRolloverCarryIn` for subcategory-level allocations

**Files:**
- Modify: `src/lib/rollover-carry-in.ts`
- Modify: `src/lib/rollover-carry-in.test.ts`

- [ ] **Step 1: Update the tests**

Replace the whole file:

```typescript
import { describe, expect, it, vi } from "vitest";
import { resolveRolloverCarryIn } from "@/lib/rollover-carry-in";

function makeFakePrisma(previousPeriod: unknown, previousAllocation: unknown, transactions: unknown[]) {
  return {
    budgetPeriod: {
      findFirst: vi.fn().mockResolvedValue(previousPeriod),
    },
    budgetAllocation: {
      findFirst: vi.fn().mockResolvedValue(previousAllocation),
    },
    transaction: {
      findMany: vi.fn().mockResolvedValue(transactions),
    },
  } as any;
}

describe("resolveRolloverCarryIn", () => {
  it("returns 0 when there is no previous period", async () => {
    const prisma = makeFakePrisma(null, null, []);

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", null, new Date(2026, 8, 25));

    expect(carry).toBe(0);
  });

  it("returns 0 when the previous period had no matching allocation", async () => {
    const prisma = makeFakePrisma({ id: "period-prev", startDate: new Date(2026, 7, 25) }, null, []);

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", null, new Date(2026, 8, 25));

    expect(carry).toBe(0);
  });

  it("computes the carry from the previous period's whole-category allocation and actual spend", async () => {
    const prisma = makeFakePrisma(
      { id: "period-prev", startDate: new Date(2026, 7, 25) },
      { plannedAmount: 10000, rolloverAmount: 0, rolloverMode: "CARRY_UNUSED", subcategoryId: null },
      [{ amount: -6000 }],
    );

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", null, new Date(2026, 8, 25));

    expect(carry).toBe(4000);
    expect(prisma.budgetPeriod.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", startDate: { lt: new Date(2026, 8, 25) } },
      orderBy: { startDate: "desc" },
    });
    expect(prisma.budgetAllocation.findFirst).toHaveBeenCalledWith({
      where: { budgetPeriodId: "period-prev", categoryId: "cat-1", subcategoryId: null },
    });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: { budgetPeriodId: "period-prev", categoryId: "cat-1" },
    });
  });

  it("computes the carry from the previous period's subcategory-level allocation and actual spend", async () => {
    const prisma = makeFakePrisma(
      { id: "period-prev", startDate: new Date(2026, 7, 25) },
      { plannedAmount: 5000, rolloverAmount: 0, rolloverMode: "CARRY_UNUSED", subcategoryId: "sub-1" },
      [{ amount: -1000 }],
    );

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", "sub-1", new Date(2026, 8, 25));

    expect(carry).toBe(4000);
    expect(prisma.budgetAllocation.findFirst).toHaveBeenCalledWith({
      where: { budgetPeriodId: "period-prev", categoryId: "cat-1", subcategoryId: "sub-1" },
    });
    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: { budgetPeriodId: "period-prev", subcategoryId: "sub-1" },
    });
  });

  it("includes a prior carry-in when computing the previous period's effective planned amount", async () => {
    const prisma = makeFakePrisma(
      { id: "period-prev", startDate: new Date(2026, 7, 25) },
      { plannedAmount: 10000, rolloverAmount: 2000, rolloverMode: "CARRY_BOTH", subcategoryId: null },
      [{ amount: -9000 }],
    );

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", null, new Date(2026, 8, 25));

    // effectivePlanned = 10000 + 2000 = 12000; actual = 9000; unused = 3000
    expect(carry).toBe(3000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/rollover-carry-in.test.ts`
Expected: FAIL — `resolveRolloverCarryIn` still takes 4 args, `budgetAllocation.findUnique` doesn't exist on
the fake prisma anymore, etc.

- [ ] **Step 3: Rewrite the implementation**

```typescript
import type { PrismaClient } from "@prisma/client";
import { computeCategoryActual } from "@/lib/category-actual";
import { computeSubcategoryActual } from "@/lib/category-actual";
import { computeRolloverAmount } from "@/lib/rollover";
import type { RolloverMode } from "@/lib/constants/financial";

export async function resolveRolloverCarryIn(
  prisma: Pick<PrismaClient, "budgetPeriod" | "budgetAllocation" | "transaction">,
  userId: string,
  categoryId: string,
  subcategoryId: string | null,
  currentPeriodStartDate: Date,
): Promise<number> {
  const previousPeriod = await prisma.budgetPeriod.findFirst({
    where: { userId, startDate: { lt: currentPeriodStartDate } },
    orderBy: { startDate: "desc" },
  });
  if (!previousPeriod) {
    return 0;
  }

  const previousAllocation = await prisma.budgetAllocation.findFirst({
    where: { budgetPeriodId: previousPeriod.id, categoryId, subcategoryId },
  });
  if (!previousAllocation) {
    return 0;
  }

  const actual = subcategoryId
    ? await computeSubcategoryActual(prisma, previousPeriod.id, subcategoryId)
    : await computeCategoryActual(prisma, previousPeriod.id, categoryId);
  const effectivePlanned = previousAllocation.plannedAmount + previousAllocation.rolloverAmount;

  return computeRolloverAmount(previousAllocation.rolloverMode as RolloverMode, effectivePlanned, actual);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/rollover-carry-in.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/rollover-carry-in.ts src/lib/rollover-carry-in.test.ts
git commit -m "feat(budget): carry rollover in per-subcategory, not just per-category

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `createAllocation` either/or validation + subcategory-aware `listAllocationsWithActuals`

**Files:**
- Modify: `src/lib/budget-allocations.ts`
- Modify: `src/lib/budget-allocations.test.ts`

- [ ] **Step 1: Replace the test file**

```typescript
import { describe, expect, it, vi } from "vitest";
import {
  computeAvailableAllocationOptions,
  createAllocation,
  listAllocationsWithActuals,
  updateAllocation,
} from "@/lib/budget-allocations";

vi.mock("@/lib/rollover-carry-in", () => ({
  resolveRolloverCarryIn: vi.fn().mockResolvedValue(1500),
}));
vi.mock("@/lib/category-actual", () => ({
  computeCategoryActual: vi.fn().mockResolvedValue(4700),
  computeSubcategoryActual: vi.fn().mockResolvedValue(1200),
}));

describe("createAllocation", () => {
  function basePrisma(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      budgetAllocation: {
        create: vi.fn().mockResolvedValue({ id: "alloc-1" }),
        findFirst: vi.fn().mockResolvedValue(null), // no conflicting allocation by default
      },
      budgetPeriod: { findFirst: vi.fn().mockResolvedValue({ startDate: new Date(2026, 8, 25) }) },
      category: { findFirst: vi.fn().mockResolvedValue({ id: "cat-1" }) },
      subcategory: { findFirst: vi.fn().mockResolvedValue({ id: "sub-1", categoryId: "cat-1" }) },
      ...overrides,
    } as any;
  }

  it("creates a whole-category allocation when nothing conflicts", async () => {
    const prisma = basePrisma();

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: null,
      plannedAmount: 8000,
      rolloverMode: "CARRY_UNUSED",
      showDailyAllowance: false,
    });

    expect(result).toEqual({ ok: true, id: "alloc-1" });
    expect(prisma.budgetAllocation.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        budgetPeriodId: "period-1",
        categoryId: "cat-1",
        subcategoryId: null,
        plannedAmount: 8000,
        rolloverMode: "CARRY_UNUSED",
        showDailyAllowance: false,
        rolloverAmount: 1500,
      },
    });
  });

  it("rejects a whole-category allocation when the category already has any allocation this cutoff", async () => {
    const prisma = basePrisma({
      budgetAllocation: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "existing" }),
      },
    });

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: null,
      plannedAmount: 8000,
      rolloverMode: "CARRY_UNUSED",
      showDailyAllowance: false,
    });

    expect(result).toEqual({
      ok: false,
      error: "This category already has a budget for this cutoff — remove it first to budget by subcategory",
    });
    expect(prisma.budgetAllocation.create).not.toHaveBeenCalled();
  });

  it("creates a subcategory allocation when the category has no whole-category allocation", async () => {
    const prisma = basePrisma();

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: "sub-1",
      plannedAmount: 5000,
      rolloverMode: "NONE",
      showDailyAllowance: true,
    });

    expect(result).toEqual({ ok: true, id: "alloc-1" });
    expect(prisma.budgetAllocation.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        budgetPeriodId: "period-1",
        categoryId: "cat-1",
        subcategoryId: "sub-1",
        plannedAmount: 5000,
        rolloverMode: "NONE",
        showDailyAllowance: true,
        rolloverAmount: 1500,
      },
    });
  });

  it("rejects a subcategory allocation when the category already has a whole-category allocation", async () => {
    const prisma = basePrisma({
      budgetAllocation: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "existing", subcategoryId: null }),
      },
    });

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: "sub-1",
      plannedAmount: 5000,
      rolloverMode: "NONE",
      showDailyAllowance: false,
    });

    expect(result).toEqual({
      ok: false,
      error: "This category already has a whole-category budget for this cutoff",
    });
    expect(prisma.budgetAllocation.create).not.toHaveBeenCalled();
  });

  it("reports not found when the subcategory doesn't belong to the given category", async () => {
    const prisma = basePrisma({ subcategory: { findFirst: vi.fn().mockResolvedValue(null) } });

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: "sub-owned-by-someone-else",
      plannedAmount: 5000,
      rolloverMode: "NONE",
      showDailyAllowance: false,
    });

    expect(result).toEqual({ ok: false, error: "Subcategory not found" });
    expect(prisma.budgetAllocation.create).not.toHaveBeenCalled();
  });

  it("reports not found when the budget period belongs to another user", async () => {
    const prisma = basePrisma({ budgetPeriod: { findFirst: vi.fn().mockResolvedValue(null) } });

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: null,
      plannedAmount: 8000,
      rolloverMode: "CARRY_UNUSED",
      showDailyAllowance: false,
    });

    expect(result).toEqual({ ok: false, error: "Budget period not found" });
    expect(prisma.budgetAllocation.create).not.toHaveBeenCalled();
  });

  it("reports not found when the category belongs to another user", async () => {
    const prisma = basePrisma({ category: { findFirst: vi.fn().mockResolvedValue(null) } });

    const result = await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      subcategoryId: null,
      plannedAmount: 8000,
      rolloverMode: "CARRY_UNUSED",
      showDailyAllowance: false,
    });

    expect(result).toEqual({ ok: false, error: "Category not found" });
    expect(prisma.budgetAllocation.create).not.toHaveBeenCalled();
  });
});

describe("updateAllocation", () => {
  it("updates plannedAmount, rolloverMode, and showDailyAllowance, scoped to the user", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { budgetAllocation: { updateMany } } as any;

    const result = await updateAllocation(prisma, "user-1", "alloc-1", {
      plannedAmount: 9000,
      rolloverMode: "CARRY_BOTH",
      showDailyAllowance: true,
    });

    expect(result).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "alloc-1", userId: "user-1" },
      data: { plannedAmount: 9000, rolloverMode: "CARRY_BOTH", showDailyAllowance: true },
    });
  });

  it("reports not found when no row matched", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { budgetAllocation: { updateMany } } as any;

    const result = await updateAllocation(prisma, "user-1", "alloc-1", { plannedAmount: 9000 });

    expect(result).toEqual({ ok: false, error: "Allocation not found" });
  });
});

describe("listAllocationsWithActuals", () => {
  it("uses computeCategoryActual for a whole-category row", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "alloc-1",
        categoryId: "cat-1",
        subcategoryId: null,
        plannedAmount: 8000,
        rolloverAmount: 1500,
        rolloverMode: "CARRY_UNUSED",
        showDailyAllowance: false,
        category: { name: "Groceries" },
        subcategory: null,
      },
    ]);
    const prisma = { budgetAllocation: { findMany } } as any;

    const rows = await listAllocationsWithActuals(prisma, "user-1", "period-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", budgetPeriodId: "period-1" },
      include: { category: true, subcategory: true },
    });
    expect(rows).toEqual([
      {
        id: "alloc-1",
        categoryId: "cat-1",
        subcategoryId: null,
        category: { name: "Groceries" },
        subcategoryName: null,
        plannedAmount: 8000,
        rolloverAmount: 1500,
        rolloverMode: "CARRY_UNUSED",
        showDailyAllowance: false,
        effectivePlanned: 9500,
        actual: 4700,
        remaining: 4800,
        percentUsed: (4700 / 9500) * 100,
      },
    ]);
  });

  it("uses computeSubcategoryActual for a subcategory-level row", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "alloc-2",
        categoryId: "cat-1",
        subcategoryId: "sub-1",
        plannedAmount: 15000,
        rolloverAmount: 0,
        rolloverMode: "NONE",
        showDailyAllowance: true,
        category: { name: "Home & Groceries" },
        subcategory: { name: "Market / Grocery / Food" },
      },
    ]);
    const prisma = { budgetAllocation: { findMany } } as any;

    const rows = await listAllocationsWithActuals(prisma, "user-1", "period-1");

    expect(rows).toEqual([
      {
        id: "alloc-2",
        categoryId: "cat-1",
        subcategoryId: "sub-1",
        category: { name: "Home & Groceries" },
        subcategoryName: "Market / Grocery / Food",
        plannedAmount: 15000,
        rolloverAmount: 0,
        rolloverMode: "NONE",
        showDailyAllowance: true,
        effectivePlanned: 15000,
        actual: 1200,
        remaining: 13800,
        percentUsed: (1200 / 15000) * 100,
      },
    ]);
  });
});

describe("computeAvailableAllocationOptions", () => {
  const categories = [
    {
      id: "cat-1",
      name: "Home & Groceries",
      subcategories: [
        { id: "sub-1", name: "Rice" },
        { id: "sub-2", name: "Market / Grocery / Food" },
      ],
    },
    { id: "cat-2", name: "Security", subcategories: [] },
  ];

  it("offers both whole-category and every subcategory when nothing is allocated yet", () => {
    const options = computeAvailableAllocationOptions(categories, []);

    expect(options).toEqual([
      {
        id: "cat-1",
        name: "Home & Groceries",
        canWholeCategory: true,
        availableSubcategories: [
          { id: "sub-1", name: "Rice" },
          { id: "sub-2", name: "Market / Grocery / Food" },
        ],
      },
      { id: "cat-2", name: "Security", canWholeCategory: true, availableSubcategories: [] },
    ]);
  });

  it("drops a category entirely once it has a whole-category allocation", () => {
    const options = computeAvailableAllocationOptions(categories, [
      { categoryId: "cat-2", subcategoryId: null },
    ]);

    expect(options.map((o) => o.id)).toEqual(["cat-1"]);
  });

  it("blocks whole-category and removes the taken subcategory, once one subcategory is allocated", () => {
    const options = computeAvailableAllocationOptions(categories, [
      { categoryId: "cat-1", subcategoryId: "sub-2" },
    ]);

    expect(options.find((o) => o.id === "cat-1")).toEqual({
      id: "cat-1",
      name: "Home & Groceries",
      canWholeCategory: false,
      availableSubcategories: [{ id: "sub-1", name: "Rice" }],
    });
  });

  it("drops a category once every one of its subcategories is allocated", () => {
    const options = computeAvailableAllocationOptions(categories, [
      { categoryId: "cat-1", subcategoryId: "sub-1" },
      { categoryId: "cat-1", subcategoryId: "sub-2" },
    ]);

    expect(options.map((o) => o.id)).toEqual(["cat-2"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/budget-allocations.test.ts`
Expected: FAIL — `computeAvailableAllocationOptions` doesn't exist, `createAllocation`'s validation/shape
doesn't match yet.

- [ ] **Step 3: Rewrite `src/lib/budget-allocations.ts`**

```typescript
import type { PrismaClient } from "@prisma/client";
import { resolveRolloverCarryIn } from "@/lib/rollover-carry-in";
import { computeCategoryActual, computeSubcategoryActual } from "@/lib/category-actual";

export type AllocationInput = {
  budgetPeriodId: string;
  categoryId: string;
  subcategoryId: string | null;
  plannedAmount: number; // minor units
  rolloverMode: string;
  showDailyAllowance: boolean;
};

export type AllocationMutationResult = { ok: true } | { ok: false; error: string };

export type CreateAllocationResult = { ok: true; id: string } | { ok: false; error: string };

export async function createAllocation(
  prisma: Pick<PrismaClient, "budgetAllocation" | "budgetPeriod" | "category" | "subcategory" | "transaction">,
  userId: string,
  input: AllocationInput,
): Promise<CreateAllocationResult> {
  const period = await prisma.budgetPeriod.findFirst({
    where: { id: input.budgetPeriodId, userId },
  });
  if (!period) return { ok: false, error: "Budget period not found" };

  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, userId },
  });
  if (!category) return { ok: false, error: "Category not found" };

  if (input.subcategoryId) {
    const subcategory = await prisma.subcategory.findFirst({
      where: { id: input.subcategoryId, userId, categoryId: input.categoryId },
    });
    if (!subcategory) return { ok: false, error: "Subcategory not found" };

    // Either/or per category, per cutoff: a whole-category row already
    // existing blocks adding subcategory-level ones alongside it.
    const wholeCategoryRow = await prisma.budgetAllocation.findFirst({
      where: { budgetPeriodId: input.budgetPeriodId, categoryId: input.categoryId, subcategoryId: null },
    });
    if (wholeCategoryRow) {
      return { ok: false, error: "This category already has a whole-category budget for this cutoff" };
    }
  } else {
    // Postgres treats multiple NULL subcategoryIds as distinct, so the DB
    // unique index alone can't stop a second whole-category row (or a
    // whole-category row alongside existing subcategory ones) — checked
    // here instead.
    const anyRow = await prisma.budgetAllocation.findFirst({
      where: { budgetPeriodId: input.budgetPeriodId, categoryId: input.categoryId },
    });
    if (anyRow) {
      return {
        ok: false,
        error: "This category already has a budget for this cutoff — remove it first to budget by subcategory",
      };
    }
  }

  const rolloverAmount = await resolveRolloverCarryIn(
    prisma,
    userId,
    input.categoryId,
    input.subcategoryId,
    period.startDate,
  );

  const allocation = await prisma.budgetAllocation.create({
    data: { userId, ...input, rolloverAmount },
  });
  return { ok: true, id: allocation.id };
}

export async function updateAllocation(
  prisma: Pick<PrismaClient, "budgetAllocation">,
  userId: string,
  allocationId: string,
  input: { plannedAmount?: number; rolloverMode?: string; showDailyAllowance?: boolean },
): Promise<AllocationMutationResult> {
  const result = await prisma.budgetAllocation.updateMany({
    where: { id: allocationId, userId },
    data: input,
  });
  if (result.count === 0) {
    return { ok: false, error: "Allocation not found" };
  }
  return { ok: true };
}

export type AllocationWithActual = {
  id: string;
  categoryId: string;
  subcategoryId: string | null;
  category: { name: string };
  subcategoryName: string | null;
  plannedAmount: number;
  rolloverAmount: number;
  rolloverMode: string;
  showDailyAllowance: boolean;
  effectivePlanned: number;
  actual: number;
  remaining: number;
  percentUsed: number;
};

export async function listAllocationsWithActuals(
  prisma: Pick<PrismaClient, "budgetAllocation" | "transaction">,
  userId: string,
  budgetPeriodId: string,
): Promise<AllocationWithActual[]> {
  const allocations = await prisma.budgetAllocation.findMany({
    where: { userId, budgetPeriodId },
    include: { category: true, subcategory: true },
  });

  return Promise.all(
    allocations.map(async (allocation) => {
      const effectivePlanned = allocation.plannedAmount + allocation.rolloverAmount;
      const actual = allocation.subcategoryId
        ? await computeSubcategoryActual(prisma, budgetPeriodId, allocation.subcategoryId)
        : await computeCategoryActual(prisma, budgetPeriodId, allocation.categoryId);
      return {
        id: allocation.id,
        categoryId: allocation.categoryId,
        subcategoryId: allocation.subcategoryId,
        category: allocation.category,
        subcategoryName: allocation.subcategory?.name ?? null,
        plannedAmount: allocation.plannedAmount,
        rolloverAmount: allocation.rolloverAmount,
        rolloverMode: allocation.rolloverMode,
        showDailyAllowance: allocation.showDailyAllowance,
        effectivePlanned,
        actual,
        remaining: effectivePlanned - actual,
        percentUsed: effectivePlanned === 0 ? 0 : (actual / effectivePlanned) * 100,
      };
    }),
  );
}

export type CategoryWithSubcategories = { id: string; name: string; subcategories: { id: string; name: string }[] };
export type AvailableAllocationOption = {
  id: string;
  name: string;
  canWholeCategory: boolean;
  availableSubcategories: { id: string; name: string }[];
};

// Drives the "what can I still add a budget for?" dropdown. A category
// drops out entirely once nothing is left to budget for it: either it
// already has a whole-category row, or every one of its subcategories is
// already individually allocated and it has no whole-category option left
// either (blocked the moment any sibling subcategory got its own row).
export function computeAvailableAllocationOptions(
  categories: CategoryWithSubcategories[],
  existingAllocations: { categoryId: string; subcategoryId: string | null }[],
): AvailableAllocationOption[] {
  const wholeCategoryTaken = new Set(
    existingAllocations.filter((a) => a.subcategoryId === null).map((a) => a.categoryId),
  );
  const hasAnyAllocation = new Set(existingAllocations.map((a) => a.categoryId));
  const takenSubcategoryIds = new Set(
    existingAllocations.filter((a) => a.subcategoryId !== null).map((a) => a.subcategoryId as string),
  );

  return categories
    .filter((c) => !wholeCategoryTaken.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      canWholeCategory: !hasAnyAllocation.has(c.id),
      availableSubcategories: c.subcategories.filter((s) => !takenSubcategoryIds.has(s.id)),
    }))
    .filter((c) => c.canWholeCategory || c.availableSubcategories.length > 0);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/budget-allocations.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget-allocations.ts src/lib/budget-allocations.test.ts
git commit -m "feat(budget): support subcategory-level allocations (either/or per category)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `computeDailyAllowances`

**Files:**
- Create: `src/lib/daily-allowance.ts`
- Test: `src/lib/daily-allowance.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { computeDailyAllowances, daysLeftInPeriod } from "@/lib/daily-allowance";

describe("daysLeftInPeriod", () => {
  it("counts today itself as 1 day left when today is the period's last day", () => {
    expect(daysLeftInPeriod(new Date(2026, 8, 30), new Date(2026, 8, 30))).toBe(1);
  });

  it("counts inclusively from today through the period end", () => {
    expect(daysLeftInPeriod(new Date(2026, 8, 28), new Date(2026, 8, 30))).toBe(3);
  });

  it("clamps to a minimum of 1 when today is past the period end", () => {
    expect(daysLeftInPeriod(new Date(2026, 9, 2), new Date(2026, 8, 30))).toBe(1);
  });

  it("ignores time-of-day when comparing dates", () => {
    const today = new Date(2026, 8, 28, 23, 45);
    const periodEnd = new Date(2026, 8, 30, 0, 5);
    expect(daysLeftInPeriod(today, periodEnd)).toBe(3);
  });
});

describe("computeDailyAllowances", () => {
  const periodEnd = new Date(2026, 8, 30);
  const today = new Date(2026, 8, 28); // 3 days left, inclusive

  it("only includes allocations flagged showDailyAllowance", () => {
    const rows = computeDailyAllowances(
      [
        {
          id: "alloc-1",
          category: { name: "Home & Groceries" },
          subcategoryName: "Market / Grocery / Food",
          showDailyAllowance: true,
          remaining: 9000,
        },
        {
          id: "alloc-2",
          category: { name: "Utilities/Transpo/Subscription" },
          subcategoryName: null,
          showDailyAllowance: false,
          remaining: 5000,
        },
      ],
      periodEnd,
      today,
    );

    expect(rows).toEqual([
      { id: "alloc-1", label: "Home & Groceries — Market / Grocery / Food", amount: 3000 },
    ]);
  });

  it("labels a whole-category allocation with just the category name", () => {
    const rows = computeDailyAllowances(
      [
        {
          id: "alloc-1",
          category: { name: "Home & Groceries" },
          subcategoryName: null,
          showDailyAllowance: true,
          remaining: 6000,
        },
      ],
      periodEnd,
      today,
    );

    expect(rows).toEqual([{ id: "alloc-1", label: "Home & Groceries", amount: 2000 }]);
  });

  it("can be negative when the allocation is already over budget", () => {
    const rows = computeDailyAllowances(
      [
        {
          id: "alloc-1",
          category: { name: "Home & Groceries" },
          subcategoryName: null,
          showDailyAllowance: true,
          remaining: -3000,
        },
      ],
      periodEnd,
      today,
    );

    expect(rows).toEqual([{ id: "alloc-1", label: "Home & Groceries", amount: -1000 }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/daily-allowance.test.ts`
Expected: FAIL — `Cannot find module '@/lib/daily-allowance'`

- [ ] **Step 3: Write the implementation**

```typescript
// The daily allowance is deliberately recomputed fresh every time from
// today's actual `remaining` — not stored per-day anywhere. Underspend a
// day and tomorrow's (and every later day's) allowance rises since
// `remaining` didn't shrink as much; overspend and it falls. No separate
// day-by-day bookkeeping is needed.

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysLeftInPeriod(today: Date, periodEnd: Date): number {
  const diffMs = startOfDay(periodEnd).getTime() - startOfDay(today).getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(days, 1);
}

export type AllocationForDailyAllowance = {
  id: string;
  category: { name: string };
  subcategoryName: string | null;
  showDailyAllowance: boolean;
  remaining: number;
};

export type DailyAllowanceRow = { id: string; label: string; amount: number };

export function computeDailyAllowances(
  allocations: AllocationForDailyAllowance[],
  periodEnd: Date,
  today: Date = new Date(),
): DailyAllowanceRow[] {
  const days = daysLeftInPeriod(today, periodEnd);
  return allocations
    .filter((a) => a.showDailyAllowance)
    .map((a) => ({
      id: a.id,
      label: a.subcategoryName ? `${a.category.name} — ${a.subcategoryName}` : a.category.name,
      amount: a.remaining / days,
    }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/daily-allowance.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/daily-allowance.ts src/lib/daily-allowance.test.ts
git commit -m "feat(dashboard): add computeDailyAllowances

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire `subcategoryId`/`showDailyAllowance` through the actions

**Files:**
- Modify: `src/actions/budget.actions.ts`

- [ ] **Step 1: Update `allocationSchema` and both allocation actions**

Replace the `allocationSchema` definition and the two allocation action functions:

```typescript
const allocationSchema = z.object({
  budgetPeriodId: z.string().min(1),
  categoryId: z.string().min(1),
  subcategoryId: z.string().optional(),
  plannedAmount: z.number().positive("Planned amount must be greater than zero"),
  rolloverMode: z.enum(ROLLOVER_MODES),
  showDailyAllowance: z.boolean(),
});

export async function createAllocationAction(formData: FormData): Promise<BudgetActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = allocationSchema.safeParse({
    budgetPeriodId: formData.get("budgetPeriodId"),
    categoryId: formData.get("categoryId"),
    subcategoryId: formData.get("subcategoryId") || undefined,
    plannedAmount: Number(formData.get("plannedAmount")),
    rolloverMode: formData.get("rolloverMode"),
    showDailyAllowance: formData.get("showDailyAllowance") === "true",
  });
  if (!parsed.success) return { ok: false, error: "Please check the allocation details" };

  const capResult = await assertUnderDemoCap(
    prisma,
    user.id,
    () => prisma.budgetAllocation.count({ where: { userId: user.id } }),
    100,
  );
  if (capResult) return capResult;

  const result = await createAllocation(prisma, user.id, {
    ...parsed.data,
    subcategoryId: parsed.data.subcategoryId ?? null,
    plannedAmount: toMinorUnits(parsed.data.plannedAmount, user.currency),
  });
  if (!result.ok) return result;

  revalidatePath("/budget");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateAllocationAction(
  allocationId: string,
  formData: FormData,
): Promise<BudgetActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = z
    .object({
      plannedAmount: z.number().positive("Planned amount must be greater than zero"),
      rolloverMode: z.enum(ROLLOVER_MODES),
      showDailyAllowance: z.boolean(),
    })
    .safeParse({
      plannedAmount: Number(formData.get("plannedAmount")),
      rolloverMode: formData.get("rolloverMode"),
      showDailyAllowance: formData.get("showDailyAllowance") === "true",
    });
  if (!parsed.success) return { ok: false, error: "Please check the allocation details" };

  const result = await updateAllocation(prisma, user.id, allocationId, {
    ...parsed.data,
    plannedAmount: toMinorUnits(parsed.data.plannedAmount, user.currency),
  });

  if (result.ok) {
    revalidatePath("/budget");
    revalidatePath("/dashboard");
  }
  return result;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/actions/budget.actions.ts
git commit -m "feat(budget): pass subcategoryId/showDailyAllowance through the allocation actions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `AllocationFormDialog` — subcategory picker + daily-allowance checkbox

**Files:**
- Modify: `src/components/budget/allocation-form-dialog.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createAllocationAction, updateAllocationAction } from "@/actions/budget.actions";
import { ROLLOVER_MODES } from "@/lib/constants/financial";
import { humanizeEnum } from "@/lib/enum-labels";
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
import { toMajorUnits } from "@/lib/money";

const WHOLE_CATEGORY = "__whole__";

type AvailableCategoryOption = {
  id: string;
  name: string;
  canWholeCategory: boolean;
  availableSubcategories: { id: string; name: string }[];
};

type ExistingAllocation = {
  id: string;
  plannedAmount: number;
  rolloverMode: string;
  showDailyAllowance: boolean;
};

type FormValues = {
  categoryId: string;
  scope: string; // WHOLE_CATEGORY or a subcategory id
  plannedAmount: number;
  rolloverMode: (typeof ROLLOVER_MODES)[number];
  showDailyAllowance: boolean;
};

export function AllocationFormDialog({
  budgetPeriodId,
  currency,
  availableCategories,
  existing,
  existingLabel,
}: {
  budgetPeriodId: string;
  currency: string;
  availableCategories: AvailableCategoryOption[];
  existing?: ExistingAllocation;
  existingLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          categoryId: "",
          scope: WHOLE_CATEGORY,
          plannedAmount: toMajorUnits(existing.plannedAmount, currency),
          rolloverMode: existing.rolloverMode as FormValues["rolloverMode"],
          showDailyAllowance: existing.showDailyAllowance,
        }
      : {
          categoryId: availableCategories[0]?.id ?? "",
          scope: WHOLE_CATEGORY,
          plannedAmount: 0,
          rolloverMode: "NONE",
          showDailyAllowance: false,
        },
  });

  const selectedCategoryId = watch("categoryId");
  const selectedCategory = useMemo(
    () => availableCategories.find((c) => c.id === selectedCategoryId),
    [availableCategories, selectedCategoryId],
  );

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("budgetPeriodId", budgetPeriodId);
    formData.set("categoryId", values.categoryId);
    if (values.scope !== WHOLE_CATEGORY) formData.set("subcategoryId", values.scope);
    formData.set("plannedAmount", String(values.plannedAmount));
    formData.set("rolloverMode", values.rolloverMode);
    formData.set("showDailyAllowance", String(values.showDailyAllowance));

    const result = existing
      ? await updateAllocationAction(existing.id, formData)
      : await createAllocationAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Allocation updated" : "Allocation added");
    setOpen(false);
    router.refresh();
  }

  const disabled = !existing && availableCategories.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} disabled={disabled} />}>
        {existing ? "Edit" : "Add allocation"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existingLabel}` : "Add allocation"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {!existing && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoryId">Category</Label>
                <select
                  id="categoryId"
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  {...register("categoryId")}
                >
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="scope">Budget scope</Label>
                <select
                  id="scope"
                  className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                  {...register("scope")}
                >
                  {selectedCategory?.canWholeCategory && (
                    <option value={WHOLE_CATEGORY}>Whole category</option>
                  )}
                  {selectedCategory?.availableSubcategories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plannedAmount">Planned amount</Label>
            <Input
              id="plannedAmount"
              type="number"
              step="0.01"
              min="0.01"
              {...register("plannedAmount", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rolloverMode">Rollover</Label>
            <select
              id="rolloverMode"
              className="h-9 rounded-lg border border-input bg-input px-3 text-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] hover:border-ring/50 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
              {...register("rolloverMode")}
            >
              {ROLLOVER_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {humanizeEnum(mode)}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("showDailyAllowance")} />
            Show daily allowance on Dashboard
          </label>

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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: errors only in `src/components/budget/allocation-list.tsx` and
`src/app/(app)/budget/page.tsx` (fixed in the next two tasks) — no errors in this file itself.

- [ ] **Step 3: Commit**

```bash
git add src/components/budget/allocation-form-dialog.tsx
git commit -m "feat(budget): add subcategory picker + daily-allowance checkbox to the allocation form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: `AllocationList` — show subcategory + daily-allowance state

**Files:**
- Modify: `src/components/budget/allocation-list.tsx`

- [ ] **Step 1: Replace the whole file**

```tsx
import { formatMoney } from "@/lib/money";
import { AllocationFormDialog } from "@/components/budget/allocation-form-dialog";
import type { AllocationWithActual, AvailableAllocationOption } from "@/lib/budget-allocations";
import { Card } from "@/components/ui/card";

export function AllocationList({
  allocations,
  budgetPeriodId,
  currency,
  availableCategories,
}: {
  allocations: AllocationWithActual[];
  budgetPeriodId: string;
  currency: string;
  availableCategories: AvailableAllocationOption[];
}) {
  if (allocations.length === 0) {
    return (
      <p className="text-muted-foreground">
        No budget allocations for this period yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {allocations.map((allocation) => {
        const pct = Math.max(0, Math.min(100, allocation.percentUsed));
        const label = allocation.subcategoryName
          ? `${allocation.category.name} — ${allocation.subcategoryName}`
          : allocation.category.name;
        return (
          <Card key={allocation.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {label}
                  {allocation.showDailyAllowance && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">Daily allowance on</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(allocation.actual, currency)} of{" "}
                  {formatMoney(allocation.effectivePlanned, currency)}
                  {allocation.rolloverAmount !== 0 &&
                    ` (includes ${formatMoney(allocation.rolloverAmount, currency)} rollover)`}
                </p>
              </div>
              <AllocationFormDialog
                budgetPeriodId={budgetPeriodId}
                currency={currency}
                availableCategories={availableCategories}
                existing={allocation}
                existingLabel={label}
              />
            </div>
            <div className="mt-2 h-2 rounded-full bg-accent-tint">
              <div
                className={
                  allocation.remaining < 0
                    ? "h-2 rounded-full bg-destructive"
                    : "h-2 rounded-full bg-primary"
                }
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {allocation.remaining >= 0
                ? `${formatMoney(allocation.remaining, currency)} remaining`
                : `${formatMoney(-allocation.remaining, currency)} over budget`}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: errors remain only in `src/app/(app)/budget/page.tsx` (fixed next)

- [ ] **Step 3: Commit**

```bash
git add src/components/budget/allocation-list.tsx
git commit -m "feat(budget): show subcategory label and daily-allowance state in the list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Wire `computeAvailableAllocationOptions` into the Budget page

**Files:**
- Modify: `src/app/(app)/budget/page.tsx`

- [ ] **Step 1: Update the category-options computation**

Replace:

```typescript
  const [allocations, categories] = await Promise.all([
    listAllocationsWithActuals(prisma, user.id, activePeriod.id),
    listCategories(prisma, user.id),
  ]);

  const allocatedCategoryIds = new Set(allocations.map((a) => a.categoryId));
  const availableCategories = categories
    .filter((c) => !allocatedCategoryIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));
```

with:

```typescript
  const [allocations, categories] = await Promise.all([
    listAllocationsWithActuals(prisma, user.id, activePeriod.id),
    listCategories(prisma, user.id),
  ]);

  const availableCategories = computeAvailableAllocationOptions(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      subcategories: c.subcategories.map((s) => ({ id: s.id, name: s.name })),
    })),
    allocations.map((a) => ({ categoryId: a.categoryId, subcategoryId: a.subcategoryId })),
  );
```

- [ ] **Step 2: Add the import**

```typescript
import { computeAvailableAllocationOptions, listAllocationsWithActuals } from "@/lib/budget-allocations";
```

(replaces the existing `import { listAllocationsWithActuals } from "@/lib/budget-allocations";` line)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors anywhere

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/budget/page.tsx"
git commit -m "feat(budget): wire computeAvailableAllocationOptions into the Budget page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Daily allowance card on the Dashboard

**Files:**
- Create: `src/components/dashboard/daily-allowance-card.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Write the display component**

```tsx
import { formatMoney } from "@/lib/money";
import type { DailyAllowanceRow } from "@/lib/daily-allowance";
import { Card } from "@/components/ui/card";

export function DailyAllowanceCard({ rows, currency }: { rows: DailyAllowanceRow[]; currency: string }) {
  if (rows.length === 0) return null;

  return (
    <Card className="p-4">
      <p className="mb-2 text-sm text-muted-foreground">Today&apos;s allowance</p>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between text-sm">
            <span>{row.label}</span>
            <span className={row.amount < 0 ? "font-medium text-destructive" : "font-medium"}>
              {formatMoney(row.amount, currency)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the Dashboard**

Add the imports:

```typescript
import { computeDailyAllowances } from "@/lib/daily-allowance";
import { DailyAllowanceCard } from "@/components/dashboard/daily-allowance-card";
```

Right after the existing `const totalRemaining = totalPlanned - totalActual;` line, add:

```typescript
  const dailyAllowances = computeDailyAllowances(allocations, activePeriod.endDate, now);
```

Then, right after the `<FundingRecommendationBanner recommendation={recommendationView} />` line in the
JSX, add:

```tsx
      <DailyAllowanceCard rows={dailyAllowances} currency={user.currency} />
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/daily-allowance-card.tsx "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): show daily allowance card

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

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
npx eslint src/lib/category-actual.ts src/lib/rollover-carry-in.ts src/lib/budget-allocations.ts src/lib/daily-allowance.ts src/actions/budget.actions.ts src/components/budget/allocation-form-dialog.tsx src/components/budget/allocation-list.tsx src/components/dashboard/daily-allowance-card.tsx "src/app/(app)/budget/page.tsx" "src/app/(app)/dashboard/page.tsx"
```
Expected: no errors

- [ ] **Step 4: Manually verify against the demo account (then reset it)**

Using the Browser pane:
1. Log into the demo account, go to Budget, add a subcategory-level allocation (e.g. pick a category with
   subcategories, choose one specific subcategory, planned amount, check "Show daily allowance").
2. Confirm the category no longer offers that subcategory (or "Whole category") again, but its other
   subcategories are still selectable.
3. Confirm the allocation card shows "Category — Subcategory" and the planned/actual/remaining figures.
4. Add a transaction against that subcategory, confirm "actual"/"remaining" update.
5. Go to the Dashboard, confirm the "Today's allowance" card shows that subcategory with a plausible
   remaining-divided-by-days-left figure.
6. Edit the allocation (planned amount and/or the daily-allowance checkbox), confirm it updates the card
   and the Dashboard.
7. Reset demo data: `npm run db:seed-demo`
