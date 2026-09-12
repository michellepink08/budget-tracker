# Plan 3B.3: Dashboard & Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The third sub-plan of Plan 3B — replace the placeholder Dashboard with real calculations (liquid funds, budget progress, upcoming bills/installments), and add a new Reports page with two charts.

**Architecture:** No schema changes at all — every number here is computed from data that already exists. Three small pieces:

1. **Liquid funds** (`src/lib/liquid-funds.ts`) — a new domain function summing `computeAccountBalance` (Plan 2A) across accounts eligible per the design spec's hard rule: `includeInLiquidFunds` true, and never `CREDIT_CARD`/`LOAN` account types regardless of that flag.
2. **Reports aggregation** (`src/lib/reports.ts`) — two new domain functions: `spendingByCategory` (reuses `computeCategoryActual` from Plan 3A.1, one call per `EXPENSE`-type category) and `incomeVsExpenseByPeriod` (sums `INCOME`/`EXPENSE` transactions per budget period, across the last N periods).
3. **Dashboard's "Upcoming" list** is not a new domain function — it's `listDuePayables` (Plan 3A.3) and `listDueInstallmentPayments` (Plan 3B.2) merged and sorted by the page itself, the same way the Bills page already merges data from multiple sources inline.

**New dependency:** `recharts` (pure JS, no native binary — unaffected by this machine's Application Control policy, unlike Prisma/Turbopack). **Documented simplification:** rather than pulling in shadcn's full `chart.tsx` primitive (a `ChartContainer`/`ChartConfig` wrapper), the two chart components in this plan use Recharts directly, styled with the app's existing `--chart-1`/`--chart-2`/`--border`/`--muted-foreground` CSS variables (already defined in `globals.css` for exactly this purpose). This keeps the same visual result — themed bars, no hardcoded colors — without adding the extra abstraction layer.

**Tech Stack:** Adds `recharts`. Otherwise unchanged.

**Read first:** `docs/superpowers/specs/2026-09-12-budget-tracker-design.md` ("Account-balance rules" — liquid funds definition); `src/lib/account-balance.ts` (`computeAccountBalance`, reused unchanged); `src/lib/budget-allocations.ts` (`listAllocationsWithActuals`, reused unchanged for budget progress — this plan adds no new budget-calculation logic); `src/lib/category-actual.ts` (`computeCategoryActual`, reused unchanged for the spending-by-category report).

**Scope boundary — explicitly NOT in this plan:** moving Categories/Recurring into Settings or finishing the nav order (Plan 3B.4); accent-color/theme wiring (Plan 3B.4); any new schema, any change to how budget/category math already works.

---

### Task 1: Add the `recharts` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install recharts@^2.15.1
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: add recharts dependency for report charts"
```

---

### Task 2: Domain — `src/lib/liquid-funds.ts`

**Files:**
- Create: `src/lib/liquid-funds.ts`
- Test: `src/lib/liquid-funds.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/liquid-funds.test.ts
import { describe, expect, it, vi } from "vitest";
import { computeLiquidFunds } from "@/lib/liquid-funds";

function makeFakePrisma(options: { accounts?: unknown[]; balances?: Record<string, number> } = {}) {
  const accounts = options.accounts ?? [];
  const balances = options.balances ?? {};
  return {
    account: {
      findMany: vi.fn().mockResolvedValue(accounts),
      findUniqueOrThrow: vi.fn((args: { where: { id: string } }) =>
        Promise.resolve((accounts as any[]).find((a) => a.id === args.where.id)),
      ),
    },
    transaction: {
      findMany: vi.fn((args: { where: { accountId: string } }) => {
        const accountId = args.where.accountId;
        const balance = balances[accountId] ?? 0;
        return Promise.resolve(balance === 0 ? [] : [{ accountId, amount: balance }]);
      }),
    },
  } as any;
}

describe("computeLiquidFunds", () => {
  it("queries only eligible accounts and sums their balances", async () => {
    const accounts = [
      {
        id: "checking",
        openingBalance: 0,
      },
      {
        id: "savings",
        openingBalance: 0,
      },
    ];
    const prisma = makeFakePrisma({ accounts, balances: { checking: 50000, savings: 100000 } });

    const total = await computeLiquidFunds(prisma, "user-1");

    expect(total).toBe(150000);
    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        archivedAt: null,
        includeInLiquidFunds: true,
        accountType: { notIn: ["CREDIT_CARD", "LOAN"] },
      },
    });
  });

  it("returns 0 when there are no eligible accounts", async () => {
    const prisma = makeFakePrisma({ accounts: [] });

    const total = await computeLiquidFunds(prisma, "user-1");

    expect(total).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/liquid-funds.test.ts
```

Expected: FAIL — `src/lib/liquid-funds.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/liquid-funds.ts
import type { PrismaClient } from "@prisma/client";
import { computeAccountBalance } from "@/lib/account-balance";

// Credit and loan accounts are never "your money," even if includeInLiquidFunds
// was left on — same hard rule as src/lib/transfer-recommendations.ts, stated
// explicitly in the design spec's "Account-balance rules" section.
const EXCLUDED_FROM_LIQUID_FUNDS = ["CREDIT_CARD", "LOAN"];

export async function computeLiquidFunds(
  prisma: Pick<PrismaClient, "account" | "transaction">,
  userId: string,
): Promise<number> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      archivedAt: null,
      includeInLiquidFunds: true,
      accountType: { notIn: EXCLUDED_FROM_LIQUID_FUNDS },
    },
  });

  const balances = await Promise.all(
    accounts.map((account: { id: string }) => computeAccountBalance(prisma, account.id)),
  );

  return balances.reduce((sum, balance) => sum + balance, 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/liquid-funds.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add computeLiquidFunds domain function"
```

---

### Task 3: Domain — `src/lib/reports.ts`

**Files:**
- Create: `src/lib/reports.ts`
- Test: `src/lib/reports.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/reports.test.ts
import { describe, expect, it, vi } from "vitest";
import { incomeVsExpenseByPeriod, spendingByCategory } from "@/lib/reports";

describe("spendingByCategory", () => {
  it("returns actual spend per EXPENSE category, sorted highest first, excluding zero/negative", async () => {
    const prisma = {
      category: {
        findMany: vi.fn().mockResolvedValue([
          { id: "cat-groceries", name: "Groceries" },
          { id: "cat-rent", name: "Rent" },
          { id: "cat-unused", name: "Unused" },
        ]),
      },
      transaction: {
        findMany: vi.fn((args: { where: { categoryId: string } }) => {
          const categoryId = args.where.categoryId;
          if (categoryId === "cat-groceries") return Promise.resolve([{ accountId: "a", amount: -3200 }]);
          if (categoryId === "cat-rent") return Promise.resolve([{ accountId: "a", amount: -15000 }]);
          return Promise.resolve([]);
        }),
      },
    } as any;

    const result = await spendingByCategory(prisma, "user-1", "period-1");

    expect(result).toEqual([
      { categoryId: "cat-rent", categoryName: "Rent", amount: 15000 },
      { categoryId: "cat-groceries", categoryName: "Groceries", amount: 3200 },
    ]);
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", type: "EXPENSE", archivedAt: null },
    });
  });

  it("returns an empty array when no category has any spending", async () => {
    const prisma = {
      category: { findMany: vi.fn().mockResolvedValue([{ id: "cat-1", name: "Unused" }]) },
      transaction: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;

    const result = await spendingByCategory(prisma, "user-1", "period-1");

    expect(result).toEqual([]);
  });
});

