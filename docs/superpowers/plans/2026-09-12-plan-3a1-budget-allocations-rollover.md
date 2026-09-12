# Plan 3A.1: Budget Allocations & Rollover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real budgets. The `BudgetAllocation` model (deferred from Plan 2A), rollover math, and a Budget page showing the current period's planned/actual/remaining per category — plus the ability to look at previous periods and manually create a future one.

**Architecture:** Same layering as every prior plan: dependency-injected domain functions in `src/lib/` (unit tested against a mocked Prisma client) → thin `"use server"` actions → pages. The one new piece of domain logic worth understanding before writing any code: **rollover is computed once, when an allocation is created, by looking backward at the previous period's allocation for that same category** — not recomputed on every page view. This keeps "what carried forward" a stable, auditable fact instead of a number that could change retroactively if someone edits an old transaction.

**Tech Stack:** Same as Plan 2A/2B. No new dependencies.

**Read first:** `docs/superpowers/specs/2026-09-12-budget-tracker-design.md` ("Accounts, categories, and budgeting" and "Data Model" sections) and `docs/superpowers/plans/2026-09-12-plan-2a-financial-foundation.md` (this plan builds on `cycle.ts` and `budget-period.ts`; don't re-derive that logic).

**Environment reminder:** update `prisma/schema.prisma` **and** `prisma/schema.sql` together, apply with `npm run db:push` — this machine can't run `prisma db push`/`migrate` directly (see Plan 1/2A for why).

**Rollover modes, precisely defined** (this is the trickiest part to get right — read carefully before Task 3):

Let `unused = effectivePlanned - actual` for a period's allocation, where `effectivePlanned = plannedAmount + rolloverAmount` (the rollover already carried *into* that period) and `actual` is net spend in that category for that period (positive = net outflow, can be negative if refunds exceeded spend).

| rolloverMode | carries into the *next* period's `rolloverAmount` |
|---|---|
| `NONE` | always `0` |
| `CARRY_UNUSED` | `max(unused, 0)` — leftover budget rolls forward; overspending doesn't reduce next period |
| `CARRY_OVERSPEND` | `min(unused, 0)` — overspending eats into next period; leftover budget doesn't roll forward |
| `CARRY_BOTH` | `unused` as-is — full carry, either direction |

---

### Task 1: Add `ROLLOVER_MODES` constant

**Files:**
- Modify: `src/lib/constants/financial.ts`

- [ ] **Step 1: Add the constant**

Append to `src/lib/constants/financial.ts` (Plan 2A deliberately left this out
until `BudgetAllocation` existed — it's needed now):

```typescript
export const ROLLOVER_MODES = ["NONE", "CARRY_UNUSED", "CARRY_OVERSPEND", "CARRY_BOTH"] as const;
export type RolloverMode = (typeof ROLLOVER_MODES)[number];
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add ROLLOVER_MODES constant"
```

---

### Task 2: Add `BudgetAllocation` to the schema

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/schema.sql`

- [ ] **Step 1: Add the relation field to `User`, `Category`, and `BudgetPeriod` in `prisma/schema.prisma`**

`User` — add `budgetAllocations BudgetAllocation[]` alongside its other
relation fields.

`Category` — add `allocations BudgetAllocation[]` alongside its other
relation fields.

`BudgetPeriod` — add `allocations BudgetAllocation[]` alongside
`transactions Transaction[]`.

- [ ] **Step 2: Append the new model**

```prisma
model BudgetAllocation {
  id             String   @id @default(cuid())
  userId         String
  budgetPeriodId String
  categoryId     String
  plannedAmount  Int
  rolloverMode   String
  rolloverAmount Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user         User         @relation(fields: [userId], references: [id])
  budgetPeriod BudgetPeriod @relation(fields: [budgetPeriodId], references: [id])
  category     Category     @relation(fields: [categoryId], references: [id])

  @@unique([budgetPeriodId, categoryId])
}
```

- [ ] **Step 3: Add the matching table to `prisma/schema.sql`**

Append:

```sql
CREATE TABLE IF NOT EXISTS "BudgetAllocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "budgetPeriodId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "plannedAmount" INTEGER NOT NULL,
  "rolloverMode" TEXT NOT NULL,
  "rolloverAmount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id"),
  FOREIGN KEY ("budgetPeriodId") REFERENCES "BudgetPeriod" ("id"),
  FOREIGN KEY ("categoryId") REFERENCES "Category" ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BudgetAllocation_budgetPeriodId_categoryId_key" ON "BudgetAllocation" ("budgetPeriodId", "categoryId");
```

- [ ] **Step 4: Regenerate the client and push the schema**

```bash
npm run db:generate
npm run db:push
```

Expected: output lists `Account, BudgetAllocation, BudgetPeriod, Category, Subcategory, Transaction, User` as the tables.

- [ ] **Step 5: Verify the project still typechecks**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add BudgetAllocation to the schema"
```

---

### Task 3: Rollover math (pure function, with tests)

**Files:**
- Create: `src/lib/rollover.ts`
- Test: `src/lib/rollover.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/rollover.test.ts
import { describe, expect, it } from "vitest";
import { computeRolloverAmount } from "@/lib/rollover";

describe("computeRolloverAmount", () => {
  it("NONE never carries anything", () => {
    expect(computeRolloverAmount("NONE", 10000, 6000)).toBe(0); // underspent
    expect(computeRolloverAmount("NONE", 10000, 15000)).toBe(0); // overspent
  });

  it("CARRY_UNUSED carries leftover budget but not overspending", () => {
    expect(computeRolloverAmount("CARRY_UNUSED", 10000, 6000)).toBe(4000);
    expect(computeRolloverAmount("CARRY_UNUSED", 10000, 15000)).toBe(0);
  });

  it("CARRY_OVERSPEND carries overspending but not leftover budget", () => {
    expect(computeRolloverAmount("CARRY_OVERSPEND", 10000, 15000)).toBe(-5000);
    expect(computeRolloverAmount("CARRY_OVERSPEND", 10000, 6000)).toBe(0);
  });

  it("CARRY_BOTH always carries the full difference, either direction", () => {
    expect(computeRolloverAmount("CARRY_BOTH", 10000, 6000)).toBe(4000);
    expect(computeRolloverAmount("CARRY_BOTH", 10000, 15000)).toBe(-5000);
  });

  it("carries exactly 0 when actual equals effective planned, regardless of mode", () => {
    expect(computeRolloverAmount("CARRY_BOTH", 10000, 10000)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/rollover.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/rollover'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/rollover.ts
import type { RolloverMode } from "@/lib/constants/financial";

/**
 * Given a period's effective planned amount (plannedAmount + whatever
 * rolled into it) and its actual net spend, returns the amount that
 * carries into the *next* period's rolloverAmount for the same category,
 * per the allocation's own rolloverMode. See the design spec /
 * Plan 3A.1's header for the precise semantics of each mode.
 */
export function computeRolloverAmount(
  rolloverMode: RolloverMode,
  effectivePlanned: number,
  actual: number,
): number {
  const unused = effectivePlanned - actual;

  switch (rolloverMode) {
    case "NONE":
      return 0;
    case "CARRY_UNUSED":
      return Math.max(unused, 0);
    case "CARRY_OVERSPEND":
      return Math.min(unused, 0);
    case "CARRY_BOTH":
      return unused;
    default:
      throw new Error(`Unknown rollover mode: ${rolloverMode}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/rollover.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add rollover math"
```

---

### Task 4: Category actual-spend computation (with tests)

**Files:**
- Create: `src/lib/category-actual.ts`
- Test: `src/lib/category-actual.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/category-actual.test.ts
import { describe, expect, it, vi } from "vitest";
import { computeCategoryActual } from "@/lib/category-actual";

describe("computeCategoryActual", () => {
  it("returns positive net spend for a category with only expenses", async () => {
    const findMany = vi.fn().mockResolvedValue([{ amount: -3200 }, { amount: -1500 }]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeCategoryActual(prisma, "period-1", "cat-1");

    expect(actual).toBe(4700);
    expect(findMany).toHaveBeenCalledWith({
      where: { budgetPeriodId: "period-1", categoryId: "cat-1" },
    });
  });

  it("nets a refund against an expense in the same category", async () => {
    const findMany = vi.fn().mockResolvedValue([{ amount: -3200 }, { amount: 500 }]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeCategoryActual(prisma, "period-1", "cat-1");

    expect(actual).toBe(2700);
  });

  it("returns a negative actual when inflows exceed outflows", async () => {
    const findMany = vi.fn().mockResolvedValue([{ amount: -1000 }, { amount: 2500 }]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeCategoryActual(prisma, "period-1", "cat-1");

    expect(actual).toBe(-1500);
  });

  it("returns 0 when there are no transactions", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { transaction: { findMany } } as any;

    const actual = await computeCategoryActual(prisma, "period-1", "cat-1");

    expect(actual).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/category-actual.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/category-actual'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/category-actual.ts
import type { PrismaClient } from "@prisma/client";

/**
 * Net spend for a category within a budget period, in minor units.
 * Positive = net outflow (money spent). Negative = net inflow (e.g.
 * refunds exceeded spend in that category this period).
 */
export async function computeCategoryActual(
  prisma: Pick<PrismaClient, "transaction">,
  budgetPeriodId: string,
  categoryId: string,
): Promise<number> {
  const transactions = await prisma.transaction.findMany({
    where: { budgetPeriodId, categoryId },
  });
  const net = transactions.reduce((sum, txn) => sum + txn.amount, 0);
  return -net;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/category-actual.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add category actual-spend computation"
```

---

### Task 5: Rollover carry-in resolution (with tests)

**Files:**
- Create: `src/lib/rollover-carry-in.ts`
- Test: `src/lib/rollover-carry-in.test.ts`

Looks backward at the previous period's allocation for a category (if any)
to compute what carries into a new allocation being created now.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/rollover-carry-in.test.ts
import { describe, expect, it, vi } from "vitest";
import { resolveRolloverCarryIn } from "@/lib/rollover-carry-in";

function makeFakePrisma(previousPeriod: unknown, previousAllocation: unknown, transactions: unknown[]) {
  return {
    budgetPeriod: {
      findFirst: vi.fn().mockResolvedValue(previousPeriod),
    },
    budgetAllocation: {
      findUnique: vi.fn().mockResolvedValue(previousAllocation),
    },
    transaction: {
      findMany: vi.fn().mockResolvedValue(transactions),
    },
  } as any;
}

describe("resolveRolloverCarryIn", () => {
  it("returns 0 when there is no previous period", async () => {
    const prisma = makeFakePrisma(null, null, []);

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", new Date(2026, 8, 25));

    expect(carry).toBe(0);
  });

  it("returns 0 when the previous period had no allocation for this category", async () => {
    const prisma = makeFakePrisma({ id: "period-prev", startDate: new Date(2026, 7, 25) }, null, []);

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", new Date(2026, 8, 25));

    expect(carry).toBe(0);
  });

  it("computes the carry from the previous period's allocation and actual spend", async () => {
    const prisma = makeFakePrisma(
      { id: "period-prev", startDate: new Date(2026, 7, 25) },
      { plannedAmount: 10000, rolloverAmount: 0, rolloverMode: "CARRY_UNUSED" },
      [{ amount: -6000 }],
    );

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", new Date(2026, 8, 25));

    expect(carry).toBe(4000);
    expect(prisma.budgetPeriod.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", startDate: { lt: new Date(2026, 8, 25) } },
      orderBy: { startDate: "desc" },
    });
    expect(prisma.budgetAllocation.findUnique).toHaveBeenCalledWith({
      where: { budgetPeriodId_categoryId: { budgetPeriodId: "period-prev", categoryId: "cat-1" } },
    });
  });

  it("includes a prior carry-in when computing the previous period's effective planned amount", async () => {
    const prisma = makeFakePrisma(
      { id: "period-prev", startDate: new Date(2026, 7, 25) },
      { plannedAmount: 10000, rolloverAmount: 2000, rolloverMode: "CARRY_BOTH" },
      [{ amount: -9000 }],
    );

    const carry = await resolveRolloverCarryIn(prisma, "user-1", "cat-1", new Date(2026, 8, 25));

    // effectivePlanned = 10000 + 2000 = 12000; actual = 9000; unused = 3000
    expect(carry).toBe(3000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/rollover-carry-in.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/rollover-carry-in'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/rollover-carry-in.ts
import type { PrismaClient } from "@prisma/client";
import { computeCategoryActual } from "@/lib/category-actual";
import { computeRolloverAmount } from "@/lib/rollover";
import type { RolloverMode } from "@/lib/constants/financial";

export async function resolveRolloverCarryIn(
  prisma: Pick<PrismaClient, "budgetPeriod" | "budgetAllocation" | "transaction">,
  userId: string,
  categoryId: string,
  currentPeriodStartDate: Date,
): Promise<number> {
  const previousPeriod = await prisma.budgetPeriod.findFirst({
    where: { userId, startDate: { lt: currentPeriodStartDate } },
    orderBy: { startDate: "desc" },
  });
  if (!previousPeriod) {
    return 0;
  }

  const previousAllocation = await prisma.budgetAllocation.findUnique({
    where: { budgetPeriodId_categoryId: { budgetPeriodId: previousPeriod.id, categoryId } },
  });
  if (!previousAllocation) {
    return 0;
  }

  const actual = await computeCategoryActual(prisma, previousPeriod.id, categoryId);
  const effectivePlanned = previousAllocation.plannedAmount + previousAllocation.rolloverAmount;

  return computeRolloverAmount(previousAllocation.rolloverMode as RolloverMode, effectivePlanned, actual);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/rollover-carry-in.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add rollover carry-in resolution"
```

---

### Task 6: Budget allocation domain functions (with tests)

**Files:**
- Create: `src/lib/budget-allocations.ts`
- Test: `src/lib/budget-allocations.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/budget-allocations.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  createAllocation,
  listAllocationsWithActuals,
  updateAllocation,
} from "@/lib/budget-allocations";

vi.mock("@/lib/rollover-carry-in", () => ({
  resolveRolloverCarryIn: vi.fn().mockResolvedValue(1500),
}));
vi.mock("@/lib/category-actual", () => ({
  computeCategoryActual: vi.fn().mockResolvedValue(4700),
}));

describe("createAllocation", () => {
  it("resolves the rollover carry-in and creates the allocation", async () => {
    const create = vi.fn().mockResolvedValue({ id: "alloc-1" });
    const prisma = {
      budgetAllocation: { create },
      budgetPeriod: { findUniqueOrThrow: vi.fn().mockResolvedValue({ startDate: new Date(2026, 8, 25) }) },
    } as any;

    await createAllocation(prisma, "user-1", {
      budgetPeriodId: "period-1",
      categoryId: "cat-1",
      plannedAmount: 8000,
      rolloverMode: "CARRY_UNUSED",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        budgetPeriodId: "period-1",
        categoryId: "cat-1",
        plannedAmount: 8000,
        rolloverMode: "CARRY_UNUSED",
        rolloverAmount: 1500,
      },
    });
  });
});

describe("updateAllocation", () => {
  it("updates only plannedAmount and rolloverMode, scoped to the user", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { budgetAllocation: { updateMany } } as any;

    const result = await updateAllocation(prisma, "user-1", "alloc-1", {
      plannedAmount: 9000,
      rolloverMode: "CARRY_BOTH",
    });

    expect(result).toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "alloc-1", userId: "user-1" },
      data: { plannedAmount: 9000, rolloverMode: "CARRY_BOTH" },
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
  it("attaches actual/effectivePlanned/remaining/percentUsed to each allocation", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "alloc-1",
        categoryId: "cat-1",
        plannedAmount: 8000,
        rolloverAmount: 1500,
        rolloverMode: "CARRY_UNUSED",
        category: { name: "Groceries" },
      },
    ]);
    const prisma = { budgetAllocation: { findMany } } as any;

    const rows = await listAllocationsWithActuals(prisma, "user-1", "period-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", budgetPeriodId: "period-1" },
      include: { category: true },
    });
    expect(rows).toEqual([
      {
        id: "alloc-1",
        categoryId: "cat-1",
        category: { name: "Groceries" },
        plannedAmount: 8000,
        rolloverAmount: 1500,
        rolloverMode: "CARRY_UNUSED",
        effectivePlanned: 9500,
        actual: 4700,
        remaining: 4800,
        percentUsed: (4700 / 9500) * 100,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/budget-allocations.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/budget-allocations'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/budget-allocations.ts
import type { PrismaClient } from "@prisma/client";
import { resolveRolloverCarryIn } from "@/lib/rollover-carry-in";
import { computeCategoryActual } from "@/lib/category-actual";

export type AllocationInput = {
  budgetPeriodId: string;
  categoryId: string;
  plannedAmount: number; // minor units
  rolloverMode: string;
};

export type AllocationMutationResult = { ok: true } | { ok: false; error: string };

export async function createAllocation(
  prisma: Pick<PrismaClient, "budgetAllocation" | "budgetPeriod" | "transaction">,
  userId: string,
  input: AllocationInput,
) {
  const period = await prisma.budgetPeriod.findUniqueOrThrow({
    where: { id: input.budgetPeriodId },
  });

  const rolloverAmount = await resolveRolloverCarryIn(
    prisma,
    userId,
    input.categoryId,
    period.startDate,
  );

  return prisma.budgetAllocation.create({
    data: { userId, ...input, rolloverAmount },
  });
}

export async function updateAllocation(
  prisma: Pick<PrismaClient, "budgetAllocation">,
  userId: string,
  allocationId: string,
  input: { plannedAmount?: number; rolloverMode?: string },
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
  category: { name: string };
  plannedAmount: number;
  rolloverAmount: number;
  rolloverMode: string;
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
    include: { category: true },
  });

  return Promise.all(
    allocations.map(async (allocation) => {
      const effectivePlanned = allocation.plannedAmount + allocation.rolloverAmount;
      const actual = await computeCategoryActual(prisma, budgetPeriodId, allocation.categoryId);
      return {
        id: allocation.id,
        categoryId: allocation.categoryId,
        category: allocation.category,
        plannedAmount: allocation.plannedAmount,
        rolloverAmount: allocation.rolloverAmount,
        rolloverMode: allocation.rolloverMode,
        effectivePlanned,
        actual,
        remaining: effectivePlanned - actual,
        percentUsed: effectivePlanned === 0 ? 0 : (actual / effectivePlanned) * 100,
      };
    }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/budget-allocations.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add budget allocation domain functions"
```

---

### Task 7: Budget period listing and manual creation (with tests)

**Files:**
- Create: `src/lib/budget-periods.ts`
- Test: `src/lib/budget-periods.test.ts`

`resolveBudgetPeriodForDate` (Plan 2A) already handles auto-resolving the
*current* period. This adds listing past periods and creating one by hand
(e.g. to set up a future period's budget ahead of time).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/budget-periods.test.ts
import { describe, expect, it, vi } from "vitest";
import { createBudgetPeriod, listBudgetPeriods } from "@/lib/budget-periods";

describe("listBudgetPeriods", () => {
  it("scopes to the user, newest first", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { budgetPeriod: { findMany } } as any;

    await listBudgetPeriods(prisma, "user-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { startDate: "desc" },
    });
  });
});

describe("createBudgetPeriod", () => {
  it("creates a period scoped to the given user", async () => {
    const create = vi.fn().mockResolvedValue({ id: "period-new" });
    const prisma = { budgetPeriod: { create } } as any;

    await createBudgetPeriod(prisma, "user-1", {
      name: "October cycle",
      startDate: new Date(2026, 9, 25),
      endDate: new Date(2026, 10, 24),
      status: "UPCOMING",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "October cycle",
        startDate: new Date(2026, 9, 25),
        endDate: new Date(2026, 10, 24),
        status: "UPCOMING",
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/budget-periods.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/budget-periods'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/budget-periods.ts
import type { PrismaClient } from "@prisma/client";

export async function listBudgetPeriods(prisma: Pick<PrismaClient, "budgetPeriod">, userId: string) {
  return prisma.budgetPeriod.findMany({
    where: { userId },
    orderBy: { startDate: "desc" },
  });
}

export type BudgetPeriodInput = {
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
};

export async function createBudgetPeriod(
  prisma: Pick<PrismaClient, "budgetPeriod">,
  userId: string,
  input: BudgetPeriodInput,
) {
  return prisma.budgetPeriod.create({ data: { userId, ...input } });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/budget-periods.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add budget period listing and manual creation"
```

---

### Task 8: Budget server actions

**Files:**
- Create: `src/actions/budget.actions.ts`

- [ ] **Step 1: Write the actions**

```typescript
// src/actions/budget.actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { ROLLOVER_MODES } from "@/lib/constants/financial";
import { createAllocation, updateAllocation } from "@/lib/budget-allocations";
import { createBudgetPeriod } from "@/lib/budget-periods";
import { toMinorUnits } from "@/lib/money";

export type BudgetActionResult = { ok: true } | { ok: false; error: string };

const allocationSchema = z.object({
  budgetPeriodId: z.string().min(1),
  categoryId: z.string().min(1),
  plannedAmount: z.number().positive("Planned amount must be greater than zero"),
  rolloverMode: z.enum(ROLLOVER_MODES),
});

export async function createAllocationAction(formData: FormData): Promise<BudgetActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  const parsed = allocationSchema.safeParse({
    budgetPeriodId: formData.get("budgetPeriodId"),
    categoryId: formData.get("categoryId"),
    plannedAmount: Number(formData.get("plannedAmount")),
    rolloverMode: formData.get("rolloverMode"),
  });
  if (!parsed.success) return { ok: false, error: "Please check the allocation details" };

  await createAllocation(prisma, user.id, {
    ...parsed.data,
    plannedAmount: toMinorUnits(parsed.data.plannedAmount, user.currency),
  });

  revalidatePath("/budget");
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
    })
    .safeParse({
      plannedAmount: Number(formData.get("plannedAmount")),
      rolloverMode: formData.get("rolloverMode"),
    });
  if (!parsed.success) return { ok: false, error: "Please check the allocation details" };

  const result = await updateAllocation(prisma, user.id, allocationId, {
    ...parsed.data,
    plannedAmount: toMinorUnits(parsed.data.plannedAmount, user.currency),
  });

  if (result.ok) revalidatePath("/budget");
  return result;
}

const periodSchema = z.object({
  name: z.string().min(1, "Name is required"),
  startDate: z.date(),
  endDate: z.date(),
});

export async function createBudgetPeriodAction(formData: FormData): Promise<BudgetActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "You must be logged in" };

  const parsed = periodSchema.safeParse({
    name: formData.get("name"),
    startDate: new Date(String(formData.get("startDate"))),
    endDate: new Date(String(formData.get("endDate"))),
  });
  if (!parsed.success) return { ok: false, error: "Please check the period details" };

  if (parsed.data.endDate <= parsed.data.startDate) {
    return { ok: false, error: "End date must be after start date" };
  }

  await createBudgetPeriod(prisma, session.user.id, { ...parsed.data, status: "UPCOMING" });

  revalidatePath("/budget");
  return { ok: true };
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
git commit -m "feat: add budget allocation and period server actions"
```

---

### Task 9: Budget page

**Files:**
- Create: `src/app/(app)/budget/page.tsx`, `src/components/budget/allocation-list.tsx`, `src/components/budget/allocation-form-dialog.tsx`, `src/components/budget/period-form-dialog.tsx`, `src/components/budget/period-picker.tsx`

- [ ] **Step 1: Write the allocation form dialog**

```tsx
// src/components/budget/allocation-form-dialog.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createAllocationAction, updateAllocationAction } from "@/actions/budget.actions";
import { ROLLOVER_MODES } from "@/lib/constants/financial";
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

type CategoryOption = { id: string; name: string };

type ExistingAllocation = {
  id: string;
  plannedAmount: number;
  rolloverMode: string;
};

type FormValues = {
  categoryId: string;
  plannedAmount: number;
  rolloverMode: (typeof ROLLOVER_MODES)[number];
};

export function AllocationFormDialog({
  budgetPeriodId,
  currency,
  availableCategories,
  existing,
  existingCategoryName,
}: {
  budgetPeriodId: string;
  currency: string;
  availableCategories: CategoryOption[];
  existing?: ExistingAllocation;
  existingCategoryName?: string;
}) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: existing
      ? {
          categoryId: "",
          plannedAmount: toMajorUnits(existing.plannedAmount, currency),
          rolloverMode: existing.rolloverMode as FormValues["rolloverMode"],
        }
      : { categoryId: availableCategories[0]?.id ?? "", plannedAmount: 0, rolloverMode: "NONE" },
  });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("budgetPeriodId", budgetPeriodId);
    formData.set("categoryId", values.categoryId);
    formData.set("plannedAmount", String(values.plannedAmount));
    formData.set("rolloverMode", values.rolloverMode);

    const result = existing
      ? await updateAllocationAction(existing.id, formData)
      : await createAllocationAction(formData);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Allocation updated" : "Allocation added");
    setOpen(false);
  }

  const disabled = !existing && availableCategories.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={existing ? "outline" : "default"} disabled={disabled} />}>
        {existing ? "Edit" : "Add allocation"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existingCategoryName}` : "Add allocation"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {!existing && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="categoryId">Category</Label>
              <select
                id="categoryId"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                {...register("categoryId")}
              >
                {availableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
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
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("rolloverMode")}
            >
              {ROLLOVER_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
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

- [ ] **Step 2: Write the allocation list**

```tsx
// src/components/budget/allocation-list.tsx
import { formatMoney } from "@/lib/money";
import { AllocationFormDialog } from "@/components/budget/allocation-form-dialog";
import type { AllocationWithActual } from "@/lib/budget-allocations";

export function AllocationList({
  allocations,
  budgetPeriodId,
  currency,
  availableCategories,
}: {
  allocations: AllocationWithActual[];
  budgetPeriodId: string;
  currency: string;
  availableCategories: { id: string; name: string }[];
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
        return (
          <div key={allocation.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{allocation.category.name}</p>
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
                existingCategoryName={allocation.category.name}
              />
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {allocation.remaining >= 0
                ? `${formatMoney(allocation.remaining, currency)} remaining`
                : `${formatMoney(-allocation.remaining, currency)} over budget`}
            </p>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Write the period picker and manual-creation dialog**

```tsx
// src/components/budget/period-picker.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { formatCycleRange } from "@/lib/cycle";

type PeriodOption = { id: string; startDate: Date; endDate: Date };

export function PeriodPicker({ periods }: { periods: PeriodOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <select
      defaultValue={searchParams.get("periodId") ?? periods[0]?.id ?? ""}
      onChange={(e) => router.push(`/budget?periodId=${e.target.value}`)}
      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
    >
      {periods.map((period) => (
        <option key={period.id} value={period.id}>
          {formatCycleRange({ start: period.startDate, end: period.endDate })}
        </option>
      ))}
    </select>
  );
}
```

```tsx
// src/components/budget/period-form-dialog.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createBudgetPeriodAction } from "@/actions/budget.actions";
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

type FormValues = { name: string; startDate: string; endDate: string };

export function PeriodFormDialog() {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({ defaultValues: { name: "", startDate: "", endDate: "" } });

  async function onSubmit(values: FormValues) {
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("startDate", values.startDate);
    formData.set("endDate", values.endDate);

    const result = await createBudgetPeriodAction(formData);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Period created");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>New period</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a budget period</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input id="startDate" type="date" {...register("startDate")} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endDate">End date</Label>
            <Input id="endDate" type="date" {...register("endDate")} required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Write the page**

```tsx
// src/app/(app)/budget/page.tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentCycle } from "@/lib/cycle";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listBudgetPeriods } from "@/lib/budget-periods";
import { listAllocationsWithActuals } from "@/lib/budget-allocations";
import { listCategories } from "@/lib/categories";
import { formatCycleRange } from "@/lib/cycle";
import { AllocationList } from "@/components/budget/allocation-list";
import { AllocationFormDialog } from "@/components/budget/allocation-form-dialog";
import { PeriodPicker } from "@/components/budget/period-picker";
import { PeriodFormDialog } from "@/components/budget/period-form-dialog";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string }>;
}) {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });
  const params = await searchParams;

  // Ensure the current cycle's period exists so it always shows up in the picker.
  const currentCycle = getCurrentCycle(user.cycleStartDay);
  await resolveBudgetPeriodForDate(prisma, user.id, new Date(), user.cycleStartDay);

  const periods = await listBudgetPeriods(prisma, user.id);
  const activePeriod =
    periods.find((p) => p.id === params.periodId) ??
    periods.find((p) => p.startDate.getTime() === currentCycle.start.getTime()) ??
    periods[0];

  const [allocations, categories] = await Promise.all([
    listAllocationsWithActuals(prisma, user.id, activePeriod.id),
    listCategories(prisma, user.id),
  ]);

  const allocatedCategoryIds = new Set(allocations.map((a) => a.categoryId));
  const availableCategories = categories
    .filter((c) => !allocatedCategoryIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Budget</h1>
          <p className="text-sm text-muted-foreground">
            {formatCycleRange({ start: activePeriod.startDate, end: activePeriod.endDate })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodPicker periods={periods} />
          <PeriodFormDialog />
          <AllocationFormDialog
            budgetPeriodId={activePeriod.id}
            currency={user.currency}
            availableCategories={availableCategories}
          />
        </div>
      </div>

      <AllocationList
        allocations={allocations}
        budgetPeriodId={activePeriod.id}
        currency={user.currency}
        availableCategories={availableCategories}
      />
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
git commit -m "feat: add budget page (allocations, rollover display, period picker, manual period creation)"
```

---

### Task 10: Add "Budget" to the top nav

**Files:**
- Modify: `src/components/nav/top-nav.tsx`

- [ ] **Step 1: Insert the link**

In `src/components/nav/top-nav.tsx`, add a `Budget` entry to the `links`
array, right after `Transactions`:

```typescript
const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budget", label: "Budget" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
  { href: "/recurring", label: "Recurring" },
  { href: "/settings", label: "Settings" },
];
```

(The design spec's final nav also drops `Categories`/`Recurring` from the
top level — that's a dedicated nav-restructuring task for later, once
Recurring/Bills/Reports/Settings all exist. Don't do it here.)

- [ ] **Step 2: Add a loading state for the new route**

```tsx
// src/app/(app)/budget/loading.tsx
export default function Loading() {
  return <p className="text-muted-foreground">Loading budget...</p>;
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Budget to the top nav and its loading state"
```

---

### Task 11: Full verification

- [ ] **Step 1: Run the whole test suite**

```bash
npm test
```

Expected: every test passes, including the new rollover/category-actual/
allocation/period tests from Tasks 3-7, on top of everything from prior
plans.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Walk through the flow in a browser**

1. Log in as the demo user, go to Budget.
2. Confirm the current cycle's period shows with no allocations yet
   (demo seed data from Plan 2A never created any `BudgetAllocation` rows).
3. Add an allocation for Groceries with a planned amount below what the
   seed data already spent this period — confirm the progress bar shows
   over 100% and "over budget" text.
4. Add an allocation for Rent with `CARRY_UNUSED` and a planned amount
   above what was spent — confirm "remaining" shows a positive amount.
5. Edit an allocation's planned amount and rollover mode — confirm it
   saves.
6. Use "New period" to manually create a future period; confirm it
   appears in the period picker and switching to it shows an empty
   allocation list (with "Add allocation" available for every category
   again, since nothing's allocated in the new period).
7. Switch back to the current period — confirm your allocations are
   still there.

- [ ] **Step 4: Commit any fixes found**

```bash
git add -A
git commit -m "fix: address issues found during Plan 3A.1 verification"
```