describe("incomeVsExpenseByPeriod", () => {
  it("returns income and expense totals per period, oldest to newest", async () => {
    const prisma = {
      budgetPeriod: {
        findMany: vi.fn().mockResolvedValue([
          { id: "period-2", name: "Cycle 2" },
          { id: "period-1", name: "Cycle 1" },
        ]),
      },
      transaction: {
        findMany: vi.fn((args: { where: { budgetPeriodId: string } }) => {
          if (args.where.budgetPeriodId === "period-1") {
            return Promise.resolve([
              { type: "INCOME", amount: 35000 },
              { type: "EXPENSE", amount: -15000 },
            ]);
          }
          return Promise.resolve([
            { type: "INCOME", amount: 40000 },
            { type: "EXPENSE", amount: -20000 },
          ]);
        }),
      },
    } as any;

    const result = await incomeVsExpenseByPeriod(prisma, "user-1", 6);

    expect(result).toEqual([
      { periodId: "period-1", periodName: "Cycle 1", income: 35000, expense: 15000 },
      { periodId: "period-2", periodName: "Cycle 2", income: 40000, expense: 20000 },
    ]);
    expect(prisma.budgetPeriod.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { startDate: "desc" },
      take: 6,
    });
  });

  it("returns an empty array when there are no periods yet", async () => {
    const prisma = {
      budgetPeriod: { findMany: vi.fn().mockResolvedValue([]) },
      transaction: { findMany: vi.fn() },
    } as any;

    const result = await incomeVsExpenseByPeriod(prisma, "user-1", 6);

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/reports.test.ts
```

Expected: FAIL — `src/lib/reports.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
// src/lib/reports.ts
import type { PrismaClient } from "@prisma/client";
import { computeCategoryActual } from "@/lib/category-actual";

export type CategorySpending = { categoryId: string; categoryName: string; amount: number };

export async function spendingByCategory(
  prisma: Pick<PrismaClient, "category" | "transaction">,
  userId: string,
  budgetPeriodId: string,
): Promise<CategorySpending[]> {
  const categories = await prisma.category.findMany({
    where: { userId, type: "EXPENSE", archivedAt: null },
  });

  const results = await Promise.all(
    categories.map(async (category: { id: string; name: string }) => ({
      categoryId: category.id,
      categoryName: category.name,
      amount: await computeCategoryActual(prisma, budgetPeriodId, category.id),
    })),
  );

  return results.filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount);
}

export type PeriodTotals = { periodId: string; periodName: string; income: number; expense: number };

export async function incomeVsExpenseByPeriod(
  prisma: Pick<PrismaClient, "budgetPeriod" | "transaction">,
  userId: string,
  limit = 6,
): Promise<PeriodTotals[]> {
  const periods = await prisma.budgetPeriod.findMany({
    where: { userId },
    orderBy: { startDate: "desc" },
    take: limit,
  });

  const results = await Promise.all(
    periods.map(async (period: { id: string; name: string }) => {
      const transactions = await prisma.transaction.findMany({
        where: { budgetPeriodId: period.id },
      });
      const income = transactions
        .filter((t: { type: string }) => t.type === "INCOME")
        .reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
      const expense = transactions
        .filter((t: { type: string }) => t.type === "EXPENSE")
        .reduce((sum: number, t: { amount: number }) => sum + Math.abs(t.amount), 0);
      return { periodId: period.id, periodName: period.name, income, expense };
    }),
  );

  return results.reverse(); // oldest to newest, for left-to-right chart reading
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/reports.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add spendingByCategory and incomeVsExpenseByPeriod domain functions"
```

---

### Task 4: The Dashboard page

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Replace the placeholder**

```typescript
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { listAllocationsWithActuals } from "@/lib/budget-allocations";
import { listDuePayables } from "@/lib/payables";
import { listDueInstallmentPayments } from "@/lib/installment-purchases";
import { computeLiquidFunds } from "@/lib/liquid-funds";
import { formatMoney } from "@/lib/money";

const UPCOMING_WINDOW_DAYS = 7;

export default async function DashboardPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const now = new Date();
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + UPCOMING_WINDOW_DAYS);

  const activePeriod = await resolveBudgetPeriodForDate(prisma, user.id, now, user.cycleStartDay);

  const [liquidFunds, allocations, duePayables, dueInstallments] = await Promise.all([
    computeLiquidFunds(prisma, user.id),
    listAllocationsWithActuals(prisma, user.id, activePeriod.id),
    listDuePayables(prisma, user.id, horizon),
    listDueInstallmentPayments(prisma, user.id, horizon),
  ]);

  const totalPlanned = allocations.reduce((sum, a) => sum + a.effectivePlanned, 0);
  const totalActual = allocations.reduce((sum, a) => sum + a.actual, 0);
  const totalRemaining = totalPlanned - totalActual;

  const purchaseIds = [...new Set(dueInstallments.map((p) => p.installmentPurchaseId))];
  const purchases = purchaseIds.length
    ? await prisma.installmentPurchase.findMany({ where: { id: { in: purchaseIds } } })
    : [];

  const upcoming = [
    ...duePayables.map((p) => ({
      id: p.id,
      description: p.name,
      amount: p.amount,
      dueDate: p.dueDate,
    })),
    ...dueInstallments.map((p) => {
      const purchase = purchases.find((pu) => pu.id === p.installmentPurchaseId)!;
      return {
        id: p.id,
        description: `${purchase.name} (term ${p.termNumber} of ${purchase.numberOfTerms})`,
        amount: p.amount,
        dueDate: p.dueDate,
      };
    }),
  ].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Liquid funds</p>
          <p className="text-2xl font-semibold">{formatMoney(liquidFunds, user.currency)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Budgeted this cycle</p>
          <p className="text-2xl font-semibold">{formatMoney(totalPlanned, user.currency)}</p>
          <p className="text-sm text-muted-foreground">{formatMoney(totalActual, user.currency)} spent</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Remaining this cycle</p>
          <p className="text-2xl font-semibold">{formatMoney(totalRemaining, user.currency)}</p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Upcoming (next 7 days)</h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground">Nothing due soon.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                <p className="font-medium">{item.description}</p>
                <div className="text-right text-sm text-muted-foreground">
                  <p>{formatMoney(item.amount, user.currency)}</p>
                  <p>{item.dueDate.toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
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
git commit -m "feat: replace placeholder Dashboard with liquid funds, budget progress, and upcoming items"
```

---

### Task 5: The Reports page and charts

**Files:**
- Create: `src/components/reports/spending-by-category-chart.tsx`, `src/components/reports/income-vs-expense-chart.tsx`, `src/app/(app)/reports/page.tsx`
- Modify: `src/components/nav/top-nav.tsx`

- [ ] **Step 1: Implement `src/components/reports/spending-by-category-chart.tsx`**

```typescript
"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, toMajorUnits, toMinorUnits } from "@/lib/money";

type CategorySpending = { categoryId: string; categoryName: string; amount: number };

export function SpendingByCategoryChart({
  data,
  currency,
}: {
  data: CategorySpending[];
  currency: string;
}) {
  if (data.length === 0) {
    return <p className="text-muted-foreground">No spending recorded this cycle yet.</p>;
  }

  const chartData = data.map((d) => ({ name: d.categoryName, amount: toMajorUnits(d.amount, currency) }));

  return (
    <div className="h-72 w-full rounded-lg border p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
          <YAxis stroke="var(--muted-foreground)" fontSize={12} />
          <Tooltip
            formatter={(value: number) => formatMoney(toMinorUnits(value, currency), currency)}
            contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
          />
          <Bar dataKey="amount" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Implement `src/components/reports/income-vs-expense-chart.tsx`**

```typescript
"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, toMajorUnits, toMinorUnits } from "@/lib/money";

type PeriodTotals = { periodId: string; periodName: string; income: number; expense: number };

export function IncomeVsExpenseChart({
  data,
  currency,
}: {
  data: PeriodTotals[];
  currency: string;
}) {
  if (data.length === 0) {
    return <p className="text-muted-foreground">No budget periods yet.</p>;
  }

  const chartData = data.map((d) => ({
    name: d.periodName,
    income: toMajorUnits(d.income, currency),
    expense: toMajorUnits(d.expense, currency),
  }));

  return (
    <div className="h-72 w-full rounded-lg border p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
          <YAxis stroke="var(--muted-foreground)" fontSize={12} />
          <Tooltip
            formatter={(value: number) => formatMoney(toMinorUnits(value, currency), currency)}
            contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
          />
          <Legend />
          <Bar dataKey="income" name="Income" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Expense" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Implement `src/app/(app)/reports/page.tsx`**

```typescript
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveBudgetPeriodForDate } from "@/lib/budget-period";
import { incomeVsExpenseByPeriod, spendingByCategory } from "@/lib/reports";
import { SpendingByCategoryChart } from "@/components/reports/spending-by-category-chart";
import { IncomeVsExpenseChart } from "@/components/reports/income-vs-expense-chart";

export default async function ReportsPage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session!.user.id } });

  const activePeriod = await resolveBudgetPeriodForDate(prisma, user.id, new Date(), user.cycleStartDay);

  const [spending, periodTotals] = await Promise.all([
    spendingByCategory(prisma, user.id, activePeriod.id),
    incomeVsExpenseByPeriod(prisma, user.id, 6),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Reports</h1>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Spending by category (this cycle)</h2>
        <SpendingByCategoryChart data={spending} currency={user.currency} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Income vs. expense (last 6 cycles)</h2>
        <IncomeVsExpenseChart data={periodTotals} currency={user.currency} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the nav link**

In `src/components/nav/top-nav.tsx`, add `{ href: "/reports", label: "Reports" }` to the `links` array, after `"Loans & Cards"` and before `"Recurring"`:

```typescript
const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budget", label: "Budget" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
  { href: "/bills", label: "Bills" },
  { href: "/loans-cards", label: "Loans & Cards" },
  { href: "/reports", label: "Reports" },
  { href: "/recurring", label: "Recurring" },
  { href: "/settings", label: "Settings" },
];
```

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Reports page with spending-by-category and income-vs-expense charts"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (existing 193 plus this plan's new tests — 2 liquid funds + 4 reports = 6 new tests, 199 total).

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Browser walkthrough**

Start the dev server, log in as `demo@example.com` / `demopassword123`, and manually verify (fixing any real bug found, then re-running Steps 1–2):

- Dashboard loads with a liquid-funds figure — cross-check it by hand against the Accounts page (sum of non-`CREDIT_CARD`/`LOAN` account balances) to confirm it matches exactly.
- Confirm "Budgeted this cycle" / "spent" / "Remaining this cycle" match what the Budget page shows for the current period's totals.
- Create a test bill due within 7 days (via the Bills page) — confirm it appears in the Dashboard's "Upcoming" list with the right amount and date; confirm a due installment term (create a short test installment purchase if none exists) also appears there, correctly labeled with its term number.
- Reports page loads; confirm "Spending by category" shows a bar per category with spending this cycle, tallest first, and hovering a bar shows the correct formatted amount in the tooltip.
- Confirm "Income vs. expense" shows one grouped pair of bars per recent budget period, oldest cycle on the left; hovering shows correct income/expense amounts.
- Confirm "Reports" appears in the top nav in the right place.
- Clean up any test data created during this walkthrough (delete the test bill/installment purchase and its transactions) the same way prior plans' verification steps have.

- [ ] **Step 4: Confirm a clean working tree**

```bash
git status --short
```

Expected: no output (everything already committed; verification found no code changes needed, or any fix was committed above).
